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
  const slug = (s) => s.trim().replace(/\\s+/g, "-").toLowerCase()
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
      b.hidden = !n
    })
  }
  const refreshCount = () => api("/api/qa").then((d) => setCount(d.tasks.length)).catch(() => {})

  let overlay = null
  const close = () => {
    if (overlay) overlay.remove()
    overlay = null
    refreshCount()
  }

  const card = (task, onDone) => {
    const c = el("section", "qa-card")
    const head = el("h4", "qa-task-title")
    head.appendChild(el("span", "qa-id", task.id))
    head.appendChild(document.createTextNode(" " + task.title))
    c.appendChild(head)
    c.appendChild(el("div", "qa-label", "מה לבדוק"))
    const ul = el("ul", "qa-checks")
    if (!task.checklist.length) ul.appendChild(el("li", "qa-nocheck", "לא הוגדרה רשימת בדיקה למשימה הזו"))
    task.checklist.forEach((t) => ul.appendChild(el("li", "", t)))
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
    const send = el("button", "qa-send", "שלח")
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

  const render = (body, tasks) => {
    body.replaceChildren()
    if (!tasks.length) {
      body.appendChild(el("p", "qa-empty", "אין משימות שמחכות ל-QA 🎉"))
      return
    }
    const here = decodeURIComponent(location.pathname).toLowerCase()
    const byArea = {}
    tasks.forEach((t) => (byArea[t.area] = byArea[t.area] || []).push(t))
    const areas = Object.keys(byArea).sort((a, b) => (here.includes(slug(b)) ? 1 : 0) - (here.includes(slug(a)) ? 1 : 0) || a.localeCompare(b))
    let left = tasks.length
    areas.forEach((a) => {
      body.appendChild(el("h3", "qa-area", a))
      byArea[a].forEach((t) =>
        body.appendChild(card(t, () => {
          left -= 1
          if (!left) body.appendChild(el("p", "qa-empty", "סיימת את כל הבדיקות 🎉"))
        })),
      )
    })
  }

  const open = async () => {
    if (overlay) return
    overlay = el("div", "qa-overlay")
    const dlg = el("div", "qa-dialog")
    dlg.setAttribute("role", "dialog")
    dlg.setAttribute("aria-modal", "true")
    dlg.setAttribute("aria-label", "בדיקות QA")
    const top = el("div", "qa-top")
    top.appendChild(el("h2", "qa-heading", "בדיקות QA"))
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
    document.body.appendChild(overlay)
    try {
      const d = await api("/api/qa")
      setCount(d.tasks.length)
      render(body, d.tasks)
    } catch (e) {
      body.replaceChildren(el("p", "qa-error", e.message))
    }
  }

  document.addEventListener("click", (e) => {
    if (e.target.closest && e.target.closest(".boards-qa-button")) open()
  })
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close() })
  document.addEventListener("nav", refreshCount)
  refreshCount()
}
`

QaButton.css = `
.boards-qa-button {
  position: fixed;
  top: 0.75rem;
  inset-inline-start: 3.4rem;
  z-index: 10;
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
.boards-qa-button:hover { color: var(--secondary); border-color: var(--secondary); }
.boards-qa-count {
  margin-inline-start: 0.4rem;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  background: var(--secondary);
  color: var(--light);
  font-size: 0.75rem;
}
.qa-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 4vh 1rem;
  overflow-y: auto;
}
.qa-dialog {
  width: min(42rem, 100%);
  background: var(--light);
  color: var(--dark);
  border: 1px solid var(--lightgray);
  border-radius: 10px;
  padding: 1rem 1.1rem 1.2rem;
  direction: rtl;
  text-align: start;
}
.qa-top { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.qa-heading { margin: 0; font-size: 1.3rem; }
.qa-close { border: 0; background: none; color: var(--darkgray); font-size: 1.3rem; cursor: pointer; padding: 0.3rem 0.5rem; }
.qa-area { margin: 1rem 0 0.4rem; font-size: 1rem; color: var(--secondary); }
.qa-card { border: 1px solid var(--lightgray); border-radius: 8px; padding: 0.8rem 0.9rem; margin: 0.6rem 0; }
.qa-task-title { margin: 0 0 0.5rem; font-size: 1rem; }
.qa-id { display: inline-block; padding: 0 0.4rem; border-radius: 4px; background: var(--highlight); color: var(--secondary); font-family: var(--codeFont); font-size: 0.85rem; direction: ltr; }
.qa-label { font-size: 0.8rem; color: var(--gray); margin-bottom: 0.2rem; }
.qa-checks { margin: 0 0 0.7rem; padding-inline-start: 1.2rem; }
.qa-checks li { margin: 0.25rem 0; line-height: 1.5; }
.qa-nocheck { color: var(--gray); list-style: none; margin-inline-start: -1.2rem; }
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
@media (max-width: 600px) {
  .qa-overlay { padding: 0; }
  .qa-dialog { width: 100%; min-height: 100%; border-radius: 0; border: 0; box-sizing: border-box; }
}
`

export default (() => QaButton) satisfies QuartzComponentConstructor
