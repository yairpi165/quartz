import test, { describe } from "node:test"
import assert from "node:assert"
import http from "http"
import { EventEmitter } from "events"
import { handleQaApi, isAllowedAddress, isAllowedHost, isAllowedOrigin } from "./qa-api.js"

const PORT = 8484

function serve(run) {
  const calls = []
  const server = http.createServer(async (req, res) => {
    const handled = await handleQaApi(req, res, {
      port: PORT,
      call: async (c) => {
        calls.push(c)
        return run(c)
      },
    })
    if (!handled) {
      res.writeHead(404)
      res.end("static")
    }
  })
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve({ server, calls, port: server.address().port })),
  )
}

function call(port, method, path, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, method, path, headers: { host: `localhost:${PORT}`, ...headers } },
      (res) => {
        let data = ""
        res.on("data", (c) => (data += c))
        res.on("end", () => resolve({ status: res.statusCode, body: data }))
      },
    )
    req.on("error", reject)
    if (body !== undefined) req.write(typeof body === "string" ? body : JSON.stringify(body))
    req.end()
  })
}

const okOrigin = { origin: `http://localhost:${PORT}`, "content-type": "application/json" }
const ok = async () => ({ status: 200, json: { id: "CV-1", status: "done" } })

describe("address and origin rules", () => {
  test("loopback and Tailscale addresses only", () => {
    for (const a of [
      "127.0.0.1",
      "::1",
      "::ffff:127.0.0.1",
      "100.64.0.1",
      "100.111.129.1",
      "100.127.255.255",
      "fd7a:115c:a1e0::5",
      "fd7a:115c:a1e0:ab12::1",
    ])
      assert.ok(isAllowedAddress(a), a)
    for (const a of [
      "192.168.1.20",
      "10.0.0.5",
      "100.63.1.1",
      "100.128.0.1",
      "8.8.8.8",
      "::ffff:192.168.1.5",
      "fe80::1",
      "fd7a:115c:a1e1::1",
      "",
      undefined,
    ])
      assert.ok(!isAllowedAddress(a), String(a))
  })
  test("hosts and origins are this machine's names on the site port", () => {
    assert.ok(isAllowedHost("localhost:8484"))
    assert.ok(isAllowedHost("yairs-macbook-pro.tail0abd3f.ts.net:8484"))
    assert.ok(!isAllowedHost("evil.example.com"))
    assert.ok(isAllowedOrigin("http://100.111.129.1:8484", 8484))
    assert.ok(isAllowedOrigin("http://yairs-macbook-pro.tail0abd3f.ts.net:8484", 8484))
    assert.ok(!isAllowedOrigin("http://localhost:9999", 8484))
    assert.ok(!isAllowedOrigin("https://evil.example.com", 8484))
    assert.ok(!isAllowedOrigin(undefined, 8484))
  })
})

describe("remote address gate", () => {
  function fakeReq(addr) {
    const req = new EventEmitter()
    Object.assign(req, {
      url: "/api/qa/mark",
      method: "POST",
      socket: { remoteAddress: addr },
      headers: {
        host: `localhost:${PORT}`,
        origin: `http://localhost:${PORT}`,
        "content-type": "application/json",
      },
    })
    return req
  }
  function fakeRes() {
    return {
      status: 0,
      body: "",
      writeHead(s) {
        this.status = s
      },
      end(b) {
        this.body = b
      },
    }
  }
  test("a LAN address gets 403 and nothing runs", async () => {
    for (const addr of ["192.168.1.20", "::ffff:10.0.0.9", "2001:db8::1", undefined]) {
      let ran = false
      const res = fakeRes()
      const handled = await handleQaApi(fakeReq(addr), res, {
        port: PORT,
        call: async () => ((ran = true), { status: 200, json: {} }),
      })
      assert.ok(handled)
      assert.strictEqual(res.status, 403, String(addr))
      assert.strictEqual(ran, false)
    }
  })
  test("GET list from a LAN address is 403 too", async () => {
    const req = fakeReq("192.168.1.20")
    req.method = "GET"
    req.url = "/api/qa"
    const res = fakeRes()
    await handleQaApi(req, res, { port: PORT, call: async () => assert.fail("must not run") })
    assert.strictEqual(res.status, 403)
  })
})

