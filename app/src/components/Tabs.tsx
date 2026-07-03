// Tabs (draw.js `class Tabs` → ARCHITECTURE §9, §10, L6g). An ARIA tablist wrapper that renders the
// `<tab-list role=tablist>` with one `role=tab` button per definition, emitting the exact
// role/aria/id/tabindex/data-name attributes the CSS and focus-nav service read off the live DOM.
//
// Selection is driven by the shared imperative `switch_tab` (services/focus-nav): a button click
// (or a `select(name)` call on the imperative handle) hands the button to switch_tab, which toggles
// aria-selected + the roving tabIndex on the buttons and toggles the `.shown` class on each panel
// (panels STAY MOUNTED — they are shown/hidden by CSS, never unmounted) and fires `panel.onpause`.
//
// Panels are rendered by the consumer (Sidebar) with fixed ids; this component only needs each
// tab's `panelId` to point `aria-controls` at it, and wires the panel-side `role=tabpanel` /
// `aria-labelledby` in a layout effect (the old Tabs.add did this on the passed panel element).
// aria-selected / tabIndex start at their unselected defaults in JSX and are thereafter owned by
// switch_tab; because those JSX values never change, React never reconciles them back over a live
// selection.
import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { switch_tab } from '../services/focus-nav'

export interface TabDef {
  name: string
  label: ReactNode
  panelId: string
  hidden?: boolean
  accesskey?: string
  shadow?: boolean
  onswitch?: () => void
}

export interface TabsHandle {
  // Tabs.select(name): switch to the named tab WITHOUT stealing focus (no_focus=true).
  select(name: string): void
  // Tabs.selected(): the name of the tab whose aria-selected is "true", or null.
  selected(): string | null
}

export interface TabsProps {
  // The tablist name prefix; button ids are `${name}-tab-${tab.name}` (draw.js Tabs constructor).
  name: string
  tabs: TabDef[]
  id?: string
  'aria-label'?: string
  // Which tab to select once on mount (the old Sidebar did tabs.select('activity'|'user')).
  initial?: string
}

export const Tabs = forwardRef<TabsHandle, TabsProps>(function Tabs(
  { name, tabs, id, 'aria-label': ariaLabel, initial },
  ref,
) {
  const listRef = useRef<HTMLElement>(null)

  // draw.js Tabs.select: find the tab button by name and hand it to switch_tab (no_focus=true).
  const doSelect = (tabName: string, noFocus?: boolean): void => {
    const list = listRef.current
    if (!list) return
    for (const el of Array.from(list.children)) {
      if ((el as HTMLElement).dataset.name === tabName) {
        switch_tab(el as HTMLElement, noFocus)
        return
      }
    }
  }

  useImperativeHandle(ref, () => ({
    select(tabName: string): void {
      doSelect(tabName, true)
    },
    selected(): string | null {
      const list = listRef.current
      if (!list) return null
      for (const el of Array.from(list.children)) {
        if (el.getAttribute('aria-selected') === 'true') return (el as HTMLElement).dataset.name ?? null
      }
      return null
    },
  }))

  // Panel-side ARIA wiring (draw.js Tabs.add) + the one-time initial selection. Runs once on mount
  // (StrictMode's double-invoke is idempotent: same attributes, same tab selected).
  useLayoutEffect(() => {
    for (const tab of tabs) {
      const panel = document.getElementById(tab.panelId)
      if (panel) {
        panel.setAttribute('role', 'tabpanel')
        panel.setAttribute('aria-labelledby', `${name}-tab-${tab.name}`)
      }
    }
    if (initial != null) doSelect(initial, true)
    // Mount-only: tabs/name/initial are stable for the single Sidebar consumer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <tab-list ref={listRef} role="tablist" id={id} aria-label={ariaLabel}>
      {tabs.map((tab) => (
        <button
          key={tab.name}
          id={`${name}-tab-${tab.name}`}
          role="tab"
          aria-selected={false}
          aria-controls={tab.panelId}
          tabIndex={-1}
          data-name={tab.name}
          hidden={tab.hidden}
          className={tab.shadow ? 'text-shadow' : undefined}
          accessKey={tab.accesskey}
          onClick={(e) => {
            switch_tab(e.currentTarget)
            tab.onswitch?.() // todo: make this an event listener or something on panel instead
          }}
        >
          {tab.label}
        </button>
      ))}
    </tab-list>
  )
})
