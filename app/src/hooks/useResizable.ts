// useResizable — ports draw.js's ResizeBar (drag-to-resize + localStorage persist) as a hook
// (ARCHITECTURE §9 draw.js ResizeBar → hooks/useResizable.ts, L6b).
//
// The imperative ResizeBar class is ported near-verbatim: one global drag target at a time,
// document-level mouse/touch listeners installed once, per-instance handle listeners, and the
// exact resize math + localStorage key contract (sidebarWidth / sidebarPinnedHeight /
// setting--divider-pos-<page_id>). `Object.seal` is dropped (TS types replace it). React only
// hands the hook two refs (the element being resized and its drag handle); the controller mutates
// inline width/height on the element imperatively, the island pattern.

import { useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'

export type ResizeSide = 'top' | 'bottom' | 'left' | 'right'

// Near-verbatim port of draw.js `class ResizeBar` (src/draw.js:415-495).
class ResizeBar {
  static current: ResizeBar | null = null
  static initialized = false

  // draw.js `static init()` — the document-level listeners, installed exactly once.
  static init(): void {
    if (this.initialized) return
    this.initialized = true
    this.current = null
    const up = (): void => this.grab(null)
    document.addEventListener('mouseup', up, { passive: true })
    document.addEventListener('touchend', up, { passive: true })
    const move = (ev: MouseEvent | TouchEvent): void => this.move(ev)
    document.addEventListener('mousemove', move, { passive: true })
    document.addEventListener('touchmove', move, { passive: true })
  }

  static grab(bar: ResizeBar | null): void {
    this.current && this.current.finish()
    this.current = bar
  }

  static move(ev: MouseEvent | TouchEvent): void {
    this.current && this.current.move(ev)
  }

  $elem: HTMLElement
  $handle: HTMLElement
  save: string | null
  horiz = false
  dir = 1
  start_pos: number | null = null
  start_size: number | null = null
  size: number | null = null
  private readonly down: (ev: Event) => void

  constructor(
    element: HTMLElement,
    handle: HTMLElement,
    side: ResizeSide,
    save: string | null = null,
    def: number | string | null = null,
  ) {
    this.$elem = element
    this.$handle = handle
    this.save = save
    this.switch(side)

    this.down = (ev: Event): void => this.start(ev as MouseEvent | TouchEvent)
    handle.addEventListener('mousedown', this.down)
    handle.addEventListener('touchstart', this.down)

    if (this.save) {
      const s = localStorage.getItem(this.save)
      if (s) def = +s
    }
    if (def != null) this.update_size(def)
  }

  switch(side: ResizeSide): void {
    this.horiz = side === 'left' || side === 'right'
    this.dir = side === 'top' || side === 'left' ? 1 : -1
    if (this.size != null) this.update_size(this.size)
    // remove the opposite dir's style
    this.$elem.style[!this.horiz ? 'width' : 'height'] = ''
  }

  event_pos(ev: MouseEvent | TouchEvent): number {
    // draw.js `if (ev.touches)` — MouseEvent has no `touches` (undefined→falsy). Casts are
    // parity-only and erase to the original dynamic property reads.
    const touches = (ev as TouchEvent).touches
    if (touches) return touches[0][this.horiz ? 'pageX' : 'pageY']
    return (ev as MouseEvent)[this.horiz ? 'clientX' : 'clientY']
  }

  start(ev: MouseEvent | TouchEvent): void {
    let target: EventTarget | Node | null = ev.target
    if (target instanceof Text) target = target.parentNode
    if (target !== this.$handle) return
    ev.preventDefault()
    ResizeBar.grab(this)
    this.$handle.dataset.dragging = ''
    this.start_pos = this.event_pos(ev)
    this.start_size = this.$elem.getBoundingClientRect()[this.horiz ? 'width' : 'height']
  }

  move(ev: MouseEvent | TouchEvent): void {
    const v = (this.event_pos(ev) - this.start_pos!) * this.dir
    this.update_size(this.start_size! + v)
  }

  finish(): void {
    delete this.$handle.dataset.dragging
    if (this.save && this.size != null) localStorage.setItem(this.save, String(this.size))
  }

  update_size(px: number | string): void {
    this.size = Math.max(px as number, 0)
    this.$elem.style[this.horiz ? 'width' : 'height'] = this.size + 'px'
  }

  // Not present in the original (ResizeBar was never torn down); needed so a React unmount /
  // Strict-Mode double-invoke fully detaches. Behavior-preserving: removes only this instance's
  // handle listeners and clears itself as the global drag target if currently grabbed.
  dispose(): void {
    this.$handle.removeEventListener('mousedown', this.down)
    this.$handle.removeEventListener('touchstart', this.down)
    if (ResizeBar.current === this) ResizeBar.current = null
  }
}

ResizeBar.init()

export interface UseResizableOptions {
  // which edge the handle sits on (draw.js `side`): drives horiz/dir.
  side: ResizeSide
  // fallback size in px if nothing is persisted under `key` (draw.js `def`). A string is coerced
  // exactly as the original (`Math.max('400', 0)` → 400).
  default?: number | string | null
}

export interface Resizable {
  // attach to the element being resized (draw.js `$elem`).
  containerRef: RefObject<HTMLElement>
  // attach to the drag handle (draw.js `$handle`).
  handleRef: RefObject<HTMLElement>
}

// `key` is the localStorage persistence key (== draw.js `save`); pass null for a non-persisted
// bar (editpage's `new ResizeBar(..., null, '400')`).
export function useResizable(key: string | null, opts: UseResizableOptions): Resizable {
  const containerRef = useRef<HTMLElement>(null)
  const handleRef = useRef<HTMLElement>(null)
  const { side } = opts
  const def = opts.default ?? null

  useLayoutEffect(() => {
    const elem = containerRef.current
    const handle = handleRef.current
    if (!elem || !handle) return
    const bar = new ResizeBar(elem, handle, side, key, def)
    return () => bar.dispose()
  }, [key, side, def])

  return { containerRef, handleRef }
}
