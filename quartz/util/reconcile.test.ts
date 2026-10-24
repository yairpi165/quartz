import test from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"
import { execFileSync } from "child_process"
import { Reconciler, ReconcileEvent } from "./reconcile"

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "reconcile-"))
  fs.mkdirSync(path.join(root, "Tasks"))
  fs.writeFileSync(path.join(root, "Tasks", "a.md"), "status: todo\n")
  fs.writeFileSync(path.join(root, "Tasks", "b.md"), "status: todo\n")
  const missed: ReconcileEvent[] = []
  const r = new Reconciler({
    root,
    ignored: (p) => p.startsWith(".obsidian"),
    onMiss: (e) => missed.push(e),
  })
  return { root, r, missed }
}

const wait = (ms: number) => new Promise((res) => setTimeout(res, ms))

// A miss is confirmed by the second scan that sees the same difference.
async function scanTwice(r: Reconciler) {
  await r.scan()
  await wait(5)
  return r.scan()
}

test("sed -i style replacement nobody reported is caught", async () => {
  const { root, r, missed } = setup()
  await r.scan()
  execFileSync("sed", ["-i", "", "s/todo/done/", path.join(root, "Tasks", "a.md")])
  await scanTwice(r)
  assert.deepEqual(missed, [{ path: "Tasks/a.md", type: "change" }])
})

test("write temp + rename (os.replace, vim, Obsidian) is caught", async () => {
  const { root, r, missed } = setup()
  await r.scan()
  fs.writeFileSync(path.join(root, "Tasks", "a.tmp"), "status: done\n")
  fs.renameSync(path.join(root, "Tasks", "a.tmp"), path.join(root, "Tasks", "a.md"))
  await scanTwice(r)
  assert.deepEqual(missed, [{ path: "Tasks/a.md", type: "change" }])
})

test("same-size, same-mtime replacement is still seen through the inode", async () => {
  const { root, r, missed } = setup()
  await r.scan()
  const f = path.join(root, "Tasks", "a.md")
  const { mtime, atime } = fs.statSync(f)
  fs.writeFileSync(f + ".tmp", "status: done\n".slice(0, "status: todo\n".length))
  fs.utimesSync(f + ".tmp", atime, mtime)
  fs.renameSync(f + ".tmp", f)
  await scanTwice(r)
  assert.equal(missed.length, 1)
})

test("appends, adds and deletes nobody reported are caught", async () => {
  const { root, r, missed } = setup()
  await r.scan()
  fs.appendFileSync(path.join(root, "Tasks", "a.md"), "more\n")
  fs.writeFileSync(path.join(root, "Tasks", "c.md"), "new\n")
  fs.unlinkSync(path.join(root, "Tasks", "b.md"))
  await scanTwice(r)
  const got = missed.map((e) => `${e.type}:${e.path}`).sort()
  assert.deepEqual(got, ["add:Tasks/c.md", "change:Tasks/a.md", "delete:Tasks/b.md"])
})

test("a change the real watcher reported is not a miss", async () => {
  const { root, r, missed } = setup()
  await r.scan()
  await wait(5)
  fs.appendFileSync(path.join(root, "Tasks", "a.md"), "more\n")
  r.noteWatcherEvent("Tasks/a.md")
  await scanTwice(r)
  assert.deepEqual(missed, [])
})

test("a difference seen once and gone is not reported (write in progress)", async () => {
  const { root, r, missed } = setup()
  await r.scan()
  const f = path.join(root, "Tasks", "a.md")
  const before = fs.readFileSync(f)
  fs.appendFileSync(f, "partial")
  await r.scan()
  fs.writeFileSync(f, before) // content restored but a new mtime: a different difference
  await r.scan()
  assert.deepEqual(missed, [])
})

test("a miss is reported once, not on every scan", async () => {
  const { root, r, missed } = setup()
  await r.scan()
  fs.appendFileSync(path.join(root, "Tasks", "a.md"), "more\n")
  await scanTwice(r)
  await r.scan()
  await r.scan()
  assert.equal(missed.length, 1)
})

test("ignored paths and skipped directories are not scanned", async () => {
  const { root, r, missed } = setup()
  fs.mkdirSync(path.join(root, ".obsidian"))
  fs.mkdirSync(path.join(root, "node_modules"))
  fs.writeFileSync(path.join(root, ".obsidian", "x.json"), "{}")
  fs.writeFileSync(path.join(root, "node_modules", "y.js"), "1")
  await r.scan()
  fs.appendFileSync(path.join(root, ".obsidian", "x.json"), " ")
  fs.appendFileSync(path.join(root, "node_modules", "y.js"), "2")
  await scanTwice(r)
  assert.deepEqual(missed, [])
})
