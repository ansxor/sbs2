// L8 — the integrative shell (ports the index.html <body> structure + the main/sidebar layout;
// ARCHITECTURE §6 "Overall shape", §11 Layer 8, §12 DOM contract).
//
// The old app hard-coded the whole layout in index.html <body class='resize-box ROW'>:
//   <not-sidebar id=$main_slides> (the slots row) | <resize-handle id=$horizontalResize> |
//   <sidebar-container id=$sidebar>. The React scaffold's index.html carries only <div id=root>,
// so this shell renders that structure. Because the reused CSS keys off `.resize-box > *`,
// `.ROW > resize-handle`, and the custom TAG NAMES, the three shell parts must be DIRECT DOM
// children of the resize-box container — so App renders its own `resize-box ROW` wrapper (a plain
// div would leave `#root` between body and these tags and break the `>` combinators). The wrapper
// is `position:fixed; inset:0` to fill the viewport exactly as the old <body> did (which the reused
// `html,body { position:fixed; inset:0 }` rule established).
//
// Login/socket state is surfaced to CSS via `data-*` attributes on <html> written imperatively by
// the services (bootstrap sets data-login; request.ts/socket.ts own the rest) — never via JSX on
// <html> (ARCHITECTURE §5). The shell only renders chrome; the logged-out gate lives in
// bootstrap's immediate() early-return (no slots exist when logged out, so <Slots> renders empty).
import { Slots } from '../routing/Slots'
import { Sidebar, toggleSidebar } from './Sidebar'
import { useResizable } from '../hooks/useResizable'

export function App(): React.JSX.Element {
  // sidebar.js:16 — new ResizeBar($sidebar, $horizontalResize, 'right', "sidebarWidth"). The handle
  // lives in the shell (App) but the resized element is the <sidebar-container> rendered by
  // <Sidebar>; useResizable's containerRef is threaded down so both refs attach before App's layout
  // effect wires the drag.
  const { containerRef, handleRef } = useResizable('sidebarWidth', { side: 'right' })

  return (
    <div className="resize-box ROW" style={{ position: 'fixed', inset: 0, width: '100vw', height: '100dvh' }}>
      {/* MAIN — the slots row (was <not-sidebar id=$main_slides>) */}
      <not-sidebar class="FILL ROW" id="$main_slides">
        <button id="$openSidebar" className="toggle-sidebar" onClick={() => toggleSidebar()}>
          | | |
        </button>
        <Slots />
      </not-sidebar>

      {/* SIDEBAR — resize handle + container */}
      <resize-handle id="$horizontalResize" class="sidebar-element" ref={handleRef} />
      <Sidebar containerRef={containerRef} />
    </div>
  )
}
