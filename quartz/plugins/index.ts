import { StaticResources } from "../util/resources"
import { BuildCtx } from "../util/ctx"

export function getStaticResourcesFromPlugins(ctx: BuildCtx) {
  const staticResources: StaticResources = {
    css: [],
    js: [],
    additionalHead: [],
  }

  for (const transformer of [...ctx.cfg.plugins.transformers, ...ctx.cfg.plugins.emitters]) {
    const res = transformer.externalResources ? transformer.externalResources(ctx) : {}
    if (res?.js) {
      staticResources.js.push(...res.js)
    }
    if (res?.css) {
      staticResources.css.push(...res.css)
    }
    if (res?.additionalHead) {
      staticResources.additionalHead.push(...res.additionalHead)
    }
    if (res?.assets) {
      ;(staticResources.assets ??= []).push(...res.assets)
    }
  }

  // if serving locally, listen for rebuilds and reload the page
  if (ctx.argv.serve) {
    const wsHost = ctx.argv.remoteDevHost || "localhost"

    staticResources.js.push({
      loadTime: "afterDOMReady",
      contentType: "inline",
      // One socket per page load (SPA navigation re-runs this script). Reconnect after the socket
      // drops (server restart, Mac sleep, suspended tab) and reload then, since rebuilds may have been missed.
      script: `
        if (!window.__quartzLiveReload) {
          window.__quartzLiveReload = true
          let dropped = false
          // A rebuild re-renders the current page in place through the SPA router (it only patches document.body),
          // so open popups mounted outside body and typed text survive. A reconnect after a server restart still
          // does a full reload, since scripts and styles may have changed.
          const hardReload = () => document.location.reload(true)
          const softRefresh = () => {
            // the prefetch cache keeps pages for 5 minutes: without this the refresh re-renders the old page
            if (window.quartzPrefetch && window.quartzPrefetch.invalidate) window.quartzPrefetch.invalidate()
            if (window.spaNavigate) window.spaNavigate(new URL(location.href), true).catch(hardReload)
            else hardReload()
          }
          // the dev server speaks plain ws unless it sits behind a TLS proxy,
          // so follow the page instead of assuming
          const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:"
          const connect = () => {
            const socket = new WebSocket(\`\${wsProtocol}//${wsHost}:${ctx.argv.wsPort}\`)
            socket.addEventListener('message', softRefresh)
            socket.addEventListener('open', () => {
              if (dropped) hardReload()
            })
            socket.addEventListener('close', () => {
              dropped = true
              setTimeout(connect, 2000)
            })
          }
          connect()
        }
      `,
    })
  }

  return staticResources
}

export * from "./transformers"
export * from "./filters"
export * from "./emitters"
export * from "./types"
export * from "./config"
export * as PageTypes from "./pageTypes"
export * as PluginLoader from "./loader"
