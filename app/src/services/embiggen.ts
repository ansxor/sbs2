// Image embiggen (view.js:254-306 → ARCHITECTURE §9/§10). Clicking an inline image toggles
// it between thumbnail and expanded size via the `data-big` attribute; clicking outside shrinks
// all expanded images. This is a document-level imperative behavior installed once at boot,
// identical to the old app.

let embiggened = false

function shrink_all(skip?: Element): void {
  embiggened = false
  for (const e of document.querySelectorAll('[data-big]')) {
    if (e !== skip)
      e.removeAttribute('data-big')
  }
}

function on_mousedown(ev: MouseEvent): void {
  if (ev.button)
    return

  const target = ev.target
  if (!(target instanceof HTMLElement))
    return

  const shrink = target.getAttribute('data-shrink')
  if (shrink == null)
    return

  let element: Element = target
  if (shrink === 'video') {
    const parent = target.parentElement
    if (!parent) return
    element = parent
  }

  if (!ev.ctrlKey && embiggened)
    shrink_all(element)

  if (!element.hasAttribute('data-big'))
    embiggened = true

  element.toggleAttribute('data-big')
}

function on_click(ev: MouseEvent): void {
  if (!embiggened)
    return

  const element = ev.target
  if (element instanceof HTMLTextAreaElement)
    return
  if (element instanceof Element && element.closest('media-player'))
    return
  if (element instanceof Element && element.hasAttribute('data-shrink'))
    return

  shrink_all()
}

let installed = false

export function installEmbiggen(): void {
  if (installed) return
  installed = true
  document.addEventListener('mousedown', on_mousedown)
  document.addEventListener('click', on_click, { passive: true })
}
