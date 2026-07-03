// L8 — pre-React bootstrap side effects (ports src/main.js's top-level + immediate() + dom_ready(),
// plus the load-time monkeypatch/registration side effects that the old src/*.js modules ran on
// eval; ARCHITECTURE §6 "Overall shape", §11 Layer 8, §12 Timing/lifecycle).
//
// Import order matters. main.tsx imports THIS module first (for its side effects) and only then
// calls createRoot(<App/>), so everything below runs before React mounts:
//   1. self-register every view (was each `View.register(...)` at the bottom of a Views/*.js file),
//   2. install the markup renderer monkeypatches + wire the lazy-image loader + focus-nav managers
//      (were top-level statements in view.js / draw.js / keyboard.js — NOT gated on login),
//   3. inject `html_inject` into the DOM before createRoot (was main.js:4 `document.write`),
//   4. run immediate() with the logged-out early-return gate (main.js:13),
//   5. flip the ready-gate to immediate mode + drain, install the phase-2 window.onerror
//      (was dom_ready() on DOMContentLoaded; the module bundle already runs post-parse).
//
// The early inline <script> in index.html already handled ?logout/?nosettings/?api, the settings
// preload, theme application, iOS viewport, the phase-1 boot-dialog window.onerror, and
// window.print=alert. This module takes over from there.
import { print } from '../services/sidebar-log'; // side effect: installs window.print / window.log
import { setImmediateMode, drainReady } from '../core/ready';
import { Req } from '../services/request';
import { Settings } from '../services/settings';
import { Lp } from '../services/socket';
import { Act } from '../services/activity';
import { StatusDisplay } from '../services/status-display';
import { Nav } from '../services/nav';
import { installPatches, setImageLoader } from '../services/markup';
import { load_image } from '../services/lazy-image';
import { installFocusNav } from '../services/focus-nav';
// Self-register every view (import for side effect). Each module bottom calls
// register(name, mod) exactly as the old Views/*.js called View.register(...).
import '../views/PageView';
import '../views/CommentsView';
import '../views/EditView';
import '../views/ImagesView';
import '../views/CategoryView';
import '../views/UserView';
import '../views/AccountView';
// ---------------------------------------------------------------------------------------------
// "own user avatar loaded" notifier (was main.js:47 `do_when_ready(()=>Sidebar.redraw_my_avatar())`
// after fetching Req.me). Sidebar subscribes; boot fires it once the me-chain resolves. Kept here
// (not in Sidebar) because the me fetch is a boot side effect gated on login.
// ---------------------------------------------------------------------------------------------
const meAvatarListeners = new Set();
export function onMeAvatar(cb) {
    meAvatarListeners.add(cb);
    return () => {
        meAvatarListeners.delete(cb);
    };
}
function fireMeAvatar() {
    for (const cb of meAvatarListeners)
        cb();
}
// ---------------------------------------------------------------------------------------------
// Load-time side effects (ungated — these ran when the old src/*.js modules were evaluated,
// regardless of login).
// ---------------------------------------------------------------------------------------------
// draw.js image element factory needs Draw.load_image; wire the lazy-image loader before the
// markup patches install (which reference it).
setImageLoader(load_image);
// view.js / draw.js renderer monkeypatches (sbs:/https: url schemes + create.image).
installPatches();
// keyboard.js roving-tabindex keydown/focusout document managers.
installFocusNav();
(function inject_html() {
    const ls = Settings.values.html_inject;
    if ('string' === typeof ls) {
        const div = document.createElement('div');
        div.innerHTML = ls;
        const root = document.getElementById('root');
        document.body.insertBefore(div, root);
    }
})();
// ---------------------------------------------------------------------------------------------
// immediate() — main.js:13. Synchronous bootstrap with the logged-out early return.
// ---------------------------------------------------------------------------------------------
function immediate() {
    console.log('🌅 STARTING INIT');
    print('hi!\ncommit: ' + window.COMMIT);
    // (main.js:17-21 strict-mode probe dropped: the bundle is always strict — assigning to
    // `undefined` is a compile error under strict TS, so the probe can never fire.)
    Req.try_load_auth();
    if (!Req.auth) {
        console.warn('🌇 Not logged in!');
        return;
    }
    document.documentElement.dataset.login = '';
    Settings.init();
    Lp.init();
    // get own user
    Lp.chain({
        values: { uid: Req.uid },
        requests: [{ type: 'user', fields: '*', query: 'id = @uid' }],
    }, (resp) => {
        const me = resp.user[0];
        if (!me) {
            console.error(resp, 'me?"');
            throw 'missing user me?';
        }
        console.log('🌄 Got own userdata');
        Req.me = me;
        fireMeAvatar();
    });
    Lp.set_status(0, 'active');
    Lp.start_websocket();
    StatusDisplay.prepare(-1);
    Act.pull_recent();
    Nav.start();
}
immediate();
// ---------------------------------------------------------------------------------------------
// dom_ready() — main.js:61. The module bundle runs after the document is parsed (deferred module
// script), so the ready-gate can flip and drain now; nothing enqueues before the bundle runs.
// ---------------------------------------------------------------------------------------------
setImmediateMode();
drainReady();
// main.js:76 — phase-2 runtime window.onerror: route into the sidebar debug console (print),
// replacing the phase-1 boot-dialog handler installed by index.html's early <script>.
window.onerror = (message, source, line, col, error) => {
    let ok = false;
    try {
        // syntax errors may be "muted" for security; fabricate one from the info we have.
        if (!error) {
            error = new Error(String(message));
            error.stack = '@' + source + ':' + line + ':' + col;
        }
        print(error);
        ok = true;
    }
    finally {
        if (!ok)
            alert('error while handling error!');
    }
};
