// L5b — one on-screen slot (ports the ViewSlot DOM + focus/close behavior from navigate.js:5–282
// and the ErrorView template from view.js:116; ARCHITECTURE §6/§12). Emits the exact custom
// tags/classes the reused CSS targets (<view-slot>/<view-header>/<view-root>, focused,
// loading/rendering/error, slot-close, ...). The load lifecycle lives in useViewLifecycle; the
// header portal in SlotHeaderContext.
import { useLayoutEffect, useMemo, useRef } from 'react'
import type { SlotDescriptor } from '../data/types'
import { Nav } from '../services/nav'
import { Lp } from '../services/socket'
import { createSlotHeaderApi, SlotHeaderContext } from './SlotHeaderContext'
import { confirm_leave } from './protect'
import { useViewLifecycle } from './useViewLifecycle'

interface SlotProps {
  slot: SlotDescriptor
  url: string
  focused: boolean
}

// view.js:116 ErrorView — a <view-root> holding the (imperatively-injected) error message Node
// and the location JSON. The message is a DOM Node (from sidebar_debug), so it is appended via a
// ref rather than rendered as a React child.
function ErrorView({ message, location }: { message: Node | null; location: string }) {
  const msgRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = msgRef.current
    if (!el) return
    el.replaceChildren()
    if (message) el.append(message)
  }, [message])
  return (
    <view-root style={{ overflowY: 'auto' }}>
      <div className="errorPage" ref={msgRef} />
      <div className="pre" style={{ font: 'var(--T-monospace-font)' }}>
        {location}
      </div>
    </view-root>
  )
}

export function Slot({ slot, url, focused }: SlotProps) {
  const rootRef = useRef<HTMLElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const buttonsRef = useRef<HTMLSpanElement>(null)
  const extraRef = useRef<HTMLDivElement>(null)

  // stable per-slot header api (reads the header nodes lazily at call time)
  const header = useMemo(
    () =>
      createSlotHeaderApi({
        title: () => titleRef.current,
        buttons: () => buttonsRef.current,
        extra: () => extraRef.current,
      }),
    [],
  )

  const { loadState, error, render } = useViewLifecycle(url, header)

  // navigate.js:29/32 — mousedown/focusin (capture) grab focus for this slot.
  const grab_focus = () => Nav.set_focus(slot)

  // navigate.js:36 — the close (×) button. Confirm first if the current view is protected
  // (navigate.js:118 destroy()), remove the slot preserving the identities of the others, push
  // the new address, then reconcile the (already-updated) hash to notify React so this slot
  // unmounts. Reconciling the current hash is a no-op reload of the survivors (their urls are
  // unchanged) but re-emits the store snapshot.
  const on_close = () => {
    const el = rootRef.current
    if (el && !confirm_leave(el)) return
    const idx = Nav.slots.indexOf(slot)
    if (idx !== -1) Nav.slots.splice(idx, 1)
    Nav.set_address(false) // pushState with the new url
    Lp.flush_statuses()
    Nav.update_from_fragment(window.location.hash.substring(1)) // notify → unmount this slot
  }

  const headerClass = [
    loadState === 2 ? 'rendering' : '',
    loadState === 1 ? 'loading' : '',
    error ? 'error' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <view-slot
      ref={rootRef}
      class={focused ? 'COL focused' : 'COL'}
      onMouseDownCapture={grab_focus}
      onFocusCapture={grab_focus}
    >
      <div className="slot-overlay" />
      <span tabIndex={0} accessKey="q" className="header-focus-anchor" />
      <view-header class={headerClass || undefined}>
        <div>
          <div ref={extraRef} />
          <h1 ref={titleRef} className="ellipsis" />
        </div>
        <span className="header-buttons ROW" ref={buttonsRef} />
        <button className="slot-close" onClick={on_close}>
          ×
        </button>
      </view-header>
      <SlotHeaderContext.Provider value={header}>
        {render.kind === 'view' ? (
          <render.Component
            key={Nav.unparse_url(render.loc)}
            data={render.data}
            loc={render.loc}
            header={header}
          />
        ) : render.kind === 'error' ? (
          <ErrorView key={render.location} message={render.message} location={render.location} />
        ) : null}
      </SlotHeaderContext.Provider>
    </view-slot>
  )
}
