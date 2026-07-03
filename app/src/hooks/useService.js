// The React↔service bridge (ARCHITECTURE §7/§10, L6b) — the ONLY place `useSyncExternalStore`
// lives. Every hook subscribes to a plain-TS service; NO service imports React. Services own the
// truth and remain the sole writers of the `data-*` root attributes; these hooks only READ.
//
// Replaces the L0 frozen-contract stub. Exported signatures are kept identical to that stub.
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { Settings } from '../services/settings';
import { Events } from '../services/events';
import { Nav } from '../services/nav';
import { Req } from '../services/request';
// ---- useSetting ---------------------------------------------------------------------------
// Read a single setting value reactively. Settings.subscribe fires on any value change (it is a
// global, not per-name, notifier — settings.js has no per-key events); getSnapshot re-reads the
// one name, so a change to an unrelated setting is a cheap no-op re-read that yields the same
// value and does not force a visible re-render.
export function useSetting(name) {
    return useSyncExternalStore(Settings.subscribe, () => Settings.get(name));
}
// ---- useBusListener -----------------------------------------------------------------------
// Subscribe a component to an Events bus category, reproducing `Events.listen`/`listen_id` +
// teardown-on-unmount == `Events.destroy(view)` on navigation. This is NOT a store read (it does
// not return a value); it is a managed subscription.
//
// A unique `view` object identifies this subscription so its cleanup removes exactly this
// listener (Listeners has no remove-single; on_destroy(view) bulk-removes by view identity, and
// our view is used nowhere else). The latest `cb` is held in a ref so a changing callback does
// NOT re-subscribe — re-subscribing would move the handler to the end of the registration-order
// dispatch list, an observable change. The stable wrapper always calls the current cb.
export function useBusListener(cat, cb, opts) {
    const id = opts?.id;
    const cbRef = useRef(cb);
    useLayoutEffect(() => {
        cbRef.current = cb;
    });
    useEffect(() => {
        const view = {};
        const wrapper = (...data) => {
            cbRef.current(...data);
        };
        const bucket = Events[cat];
        if (id !== undefined)
            bucket.listen_id(view, id, wrapper);
        else
            bucket.listen(view, wrapper);
        return () => {
            bucket.on_destroy(view);
        };
    }, [cat, id]);
}
// ---- useNavSlots --------------------------------------------------------------------------
// The parsed slot list from the hash router. Nav.getSlots returns a stable snapshot reference
// (only replaced when the slots array changes), so useSyncExternalStore never loops.
export function useNavSlots() {
    return useSyncExternalStore(Nav.subscribe, Nav.getSlots);
}
// ---- root-attribute store (login + socket state) ------------------------------------------
// Login and socket state are surfaced to CSS as `data-*` attributes on documentElement, written
// imperatively by the services (request.ts / main / socket.ts). These read-only hooks observe
// those same attributes via a MutationObserver and derive their snapshot from the live DOM,
// never driving the state themselves.
function subscribeDocEl(onChange) {
    const obs = new MutationObserver(onChange);
    obs.observe(document.documentElement, { attributes: true });
    return () => obs.disconnect();
}
// Cached snapshots: useSyncExternalStore requires getSnapshot to return a stable reference while
// the underlying values are unchanged, or React would loop. These are module-level singletons
// because the state is a single global (one documentElement).
let loginSnapshot = { loggedIn: false, uid: 0 };
function getLoginSnapshot() {
    const loggedIn = document.documentElement.hasAttribute('data-login');
    const uid = Req.uid ?? 0;
    if (loginSnapshot.loggedIn !== loggedIn || loginSnapshot.uid !== uid)
        loginSnapshot = { loggedIn, uid };
    return loginSnapshot;
}
let socketSnapshot = { state: '', pending: false };
function getSocketSnapshot() {
    const state = document.documentElement.dataset.socketState ?? '';
    const pending = document.documentElement.hasAttribute('data-socket-pending');
    if (socketSnapshot.state !== state || socketSnapshot.pending !== pending)
        socketSnapshot = { state, pending };
    return socketSnapshot;
}
// ---- useLoginState ------------------------------------------------------------------------
// `data-login` present == logged in; uid mirrors Req.uid (set at try_load_auth / cleared on
// log_out, both of which also toggle data-login → the observer refreshes uid too).
export function useLoginState() {
    return useSyncExternalStore(subscribeDocEl, getLoginSnapshot);
}
// ---- useSocketState -----------------------------------------------------------------------
// Reads Lp's `data-socket-state` value + `data-socket-pending` presence; drives nothing itself.
export function useSocketState() {
    return useSyncExternalStore(subscribeDocEl, getSocketSnapshot);
}
