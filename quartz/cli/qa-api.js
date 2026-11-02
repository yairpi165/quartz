// QA review API of the boards site (CV-14): the popup lists the tasks in `qa` and passes or fails them.
// Both calls are proxied to the local `vault qa serve` service (127.0.0.1:8485), which holds the board lock,
// edits only the named frontmatter lines and validates the result (claude-vault src/lib/qa.py). A subprocess
// per request is not an option: spawning from the quartz server process fails with EBADF (it holds ~14k
// watcher file descriptors). This file only guards the door:
//   - the site listens on all interfaces, so the socket's remote address must be loopback or Tailscale;
//   - Host must be one of this machine's names (DNS rebinding), a POST must carry an allowed Origin and
//     application/json (CSRF).
import http from "http"

const TASK_ID = /^[A-Z][A-Z0-9]{1,9}-[1-9][0-9]*$/
const AREA = /^[^\0/\\]{1,100}$/
const MAX_BODY = 8 * 1024
const HOSTS = [
  "localhost",
  "127.0.0.1",
  "[::1]",
  "100.111.129.1", // this Mac's Tailscale address
  "yairs-macbook-pro", // MagicDNS short name
  "yairs-macbook-pro.tail0abd3f.ts.net",
]

export function isAllowedAddress(addr) {
  if (!addr) return false
  let a = addr.toLowerCase()
  if (a.startsWith("::ffff:")) a = a.slice(7)
  if (a === "::1" || a === "127.0.0.1" || /^127\.\d+\.\d+\.\d+$/.test(a)) return true
  const m = /^100\.(\d+)\.\d+\.\d+$/.exec(a) // Tailscale 100.64.0.0/10
  if (m) return Number(m[1]) >= 64 && Number(m[1]) <= 127
  return a.startsWith("fd7a:115c:a1e0:") // Tailscale fd7a:115c:a1e0::/48
}

export function isAllowedHost(host) {
  if (!host) return false
  const h = host.toLowerCase().replace(/:\d+$/, "")
  return HOSTS.includes(h)
}

export function isAllowedOrigin(origin, port) {
  if (!origin) return false
  return HOSTS.some((h) => origin.toLowerCase() === `http://${h}:${port}`)
}

const serviceAddr = () => ({ host: "127.0.0.1", port: Number(process.env.QA_SERVICE_PORT) || 8485 })

/** One call to the QA service: {status, json}; status 502 when it is not running. */
export function callService({ method, path, json }) {
  return new Promise((resolve) => {
    const body = json === undefined ? undefined : JSON.stringify(json)
    const req = http.request(
      {
        ...serviceAddr(),
        method,
        path,
        timeout: 15000,
        headers:
          body === undefined
            ? {}
            : { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      },
      (res) => {
        let data = ""
        res.setEncoding("utf8")
        res.on("data", (c) => (data += c))
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(data) })
          } catch {
            resolve({ status: 502, json: { error: "שירות ה-QA החזיר תשובה לא תקינה" } })
          }
        })
      },
    )
    req.on("timeout", () => req.destroy(new Error("timeout")))
    req.on("error", () => resolve({ status: 502, json: { error: "שירות ה-QA לא פועל" } }))
    if (body !== undefined) req.write(body)
    req.end()
  })
}

function send(res, status, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on("data", (c) => {
      size += c.length
      if (size > MAX_BODY) {
        reject(new Error("body too large"))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    req.on("error", reject)
  })
}

/** Handles /api/qa*, plus the read-only /api/e2e list (CV-18); returns true when the request was its. Never throws. */
export async function handleQaApi(req, res, { port, call = callService } = {}) {
  const url = new URL(req.url || "/", "http://x")
  if (url.pathname !== "/api/qa" && url.pathname !== "/api/qa/mark" && url.pathname !== "/api/e2e")
    return false
  try {
    if (!isAllowedAddress(req.socket && req.socket.remoteAddress))
      return (send(res, 403, { error: "forbidden" }), true)
    if (!isAllowedHost(req.headers.host)) return (send(res, 403, { error: "forbidden host" }), true)
    if (url.pathname === "/api/qa" || url.pathname === "/api/e2e") {
      if (req.method !== "GET") return (send(res, 405, { error: "method not allowed" }), true)
      const origin = req.headers.origin
      if (origin && !isAllowedOrigin(origin, port))
        return (send(res, 403, { error: "forbidden origin" }), true)
      const area = url.searchParams.get("area")
      if (area && !AREA.test(area)) return (send(res, 400, { error: "bad area" }), true)
      const r = await call({
        method: "GET",
        path: (url.pathname === "/api/e2e" ? "/e2e" : "/qa") + (area ? "?area=" + encodeURIComponent(area) : ""),
      })
      return (send(res, r.status, r.json), true)
    }
    if (req.method !== "POST") return (send(res, 405, { error: "method not allowed" }), true)
    if (!isAllowedOrigin(req.headers.origin, port))
      return (send(res, 403, { error: "forbidden origin" }), true)
    if (!/^application\/json\b/i.test(req.headers["content-type"] || ""))
      return (send(res, 415, { error: "content-type must be application/json" }), true)
    let payload
    try {
      payload = JSON.parse(await readBody(req))
    } catch {
      return (send(res, 400, { error: "bad JSON body" }), true)
    }
    const { id, verdict, reason } = payload || {}
    if (typeof id !== "string" || !TASK_ID.test(id))
      return (send(res, 400, { error: "bad task id" }), true)
    if (verdict !== "pass" && verdict !== "fail")
      return (send(res, 400, { error: "bad verdict" }), true)
    if (verdict === "fail" && (typeof reason !== "string" || !reason.trim()))
      return (send(res, 400, { error: "הסיבה חובה כשהבדיקה לא עברה" }), true)
    const r = await call({
      method: "POST",
      path: "/qa/mark",
      json: { id, verdict, ...(verdict === "fail" ? { reason } : {}) },
    })
    return (send(res, r.status, r.json), true)
  } catch (err) {
    console.error("[qa-api]", err && err.message)
    try {
      send(res, 500, { error: "internal error" })
    } catch {}
    return true
  }
}
