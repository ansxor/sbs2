// L8 — the React entry. Runs the pre-React bootstrap side effects directly, registers every
// route via the central route handler, then mounts <App/> into #root.
// (ARCHITECTURE §10 main.js row, §11 Layer 8).
//
// CSS import decision (finalized): the reused stylesheet cascade is loaded via <link> tags in
// index.html in the exact old order (ARCHITECTURE §1.5) — there is deliberately NO CSS `import`
// here. StrictMode is safe because all fragile state lives in services, never React state
// (ARCHITECTURE §1.2); islands dispose+recreate on the double-invoke.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './components/App'
import { print } from './services/sidebar-log' // side effect: installs window.print / window.log
import { setImmediateMode, drainReady } from './core/ready'
import { Req } from './services/request'
import { Settings } from './services/settings'
import { Lp } from './services/socket'
import { Act } from './services/activity'
import { StatusDisplay } from './services/status-display'
import { Nav } from './services/nav'
import { installPatches, setImageLoader } from './services/markup'
import { load_image } from './services/lazy-image'
import { installFocusNav } from './services/focus-nav'
import { fireMeAvatar } from './services/me-avatar'
import { registerRoutes } from './routing/routes'
import type { ListMap, User } from './data/types'

// ---------------------------------------------------------------------------------------------
// Load-time side effects (ungated — these ran when the old src/*.js modules were evaluated,
// regardless of login).
// ---------------------------------------------------------------------------------------------
// draw.js image element factory needs Draw.load_image; wire the lazy-image loader before the
// markup patches install (which reference it).
setImageLoader(load_image)
// view.js / draw.js renderer monkeypatches (sbs:/https: url schemes + create.image).
installPatches()
// keyboard.js roving-tabindex keydown/focusout document managers.
installFocusNav()

// main.js:4-8 — inject the user's html_inject setting. `document.write` is destructive after
// parse, so (per ARCHITECTURE §6/§10 "document.write" note) we inject into a container before
// React mounts. Scripts inside will NOT execute (innerHTML) — the documented limitation.
;(function inject_html(): void {
  const ls = Settings.values.html_inject
  if ('string' === typeof ls) {
    const div = document.createElement('div')
    div.innerHTML = ls
    const root = document.getElementById('root')
    document.body.insertBefore(div, root)
  }
})()

// ---------------------------------------------------------------------------------------------
// Central route handler: register all views/redirects explicitly instead of relying on
// side-effect imports scattered through bootstrap.ts.
// ---------------------------------------------------------------------------------------------
registerRoutes()

// ---------------------------------------------------------------------------------------------
// immediate() — main.js:13. Synchronous bootstrap with the logged-out early return.
// ---------------------------------------------------------------------------------------------
function immediate(): void {
  console.log('🌅 STARTING INIT')
  print('hi!\ncommit: ' + window.COMMIT)

  // (main.js:17-21 strict-mode probe dropped: the bundle is always strict — assigning to
  // `undefined` is a compile error under strict TS, so the probe can never fire.)

  Req.try_load_auth()

  if (!Req.auth) {
    console.warn('🌇 Not logged in!')
    return
  }
  document.documentElement.dataset.login = ''

  Settings.init()

  Lp.init()

  // get own user
  Lp.chain(
    {
      values: { uid: Req.uid },
      requests: [{ type: 'user', fields: '*', query: 'id = @uid' }],
    },
    (resp: ListMap) => {
      const me = resp.user[0] as User | undefined
      if (!me) {
        console.error(resp, 'me?"')
        throw 'missing user me?'
      }
      console.log('🌄 Got own userdata')
      Req.me = me
      fireMeAvatar()
    },
  )

  Lp.set_status(0, 'active')

  Lp.start_websocket()

  StatusDisplay.prepare(-1)

  Act.pull_recent()

  Nav.start()
}

immediate()

// ---------------------------------------------------------------------------------------------
// dom_ready() — main.js:61. The module bundle runs after the document is parsed (deferred module
// script), so the ready-gate can flip and drain now; nothing enqueues before the bundle runs.
// ---------------------------------------------------------------------------------------------
setImmediateMode()
drainReady()

// main.js:76 — phase-2 runtime window.onerror: route into the sidebar debug console (print),
// replacing the phase-1 boot-dialog handler installed by index.html's early <script>.
window.onerror = (
  message: string | Event,
  source?: string,
  line?: number,
  col?: number,
  error?: Error,
): void => {
  let ok = false
  try {
    // syntax errors may be "muted" for security; fabricate one from the info we have.
    if (!error) {
      error = new Error(String(message))
      error.stack = '@' + source + ':' + line + ':' + col
    }
    print(error)
    ok = true
  } finally {
    if (!ok) alert('error while handling error!')
  }
}

// ---------------------------------------------------------------------------------------------
// Mount React.
// ---------------------------------------------------------------------------------------------
const container = document.getElementById('root')
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
