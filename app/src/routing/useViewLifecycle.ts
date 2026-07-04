// L5b — the view-load lifecycle engine (ports ViewSlot.handle_view2 from navigate.js:180;
// ARCHITECTURE §6/§12). Implemented IMPERATIVELY inside a hook (not as declarative effects) to
// preserve the original's exact timing, in particular the deliberate setTimeout paint break.
//
// The url is stable for a Slot's lifetime (Slots.tsx keys each <Slot> by url, so a url change is
// a remount, never an in-place update), so this runs once per mount. The generator's cancellation
// (`ViewSlot.cancel → loading.return()`) is replaced by an AbortController: on url change/unmount
// the effect cleanup aborts, and every async continuation drops itself when `signal.aborted`, so
// a stale response can never overwrite a newer slot.
//
// Sequence (navigate.js:196–266):
//   Start → view lookup (throw 'type' if unknown) → view.Start(loc) → loading class →
//   [request via Lp.chain, unless quick] → check (throw 'data' if falsy) → rendering class →
//   setTimeout(0) paint break → mount Component with data props → flush_statuses.
// Errors at any phase build the ErrorView (rendered by Slot.tsx).
import { useLayoutEffect, useState } from 'react'
import type { ComponentType } from 'react'
import type { Chain, ListMap, NavLocation, SlotHeaderApi, ViewComponentProps } from '../data/types'
import { Nav } from '../services/nav'
import { Lp } from '../services/socket'
import type { LpHandle } from '../services/socket'
import { resolve_view } from './view-registry'
import { sidebar_debug } from '../services/sidebar-log'

// What Slot.tsx should render in the <view-slot> body below the header.
export type ViewRender =
  | { kind: 'none' }
  | { kind: 'view'; Component: ComponentType<ViewComponentProps>; data: ListMap; loc: NavLocation }
  | { kind: 'error'; message: Node | null; location: string }

export interface LifecycleState {
  loadState: 0 | 1 | 2 // 0 idle/done, 1 loading, 2 rendering — drives <view-header> classes
  error: boolean
  render: ViewRender
}

// was View.first (view.js:126) — module scope so it survives remounts; flips false after the
// first page render. Purely diagnostic (console.log gating).
let first = true

export function useViewLifecycle(url: string, header: SlotHeaderApi): LifecycleState {
  const [state, setState] = useState<LifecycleState>({
    loadState: 1,
    error: false,
    render: { kind: 'none' },
  })

  useLayoutEffect(() => {
    const ac = new AbortController()
    let handle: LpHandle | null = null
    let phase = '...'
    const loc = Nav.parse_url(url)

    // navigate.js:197 — loading_state(1) fires synchronously at the start of handle_view2,
    // before the async view lookup. Set it immediately so the header shows the loading state
    // right away. Crucially, the updater form (s) => ({ ...s, ... }) preserves s.render — the
    // previous view stays visible in the body until do_render swaps it for the new one, matching
    // the original where switch_view only removes the old DOM after the request completes.
    setState((s) => ({ ...s, loadState: 1, error: false }))

    // navigate.js:236 — build the ErrorView. Distinct sentinels: 'type' (unknown view), 'data'
    // (check() failed), anything else (an exception during `phase`).
    const commit_error = (title: string, message: Node | null): void => {
      if (ac.signal.aborted) return
      header.set_title(title)
      setState({
        loadState: 0,
        error: true,
        render: { kind: 'error', message, location: 'location: ' + JSON.stringify(loc, null, 1) },
      })
    }
    const handle_error = (e: unknown): void => {
      if (e === 'type') {
        commit_error(`\u{1F6A7} Unknown view: ‘${loc.type}’`, null)
      } else if (e === 'data') {
        commit_error('\u{1FAB9}️ Data not found', null)
      } else {
        console.error('Error during view handling', e)
        commit_error('\u{1F4A5} Error during: ' + phase, sidebar_debug(e))
      }
    }

    // navigate.js:218–266 — the rendering phase: 'rendering' class, a real setTimeout(0) paint
    // break so the spinner shows, then mount the Component with the loaded data as props.
    const do_render = (
      Component: ComponentType<ViewComponentProps>,
      data: ListMap,
    ): void => {
      if (ac.signal.aborted) return
      if (first) console.log('\u{1F304} Rendering first page')
      setState((s) => ({ ...s, loadState: 2 })) // loading_state(2): 'rendering'
      window.setTimeout(() => {
        if (ac.signal.aborted) return
        // switch_view(view) + Init + Render → mount the Component
        setState({ loadState: 0, error: false, render: { kind: 'view', Component, data, loc } })
        Lp.flush_statuses() // navigate.js:261
        if (first) {
          console.log('☀️ First page rendered!')
          first = false
        }
      }, 0)
    }

    // view resolution is async (lazy-loaded views). The 'view lookup' phase awaits the dynamic
    // import; subsequent navigations to the same type hit the cache and stay synchronous.
    void (async () => {
      try {
        phase = 'view lookup'
        // dev-only runtime validation of the parsed NavLocation. Dynamic import keeps zod
        // (~80KB) out of the production bundle; the static type contract (data/types.ts)
        // holds in prod. Exception to ts-no-dynamic-import: prod must not ship zod.
        if (import.meta.env.DEV) {
          const { NavLocationSchema } = await import('./nav-location-schema')
          NavLocationSchema.parse(loc)
        }
        const view = await resolve_view(loc.type)

        if (ac.signal.aborted) return

        phase = 'view.Start'
        const start = view.Start(loc)

        if ('quick' in start) {
          do_render(view.Component, {})
        } else {
          const chain: Chain = start.chain
          const check = start.check
          phase = 'starting request'
          handle = Lp.chain(chain, (resp: ListMap, err?: Error) => {
            if (ac.signal.aborted) return
            handle = null
            if (err) {
              handle_error(err)
              return
            }
            phase = 'view.Check'
            if (check && !check(resp)) {
              handle_error('data')
              return
            }
            do_render(view.Component, resp)
          })
        }
      } catch (e) {
        if (ac.signal.aborted) return
        handle_error(e)
      }
    })()

    // navigate.js:172 cancel() — abort the in-flight request and flush pending statuses. The
    // view Component's own hook cleanups handle Events.destroy (useBusListener), View.lost, the
    // userlist release, and scroller teardown (those live with the view, L7).
    return () => {
      ac.abort()
      if (handle) Lp.cancel(handle)
      Lp.flush_statuses() // hhh (navigate.js:177)
    }
  }, [url, header])

  return state
}
