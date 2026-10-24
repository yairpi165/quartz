import fs from "fs/promises"
import path from "path"

export type ReconcileEvent = { path: string; type: "add" | "change" | "delete" }

type Signature = string

export interface ReconcilerOptions {
  /** Directory to scan (symlinks at the root are followed). */
  root: string
  /** Receives a posix path relative to root; true skips the file or directory. */
  ignored: (relPath: string) => boolean
  /** Called for a difference no file watcher reported. */
  onMiss: (event: ReconcileEvent) => void
  /** Directory names never entered. */
  skipDirs?: string[]
}

const DEFAULT_SKIP_DIRS = [".git", "node_modules", "public"]

/**
 * Safety net for file watchers that silently lose a file (e.g. a long-lived per-file watcher after
 * the file was replaced by write-temp-and-rename). It keeps a (inode, mtime, size) snapshot of the
 * tree. Each scan() compares the tree with it. A difference is reported through onMiss only when
 *  - it was already seen by the previous scan too (so a write in progress or a watcher event still
 *    on its way is not a miss), and
 *  - no watcher event for that path arrived since the previous scan (noteWatcherEvent).
 */
export class Reconciler {
  private snapshot = new Map<string, Signature>()
  private candidates = new Map<string, Signature>()
  private watcherSeen = new Map<string, number>()
  private prevScanStart = 0
  private initialised = false
  private readonly skipDirs: Set<string>

  constructor(private readonly opts: ReconcilerOptions) {
    this.skipDirs = new Set(opts.skipDirs ?? DEFAULT_SKIP_DIRS)
  }

  /** Call for every add/change/unlink the real watcher reports. */
  noteWatcherEvent(relPath: string) {
    this.watcherSeen.set(relPath, Date.now())
  }

  async scan(): Promise<ReconcileEvent[]> {
    const scanStart = Date.now()
    const current = new Map<string, Signature>()
    await this.walk("", current)

    const missed: ReconcileEvent[] = []
    if (!this.initialised) {
      this.snapshot = current
      this.initialised = true
      this.prevScanStart = scanStart
      return missed
    }

    const diffs = new Map<string, { type: ReconcileEvent["type"]; sig: Signature }>()
    for (const [p, sig] of current) {
      const old = this.snapshot.get(p)
      if (old === undefined) diffs.set(p, { type: "add", sig })
      else if (old !== sig) diffs.set(p, { type: "change", sig })
    }
    for (const p of this.snapshot.keys()) {
      if (!current.has(p)) diffs.set(p, { type: "delete", sig: "deleted" })
    }

    const nextCandidates = new Map<string, Signature>()
    for (const [p, { type, sig }] of diffs) {
      const seenAt = this.watcherSeen.get(p)
      if (seenAt !== undefined && seenAt >= this.prevScanStart) {
        // the watcher reported it: just move the snapshot forward
        this.accept(p, sig, current)
        continue
      }
      if (this.candidates.get(p) === sig) {
        missed.push({ path: p, type })
        this.accept(p, sig, current)
      } else {
        nextCandidates.set(p, sig)
      }
    }
    this.candidates = nextCandidates
    this.prevScanStart = scanStart

    // watcher bookkeeping must not grow forever
    const cutoff = scanStart - 60_000
    for (const [p, at] of this.watcherSeen) if (at < cutoff) this.watcherSeen.delete(p)

    for (const ev of missed) this.opts.onMiss(ev)
    return missed
  }

  private accept(p: string, sig: Signature, current: Map<string, Signature>) {
    if (current.has(p)) this.snapshot.set(p, sig)
    else this.snapshot.delete(p)
  }

  private async walk(rel: string, out: Map<string, Signature>) {
    const abs = rel ? path.join(this.opts.root, rel) : this.opts.root
    let entries
    try {
      entries = await fs.readdir(abs, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        if (this.skipDirs.has(entry.name) || this.opts.ignored(childRel)) continue
        await this.walk(childRel, out)
      } else if (entry.isFile()) {
        if (this.opts.ignored(childRel)) continue
        try {
          const st = await fs.stat(path.join(abs, entry.name))
          out.set(childRel, `${st.ino}:${st.mtimeMs}:${st.size}`)
        } catch {
          // vanished between readdir and stat: the next scan sees it as deleted
        }
      }
    }
  }
}
