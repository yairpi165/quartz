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
  }

  // if serving locally, listen for rebuilds and reload the page
  if (ctx.argv.serve) {
    const wsUrl = ctx.argv.remoteDevHost
      ? `wss://${ctx.argv.remoteDevHost}:${ctx.argv.wsPort}`
      : `ws://localhost:${ctx.argv.wsPort}`

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
            if (window.spaNavigate) window.spaNavigate(new URL(location.href), true).catch(hardReload)
            else hardReload()
          }
          const connect = () => {
            const socket = new WebSocket('${wsUrl}')
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
