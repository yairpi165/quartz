import { QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"

// QA review (CV-14): a button next to the sidebar toggle opens a popup with every task in `qa`, its
// Hebrew "what to check" list and Pass / Fail. Pass -> done; Fail needs a reason -> reopened. The data and
// the writes go through /api/qa (quartz/cli/qa-api.js -> `vault qa`), so the list is always current, and the
// board itself refreshes through the file watcher. Everything the API returns is inserted as text.
function QaButton({ displayClass }: QuartzComponentProps) {
  return (
    <button
      type="button"
      class={classNames(displayClass, "boards-qa-button")}
      aria-label="בדיקות QA"
      title="בדיקות QA"
    >
      QA<span class="boards-qa-count" hidden></span>
    </button>
  )
}

QaButton.afterDOMLoaded = `
if (!window.__boardsQa) {
  window.__boardsQa = true
  const el = (tag, cls, text) => {
    const n = document.createElement(tag)
    if (cls) n.className = cls
    if (text !== undefined) n.textContent = text
    return n
  }
  const slug = (s) => s.trim().replace(/\\s+/g, "-").replace(/[?#]/g, "").toLowerCase()
  // On a board page only that board's tasks; anywhere else (home, a note) all boards'. Same rule as the E2E popup.
  const scoped = (tasks) => {
    const here = decodeURIComponent(location.pathname).toLowerCase()
    const mine = tasks.filter((t) => here.includes("/" + slug(t.area) + "/") || here.includes("/" + slug(t.area) + "-board"))
    return mine.length ? mine : tasks.filter(() => !/\\/projects\\//.test(here))
  }
  const api = async (path, opts) => {
    const res = await fetch(path, Object.assign({ cache: "no-store" }, opts))
    let data = {}
    try { data = await res.json() } catch (e) {}
    if (!res.ok) throw new Error(data.error || "שגיאה " + res.status)
    return data
  }
  const setCount = (n) => {
    document.querySelectorAll(".boards-qa-count").forEach((b) => {
      b.textContent = String(n)
      b.hidden = false
      const btn = b.closest(".boards-qa-button")
      if (btn) btn.classList.toggle("boards-zero", !n)
    })
  }
  const refreshCount = () => api("/api/qa").then((d) => setCount(scoped(d.tasks).length)).catch(() => {})

  let overlay = null
  // The list has its own history entry ({boardsList}), so the browser / phone back gesture closes it and a
  // task opened from it comes back to it (TaskPopup's popstate hook drives the restore).
  const closeUI = () => {
    if (overlay) overlay.remove()
    overlay = null
    refreshCount()
  }
  const close = () => {
    if (history.state && history.state.boardsList === "qa" && !history.state.boardsTask) history.back()
    else closeUI()
  }

  // A check is often one long line: "(build tag) 1) do X. צריך לראות: Y. 2) do Z. ...". Split it into
  // numbered steps and set the expected result of each on its own line. Plain text stays plain.
  const EXPECT = "צריך לראות:"
  const stepNode = (text) => {
    const li = el("li", "qa-step")
    const at = text.indexOf(EXPECT)
    if (at < 0) {
      li.textContent = text
      return li
    }
    li.appendChild(document.createTextNode(text.slice(0, at).trim()))
    const exp = el("div", "qa-expect")
    exp.appendChild(el("b", "", EXPECT))
    exp.appendChild(document.createTextNode(" " + text.slice(at + EXPECT.length).trim()))
    li.appendChild(exp)
    return li
  }
  const checkItem = (raw) => {
    const li = el("li", "qa-check")
    let rest = raw.trim()
    const tag = /^\\([^)]*\\)\\s*/.exec(rest)
    if (tag) {
      li.appendChild(el("span", "qa-tag", tag[0].trim()))
      rest = rest.slice(tag[0].length)
    }
    const parts = rest.split(/(?:^|\\s)(?=\\d+\\)\\s)/).map((s) => s.trim()).filter(Boolean)
    if (parts.length < 2) {
      const one = stepNode(rest.replace(/^\\d+\\)\\s*/, ""))
      while (one.firstChild) li.appendChild(one.firstChild)
      return li
    }
    const ol = el("ol", "qa-steps")
    parts.forEach((p) => ol.appendChild(stepNode(p.replace(/^\\d+\\)\\s*/, ""))))
    li.appendChild(ol)
    return li
  }

  const card = (task, onDone) => {
    const c = el("section", "qa-card")
    const head = el("h4", "qa-task-title")
    head.appendChild(el("span", "qa-id", task.id))
    // the title opens the task popup (TaskPopup picks up links inside the list)
    if (task.file) {
      const a = el("a", "qa-title-link", " " + task.title)
      a.href = "/Projects/" + slug(task.area) + "/Tasks/" + slug(task.file)
      head.appendChild(a)
    } else head.appendChild(document.createTextNode(" " + task.title))
    c.appendChild(head)
    c.appendChild(el("div", "qa-label", "מה לבדוק"))
    const ul = el("ul", "qa-checks")
    if (!task.checklist.length) ul.appendChild(el("li", "qa-nocheck", "לא הוגדרה רשימת בדיקה למשימה הזו"))
    task.checklist.forEach((t) => ul.appendChild(checkItem(t)))
    c.appendChild(ul)
    const err = el("div", "qa-error")
    err.setAttribute("role", "alert")
    const actions = el("div", "qa-actions")
    const pass = el("button", "qa-pass", "עבר ✓")
    const fail = el("button", "qa-fail", "לא עבר ✗")
    pass.type = fail.type = "button"
    actions.appendChild(pass)
    actions.appendChild(fail)
    const failBox = el("div", "qa-failbox")
    failBox.hidden = true
    const reason = el("textarea", "qa-reason")
    reason.rows = 3
    reason.placeholder = "למה זה לא עבר? (חובה)"
    reason.setAttribute("aria-label", "סיבה")
    const send = el("button", "qa-send", "סמן כנכשל")
    const cancel = el("button", "qa-cancel", "ביטול")
    send.type = cancel.type = "button"
    const row = el("div", "qa-actions")
    row.appendChild(send)
    row.appendChild(cancel)
    failBox.appendChild(reason)
    failBox.appendChild(row)
    c.appendChild(actions)
    c.appendChild(failBox)
    c.appendChild(err)
    const busy = (b) => c.querySelectorAll("button, textarea").forEach((x) => (x.disabled = b))
    const submit = async (verdict, why) => {
      err.textContent = ""
      busy(true)
      try {
        await api("/api/qa/mark", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: task.id, verdict, reason: why }),
        })
        c.className = "qa-card qa-resolved"
        c.replaceChildren(el("div", "qa-done", task.id + (verdict === "pass" ? " — עבר ✓ (done)" : " — לא עבר, נפתח מחדש (reopened)")))
        onDone()
      } catch (e) {
        err.textContent = e.message
        busy(false)
      }
    }
    pass.addEventListener("click", () => submit("pass"))
    fail.addEventListener("click", () => {
      failBox.hidden = false
      actions.hidden = true
      reason.focus()
    })
    cancel.addEventListener("click", () => {
      failBox.hidden = true
      actions.hidden = false
      err.textContent = ""
    })
    send.addEventListener("click", () => {
      if (!reason.value.trim()) {
        err.textContent = "חובה לכתוב סיבה"
        reason.focus()
        return
      }
      submit("fail", reason.value)
    })
    return c
  }

  const render = (body, tasks, progress) => {
    body.replaceChildren()
    progress.textContent = ""
    if (!tasks.length) {
      body.appendChild(el("p", "qa-empty", "אין משימות שמחכות ל-QA"))
      return
    }
    const here = decodeURIComponent(location.pathname).toLowerCase()
    const byArea = {}
    tasks.forEach((t) => (byArea[t.area] = byArea[t.area] || []).push(t))
    const areas = Object.keys(byArea).sort((a, b) => (here.includes(slug(b)) ? 1 : 0) - (here.includes(slug(a)) ? 1 : 0) || a.localeCompare(b))
    let left = tasks.length
    const total = tasks.length
    const showLeft = () => (progress.textContent = left ? "נותרו " + left + " מתוך " + total : "הכול נבדק")
    showLeft()
    areas.forEach((a) => {
      if (areas.length > 1) {
        const h = el("h3", "qa-area", a)
        h.appendChild(el("span", "qa-area-count", String(byArea[a].length)))
        body.appendChild(h)
      }
      byArea[a].forEach((t) =>
        body.appendChild(card(t, () => {
          left -= 1
          showLeft()
          if (!left) body.appendChild(el("p", "qa-empty", "סיימת את כל הבדיקות"))
        })),
      )
    })
  }

  const open = async (opts) => {
    if (overlay) return
    const o = opts || {}
    if (!o.noPush) history.pushState(Object.assign({}, history.state || {}, { boardsList: "qa" }), "")
    overlay = el("div", "qa-overlay")
    const dlg = el("div", "qa-dialog")
    dlg.setAttribute("role", "dialog")
    dlg.setAttribute("aria-modal", "true")
    dlg.setAttribute("aria-label", "בדיקות QA")
    const top = el("div", "qa-top")
    const heading = el("h2", "qa-heading", "בדיקות QA")
    const progress = el("span", "qa-progress")
    heading.appendChild(progress)
    top.appendChild(heading)
    const x = el("button", "qa-close", "✕")
    x.type = "button"
    x.setAttribute("aria-label", "סגור")
    x.addEventListener("click", close)
    top.appendChild(x)
    const body = el("div", "qa-body")
    body.appendChild(el("p", "qa-empty", "טוען…"))
    dlg.appendChild(top)
    dlg.appendChild(body)
    overlay.appendChild(dlg)
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close() })
    // Outside <body>: the SPA router patches body when the board rebuilds and would remove the popup.
    document.documentElement.appendChild(overlay)
    try {
      const d = await api("/api/qa")
      const tasks = scoped(d.tasks)
      setCount(tasks.length)
      render(body, tasks, progress)
      if (o.scroll) body.scrollTop = o.scroll
    } catch (e) {
      body.replaceChildren(el("p", "qa-error", e.message))
    }
  }

  document.addEventListener("click", (e) => {
    if (e.target.closest && e.target.closest(".boards-qa-button")) open()
  })
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && overlay) close() })
  window.__boardsLists = window.__boardsLists || {}
  window.__boardsLists["qa"] = {
    open: (o) => open(o),
    closeUI: () => closeUI(),
    isOpen: () => !!overlay,
    scroll: () => (overlay ? overlay.querySelector(".qa-body").scrollTop : 0),
  }
  document.addEventListener("nav", refreshCount)
  refreshCount()
}
`

QaButton.css = `
.boards-qa-button {
  position: fixed;
  top: 0.75rem;
  /* above the board title: custom.scss sets --boards-buttons-start from the sidebar state */
  inset-inline-start: var(--boards-buttons-start, 3.5rem);
  z-index: 10;
  /* wide enough for "QA" + a 2-digit count, so the E2E button next to it never touches it */
  min-width: 4.9rem;
  height: 2.2rem;
  padding: 0 0.7rem;
  border: 1px solid var(--lightgray);
  border-radius: 6px;
  background: var(--light);
  color: var(--darkgray);
  font-size: 0.9rem;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
}
.boards-qa-button, .boards-e2e-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 4.9rem;
}
.boards-qa-button.boards-zero, .boards-e2e-button.boards-zero { opacity: 0.55; }
.boards-qa-button.boards-zero .boards-qa-count, .boards-e2e-button.boards-zero .boards-e2e-count { background: var(--gray); }
.boards-qa-button:hover { color: var(--secondary); border-color: var(--secondary); }
.boards-qa-count {
  margin-inline-start: 0.45rem;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  background: var(--secondary);
  color: var(--light);
  font-size: 0.75rem;
}
.qa-overlay {
  /* hangs on <html>, outside <body>, so it inherits no font from the page */
  font-family: var(--bodyFont);
  color: var(--darkgray);
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
}
/* the same frame as the task popup (TaskPopup.tsx): width, bar on top, bordered close button */
.qa-dialog {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  max-height: min(52rem, 100%);
  width: min(48rem, 100%);
  background: var(--light);
  color: var(--dark);
  border: 1px solid var(--lightgray);
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
  overflow: hidden;
  direction: rtl;
  text-align: start;
}
.qa-top {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-block: 1rem;
  padding-inline: 1.5rem 1rem;
  border-bottom: 1px solid var(--lightgray);
}
/* Only the task list scrolls; the heading and close button stay put. */
.qa-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0.5rem 1.5rem 1.5rem; }
.qa-heading { display: flex; align-items: baseline; gap: 0.75rem; margin: 0; font-size: 1.25rem; }
.qa-progress { font-size: 0.85rem; font-weight: 400; color: var(--gray); }
.qa-close, .boards-task-close {
  display: grid;
  place-items: center;
  flex: none;
  width: 2.25rem;
  height: 2.25rem;
  padding: 0;
  border: 1px solid var(--lightgray);
  border-radius: 6px;
  background: none;
  color: var(--darkgray);
  font-size: 1rem;
  cursor: pointer;
}
.qa-close:hover { color: var(--secondary); border-color: var(--secondary); }
.qa-area { display: flex; align-items: baseline; gap: 0.5rem; margin: 1.25rem 0 0.25rem; font-size: 1rem; color: var(--secondary); }
.qa-area-count { color: var(--gray); font-size: 0.8rem; font-weight: 400; }
/* every task in its own frame, so it is clear where one starts and ends (Yair rejected divider lines) */
.qa-card { border: 1px solid var(--lightgray); border-radius: 10px; padding: 0.9rem 1rem; margin: 0.75rem 0; }
.qa-task-title { margin: 0 0 0.5rem; font-size: 1rem; }
.qa-id { display: inline-block; padding: 0 0.4rem; border-radius: 4px; background: var(--highlight); color: var(--secondary); font-family: var(--codeFont); font-size: 0.85rem; direction: ltr; }
/* "מה לבדוק" said nothing the checks under it do not */
.qa-label { display: none; }
.qa-checks { margin: 0 0 0.7rem; padding: 0; list-style: none; counter-reset: qa-check; }
.qa-check { margin: 0 0 0.6rem; line-height: 1.55; }
/* every check has its own numbered steps; a heading per check keeps "1, 2, 1, 2, 3" readable */
.qa-check::before {
  counter-increment: qa-check;
  content: "בדיקה " counter(qa-check);
  display: block;
  margin-bottom: 0.15rem;
  color: var(--gray);
  font-size: 0.78rem;
  font-weight: 600;
}
.qa-checks > .qa-check:only-child::before { content: none; }
.qa-check + .qa-check { padding-top: 0.6rem; border-top: 1px dashed var(--lightgray); }
.qa-title-link { color: inherit; background: none; }
.qa-title-link:hover { color: var(--secondary); text-decoration: underline; }
.qa-tag { display: inline-block; margin-bottom: 0.3rem; padding: 0 0.5rem; border-radius: 999px; background: var(--highlight); color: var(--secondary); font-size: 0.78rem; }
.qa-steps { margin: 0; padding-inline-start: 1.4rem; }
.qa-step { margin: 0.35rem 0; }
.qa-step::marker { color: var(--secondary); font-weight: 600; }
.qa-expect { margin-top: 0.15rem; padding-inline-start: 0.6rem; border-inline-start: 3px solid var(--secondary); color: var(--darkgray); font-size: 0.92rem; }
.qa-expect b { color: var(--secondary); }
.qa-nocheck { color: var(--gray); }
/* the verdict buttons stay in view while a long card scrolls past */
/* the verdict buttons close each task's frame; not sticky (a sticky row floated the next task's buttons
   over the list before that task was in view) */
.qa-card > .qa-actions, .qa-card > .qa-failbox { padding: 0.75rem 0 0; }
.qa-actions { display: flex; gap: 0.6rem; }
.qa-actions[hidden], .qa-failbox[hidden] { display: none; }
.qa-actions button, .qa-send, .qa-cancel {
  flex: 1;
  min-height: 2.6rem;
  border-radius: 8px;
  border: 1px solid var(--lightgray);
  background: var(--light);
  color: var(--dark);
  font-size: 1rem;
  cursor: pointer;
}
.qa-pass { border-color: #2e9d57 !important; color: #2e9d57 !important; }
.qa-fail, .qa-send { border-color: #d64545 !important; color: #d64545 !important; }
.qa-pass:hover { background: #2e9d57 !important; color: #fff !important; }
.qa-fail:hover, .qa-send:hover { background: #d64545 !important; color: #fff !important; }
.qa-actions button:disabled, .qa-reason:disabled { opacity: 0.5; cursor: wait; }
.qa-reason { width: 100%; box-sizing: border-box; margin-bottom: 0.5rem; padding: 0.5rem; border: 1px solid var(--gray); border-radius: 8px; background: var(--light); color: var(--dark); font: inherit; resize: vertical; direction: rtl; }
.qa-error { color: #d64545; margin-top: 0.4rem; min-height: 0; }
.qa-done { font-weight: 600; }
.qa-empty { text-align: center; padding: 1.5rem 0; color: var(--darkgray); }
@media (max-width: 800px) {
  .qa-overlay { padding: 0; align-items: stretch; }
  .qa-dialog { width: 100%; height: 100%; max-height: none; border-radius: 0; border: 0; padding-bottom: env(safe-area-inset-bottom); }
  .qa-top { padding-top: max(1rem, env(safe-area-inset-top)); padding-inline: 1rem 0.75rem; }
  .qa-body { padding: 0.25rem 1rem 1.5rem; }
}
`

export default (() => QaButton) satisfies QuartzComponentConstructor
