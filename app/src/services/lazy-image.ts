// Lazy image loading (draw.js load_image/observer + view.js toggle_observer → ARCHITECTURE §9,
// §10, L4e). A single shared IntersectionObserver defers <img> loading until the element scrolls
// into view; load_image either registers the element with the observer (lazy) or loads it now
// (force / observer disabled). The `lazy_loading` setting — registered here, its owning module in
// the split — toggles the observer; its default resolves to 'on', reproducing the original's
// lazy-by-default behavior. Ported verbatim from draw.js:236-272 + view.js:242-253,311-318.
//
// NOTE: this `observer` is the old `Draw.observer` (the REAL load_image observer). It is distinct
// from the always-null `View.observer` that markup/messages forward as `intersection_observer`
// (ARCHITECTURE §8.2) — that null is preserved by those modules, not here.
//
// The markup image patch (services/markup.ts, L5) receives this load_image via its setImageLoader
// sink; boot wires setImageLoader(load_image) before the first render. We do not import markup.ts
// here (it is a higher layer) — the wiring direction is inverted, matching the existing sink
// precedent in that file.

import { Settings } from './settings'

// The shared observer, or null when lazy loading is disabled. Exported as a live `let` binding so
// consumers importing `observer` observe toggle_observer's reassignments (ES-module live bindings).
export let observer: IntersectionObserver | null = null

// draw.js:236-258. `force` (or a disabled observer) loads immediately; otherwise defer via the
// observer by stashing the src on data-src and observing the element.
export function load_image(e: HTMLImageElement, src: string, force?: boolean): void {
  if (!force && observer) {
    e.dataset.src = src
    observer.observe(e)
    return
  }
  const set_size = (state: string): void => {
    e.width = e.naturalWidth
    e.height = e.naturalHeight
    e.dataset.state = state
    e.style.setProperty('--width', String(e.naturalWidth))
    e.style.setProperty('--height', String(e.naturalHeight))
  }
  e.src = src
  if (e.naturalHeight) set_size('loaded')
  // otherwise wait for load
  else
    e.decode().then(
      () => {
        set_size('loaded')
      },
      () => {
        e.dataset.state = 'error'
      },
    )
}

// draw.js:261-272. IntersectionObserver callback. The original used method-style `this.unobserve`;
// here we use the callback's second argument (the observer instance) — the same object, so the
// behavior is identical while sidestepping `this`-typing. Loads visible images bottom-to-top.
function observer_callback(
  data: IntersectionObserverEntry[],
  obs: IntersectionObserver,
): void {
  // todo: load top to bottom on pages
  const visible = data
    .filter((x) => x.isIntersecting)
    .sort((a, b) => b.boundingClientRect.bottom - a.boundingClientRect.bottom)
  for (const { target } of visible) {
    const el = target as HTMLImageElement
    const src = el.dataset.src
    if (src) {
      obs.unobserve(el)
      load_image(el, src, true)
      delete el.dataset.src
    }
  }
}

// view.js:243-253. Create/destroy the shared observer to match the lazy_loading setting; the
// `!observer == !state` short-circuit skips redundant toggles.
export function toggle_observer(state: boolean): void {
  if (!observer == !state) return
  if (state) observer = new IntersectionObserver(observer_callback)
  else {
    // todo: we should load all unloaded images here
    observer!.disconnect()
    observer = null
  }
}

// view.js:311-318. Registered from this module (the observer's owner in the split) so lazy loading
// is on by default. The old `options_labels` ('when visible'/'immediately') are a SettingsForm
// presentation concern dropped here to match the settings-registry precedent; the 'on'/'off'
// values and the toggle logic are preserved exactly.
Settings.add({
  name: 'lazy_loading',
  label: 'Image Loading',
  type: 'select',
  options: ['on', 'off'],
  update(value) {
    // bad
    toggle_observer(value == 'on')
  },
})