describe("api over loopback", () => {
  test("other paths are not handled", async () => {
    const s = await serve(ok)
    try {
      const r = await call(s.port, "GET", "/Projects/x")
      assert.strictEqual(r.body, "static")
    } finally {
      s.server.close()
    }
  })
  test("GET lists, passing area; bad area 400; foreign Origin 403; foreign Host 403", async () => {
    const s = await serve(async () => ({ status: 200, json: { tasks: [] } }))
    try {
      let r = await call(s.port, "GET", "/api/qa?area=Claude%20Vault")
      assert.deepStrictEqual([r.status, JSON.parse(r.body)], [200, { tasks: [] }])
      assert.deepStrictEqual(s.calls[0], { method: "GET", path: "/qa?area=Claude%20Vault" })
      r = await call(s.port, "GET", "/api/qa?area=..%2Fx")
      assert.strictEqual(r.status, 400)
      r = await call(s.port, "GET", "/api/qa", { headers: { origin: "https://evil.example.com" } })
      assert.strictEqual(r.status, 403)
      r = await call(s.port, "GET", "/api/qa", { headers: { host: "evil.example.com" } })
      assert.strictEqual(r.status, 403)
      assert.strictEqual(s.calls.length, 1)
    } finally {
      s.server.close()
    }
  })
  test("GET /api/e2e proxies to /e2e with the same guards; POST is refused", async () => {
    const s = await serve(async () => ({ status: 200, json: { tasks: [{ id: "V-1" }] } }))
    try {
      let r = await call(s.port, "GET", "/api/e2e?area=vela")
      assert.deepStrictEqual([r.status, JSON.parse(r.body)], [200, { tasks: [{ id: "V-1" }] }])
      assert.deepStrictEqual(s.calls[0], { method: "GET", path: "/e2e?area=vela" })
      r = await call(s.port, "GET", "/api/e2e")
      assert.deepStrictEqual(s.calls[1], { method: "GET", path: "/e2e" })
      r = await call(s.port, "GET", "/api/e2e?area=..%2Fx")
      assert.strictEqual(r.status, 400)
      r = await call(s.port, "GET", "/api/e2e", { headers: { origin: "https://evil.example.com" } })
      assert.strictEqual(r.status, 403)
      r = await call(s.port, "GET", "/api/e2e", { headers: { host: "evil.example.com" } })
      assert.strictEqual(r.status, 403)
      r = await call(s.port, "POST", "/api/e2e", { body: {} })
      assert.strictEqual(r.status, 405)
      assert.strictEqual(s.calls.length, 2)
    } finally {
      s.server.close()
    }
  })
  test("GET /api/sim proxies to /sim read-only with the same guards (CV-22)", async () => {
    const s = await serve(async () => ({
      status: 200,
      json: { tasks: [{ id: "V-1", sim: 1, device: 2 }] },
    }))
    try {
      let r = await call(s.port, "GET", "/api/sim?area=vela")
      assert.deepStrictEqual(
        [r.status, JSON.parse(r.body)],
        [200, { tasks: [{ id: "V-1", sim: 1, device: 2 }] }],
      )
      assert.deepStrictEqual(s.calls[0], { method: "GET", path: "/sim?area=vela" })
      r = await call(s.port, "GET", "/api/sim", { headers: { host: "evil.example.com" } })
      assert.strictEqual(r.status, 403)
      r = await call(s.port, "POST", "/api/sim", { body: {} })
      assert.strictEqual(r.status, 405)
      assert.strictEqual(s.calls.length, 1)
    } finally {
      s.server.close()
    }
  })
  test("POST pass and fail call the service with exact bodies", async () => {
    const s = await serve(ok)
    try {
      let r = await call(s.port, "POST", "/api/qa/mark", {
        headers: okOrigin,
        body: { id: "CV-14", verdict: "pass" },
      })
      assert.strictEqual(r.status, 200)
      r = await call(s.port, "POST", "/api/qa/mark", {
        headers: okOrigin,
        body: { id: "VELA-121", verdict: "fail", reason: "--evil; rm -rf" },
      })
      assert.strictEqual(r.status, 200)
      assert.deepStrictEqual(s.calls, [
        { method: "POST", path: "/qa/mark", json: { id: "CV-14", verdict: "pass" } },
        {
          method: "POST",
          path: "/qa/mark",
          json: { id: "VELA-121", verdict: "fail", reason: "--evil; rm -rf" },
        },
      ])
    } finally {
      s.server.close()
    }
  })
  test("POST validation: origin, content type, JSON, id, verdict, reason", async () => {
    const s = await serve(ok)
    try {
      const post = (headers, body) => call(s.port, "POST", "/api/qa/mark", { headers, body })
      assert.strictEqual(
        (await post({ "content-type": "application/json" }, { id: "CV-1", verdict: "pass" }))
          .status,
        403,
      ) // no Origin
      assert.strictEqual(
        (
          await post(
            { origin: "https://evil.example.com", "content-type": "application/json" },
            { id: "CV-1", verdict: "pass" },
          )
        ).status,
        403,
      )
      assert.strictEqual(
        (
          await post(
            { origin: okOrigin.origin, "content-type": "text/plain" },
            { id: "CV-1", verdict: "pass" },
          )
        ).status,
        415,
      )
      assert.strictEqual((await post(okOrigin, "{nope")).status, 400)
      assert.strictEqual((await post(okOrigin, { id: "cv-1; ls", verdict: "pass" })).status, 400)
      assert.strictEqual((await post(okOrigin, { id: "CV-1", verdict: "maybe" })).status, 400)
      assert.strictEqual(
        (await post(okOrigin, { id: "CV-1", verdict: "fail", reason: "   " })).status,
        400,
      )
      assert.strictEqual((await post(okOrigin, { id: "CV-1", verdict: "fail" })).status, 400)
      assert.strictEqual((await call(s.port, "GET", "/api/qa/mark")).status, 405)
      assert.strictEqual(s.calls.length, 0)
    } finally {
      s.server.close()
    }
  })
  test("service answers are passed through; a crash is 500", async () => {
    const s1 = await serve(async () => ({
      status: 409,
      json: { error: 'PR-1 is now "done", not qa' },
    }))
    const s2 = await serve(async () => ({ status: 502, json: { error: "down" } }))
    const s3 = await serve(async () => {
      throw new Error("boom")
    })
    try {
      const b = { headers: okOrigin, body: { id: "CV-1", verdict: "pass" } }
      let r = await call(s1.port, "POST", "/api/qa/mark", b)
      assert.deepStrictEqual(
        [r.status, JSON.parse(r.body).error],
        [409, 'PR-1 is now "done", not qa'],
      )
      assert.strictEqual((await call(s2.port, "POST", "/api/qa/mark", b)).status, 502)
      assert.strictEqual((await call(s3.port, "POST", "/api/qa/mark", b)).status, 500)
    } finally {
      s1.server.close()
      s2.server.close()
      s3.server.close()
    }
  })
  test("callService reaches the real service and reports 502 when it is down", async () => {
    const svc = http.createServer((req, res) => {
      let b = ""
      req.on("data", (c) => (b += c))
      req.on("end", () => {
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ got: req.method + " " + req.url, b }))
      })
    })
    await new Promise((r) => svc.listen(0, "127.0.0.1", r))
    process.env.QA_SERVICE_PORT = String(svc.address().port)
    const live = (await import("./qa-api.js")).callService
    try {
      const r = await live({ method: "POST", path: "/qa/mark", json: { id: "A-1" } })
      assert.deepStrictEqual(r.json, { got: "POST /qa/mark", b: '{"id":"A-1"}' })
      svc.close()
      const down = await live({ method: "GET", path: "/qa" })
      assert.strictEqual(down.status, 502)
    } finally {
      delete process.env.QA_SERVICE_PORT
      svc.close()
    }
  })
})
