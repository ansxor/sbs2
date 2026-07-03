// Focus navigation + tab switching (keyboard.js → ARCHITECTURE §9, §10, L4e).
//
// switch_tab drives tablist selection: toggles aria-selected per tab, toggles the `.shown` class
// on each aria-controls panel (panels stay MOUNTED and are shown/hidden via CSS, not unmounted),
// calls the ad-hoc `panel.onpause(null)` hook on panels being hidden, and moves the roving
// tabIndex. installFocusNav() attaches the two document-level managers: a `keydown` roving-tabindex
// arrow-navigation handler and a `focusout` handler that maintains the single-tab-stop invariant.
// Both read ARIA `role` / `data-ordered` / flex `style.order` off the live DOM — kept fundamentally
// imperative per the architecture. Ported verbatim from keyboard.js:31-165; the module-load
// listener side effects are moved behind installFocusNav() per the module map, and switch_tab keeps
// its real (next, no_focus) signature (the map's `(dir)` is a sketch).

// keyboard.js:31-50
export function switch_tab(next: HTMLElement | null | undefined, no_focus?: boolean): boolean | void {
  if (!next || (next.hidden && !no_focus)) //hack
    return false
  const tablist = next.parentNode as ParentNode
  for (const el of tablist.children) {
    const tab = el as HTMLElement
    const panel = document.getElementById(tab.getAttribute('aria-controls') as string)
    const current = tab === next
    tab.setAttribute('aria-selected', String(current))
    if (panel) {
      if (!current) {
        // panel.onpause is an ad-hoc property hook set by views; call it (this = panel) exactly
        // as the original did. onpause is a real GlobalEventHandlers prop, so access it loosely.
        const p = panel as unknown as { onpause?: ((arg: null) => void) | null }
        if (p.onpause) p.onpause(null) // todo: hack!
      }
      panel.classList.toggle('shown', current)
    }
    tab.tabIndex = current ? 0 : -1
  }
  if (!no_focus) next.focus()
}

// keyboard.js:82-84
function try_focus(elem: Element | null | undefined): void {
  if (elem) (elem as HTMLElement).focus()
}

// keyboard.js:86-97 — the visually-first (flex order) child; dir=-1 gives visually-last.
function order_first(elem: HTMLElement, dir = 1): HTMLElement | null {
  let best: HTMLElement | null = null
  let best_or = NaN
  for (const el of elem.children) {
    const c = el as HTMLElement
    const or = +c.style.order * dir
    if (!(or > best_or)) {
      best = c
      best_or = or
    }
  }
  return best
}

// keyboard.js:99-112 — the next sibling in visual (flex order) sequence in direction `dir`.
function order_neighbor(elem: HTMLElement, dir: number): HTMLElement | undefined {
  const order = +elem.style.order * dir
  let best: HTMLElement | null = null
  let best_or = NaN
  for (const el of (elem.parentNode as ParentNode).children) {
    const c = el as HTMLElement
    const or = +c.style.order * dir
    if (or > order && !(or > best_or)) {
      best = c
      best_or = or
    }
  }
  if (best) return best
}

// keyboard.js:113-117
function get_neighbor(elem: HTMLElement, dir: number): Element | null | undefined {
  if ((elem.parentNode as HTMLElement).dataset.ordered != null)
    return order_neighbor(elem, dir)
  return dir < 0 ? elem.previousElementSibling : elem.nextElementSibling
}

// keyboard.js:119-124
function focus_prev(elem: HTMLElement): void {
  try_focus(get_neighbor(elem, -1))
}
function focus_next(elem: HTMLElement): void {
  try_focus(get_neighbor(elem, 1))
}

// keyboard.js:52-80
function on_focusout(e: FocusEvent): void {
  const focused = e.target as HTMLElement | null
  const new_focus = e.relatedTarget as HTMLElement | null
  if (focused) {
    const role = focused.getAttribute('role')
    if ('tab' == role || 'row' == role || 'gridcell' == role || 'listitem' == role) {
      if (new_focus && new_focus.parentNode == focused.parentNode) {
        new_focus.tabIndex = 0
        focused.tabIndex = -1
      } else if ('gridcell' == role) focused.tabIndex = -1
    }
    const parent = focused.parentNode as HTMLElement
    if (parent.dataset.ordered != null) {
      if (!parent.contains(new_focus)) {
        // focus moving OUT of an ordered element
        parent.tabIndex = 0 // make it focusable again
        focused.tabIndex = -1
      }
    }
  }
  // focus moving into an ordered element
  if (new_focus && new_focus.dataset.ordered != null) {
    // transfer focus to the first item instead
    new_focus.tabIndex = -1
    try_focus(order_first(new_focus))
    e.preventDefault() // is this right?
  }
}

// keyboard.js:126-165
function on_keydown(e: KeyboardEvent): void {
  const focused = document.activeElement as HTMLElement | null
  if (!focused) return
  const role = focused.getAttribute('role')
  if ('tab' == role) {
    if ('ArrowLeft' == e.key) switch_tab(focused.previousElementSibling as HTMLElement | null)
    else if ('ArrowRight' == e.key) switch_tab(focused.nextElementSibling as HTMLElement | null)
    else return
  } else if ('gridcell' == role) {
    if ('ArrowLeft' == e.key) focus_prev(focused)
    else if ('ArrowRight' == e.key) focus_next(focused)
    else return
  } else if ('row' == role) {
    if ('ArrowRight' == e.key) {
      return
      // todo: pick the right ordered cell
      //try_focus(focused.querySelector(`[role="gridcell"]`))
    } else if ('ArrowUp' == e.key) focus_prev(focused)
    else if ('ArrowDown' == e.key) focus_next(focused)
    else return
  } else if ('listitem' == role) {
    if ('ArrowUp' == e.key) focus_prev(focused)
    else if ('ArrowDown' == e.key) focus_next(focused)
    else return
  } else return
  e.preventDefault()
}

// keyboard.js:52,126 — module-load side effects, moved behind an explicit installer (called once
// by boot). Guarded so a second call (StrictMode) is a no-op; the named handlers also dedupe.
let installed = false
export function installFocusNav(): void {
  if (installed) return
  installed = true
  document.addEventListener('focusout', on_focusout)
  document.addEventListener('keydown', on_keydown)
}
