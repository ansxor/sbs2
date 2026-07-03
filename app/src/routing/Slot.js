import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// L5b — one on-screen slot (ports the ViewSlot DOM + focus/close behavior from navigate.js:5–282
// and the ErrorView template from view.js:116; ARCHITECTURE §6/§12). Emits the exact custom
// tags/classes the reused CSS targets (<view-slot>/<view-header>/<view-root>, focused,
// loading/rendering/error, slot-close, ...). The load lifecycle lives in useViewLifecycle; the
// header portal in SlotHeaderContext.
import { useLayoutEffect, useMemo, useRef } from 'react';
import { Nav } from '../services/nav';
import { Lp } from '../services/socket';
import { createSlotHeaderApi, SlotHeaderContext } from './SlotHeaderContext';
import { confirm_leave } from './protect';
import { useViewLifecycle } from './useViewLifecycle';
// view.js:116 ErrorView — a <view-root> holding the (imperatively-injected) error message Node
// and the location JSON. The message is a DOM Node (from sidebar_debug), so it is appended via a
// ref rather than rendered as a React child.
function ErrorView({ message, location }) {
    const msgRef = useRef(null);
    useLayoutEffect(() => {
        const el = msgRef.current;
        if (!el)
            return;
        el.replaceChildren();
        if (message)
            el.append(message);
    }, [message]);
    return (_jsxs("view-root", { style: { overflowY: 'auto' }, children: [_jsx("div", { className: "errorPage", ref: msgRef }), _jsx("div", { className: "pre", style: { font: 'var(--T-monospace-font)' }, children: location })] }));
}
export function Slot({ slot, url, focused }) {
    const rootRef = useRef(null);
    const titleRef = useRef(null);
    const buttonsRef = useRef(null);
    const extraRef = useRef(null);
    // stable per-slot header api (reads the header nodes lazily at call time)
    const header = useMemo(() => createSlotHeaderApi({
        title: () => titleRef.current,
        buttons: () => buttonsRef.current,
        extra: () => extraRef.current,
    }), []);
    const { loadState, error, render } = useViewLifecycle(url, header);
    // navigate.js:29/32 — mousedown/focusin (capture) grab focus for this slot.
    const grab_focus = () => Nav.set_focus(slot);
    // navigate.js:36 — the close (×) button. Confirm first if the current view is protected
    // (navigate.js:118 destroy()), remove the slot preserving the identities of the others, push
    // the new address, then reconcile the (already-updated) hash to notify React so this slot
    // unmounts. Reconciling the current hash is a no-op reload of the survivors (their urls are
    // unchanged) but re-emits the store snapshot.
    const on_close = () => {
        const el = rootRef.current;
        if (el && !confirm_leave(el))
            return;
        const idx = Nav.slots.indexOf(slot);
        if (idx !== -1)
            Nav.slots.splice(idx, 1);
        Nav.set_address(false); // pushState with the new url
        Lp.flush_statuses();
        Nav.update_from_fragment(window.location.hash.substring(1)); // notify → unmount this slot
    };
    const headerClass = [
        loadState === 2 ? 'rendering' : '',
        loadState === 1 ? 'loading' : '',
        error ? 'error' : '',
    ]
        .filter(Boolean)
        .join(' ');
    return (_jsxs("view-slot", { ref: rootRef, className: focused ? 'COL focused' : 'COL', onMouseDownCapture: grab_focus, onFocusCapture: grab_focus, children: [_jsx("div", { className: "slot-overlay" }), _jsx("span", { tabIndex: 0, accessKey: "q", className: "header-focus-anchor" }), _jsxs("view-header", { className: headerClass || undefined, children: [_jsxs("div", { children: [_jsx("div", { ref: extraRef }), _jsx("h1", { ref: titleRef, className: "ellipsis" })] }), _jsx("span", { className: "header-buttons ROW", ref: buttonsRef }), _jsx("button", { className: "slot-close", onClick: on_close, children: "\u00D7" })] }), _jsx(SlotHeaderContext.Provider, { value: header, children: render.kind === 'view' ? (_jsx(render.Component, { data: render.data, loc: render.loc, header: header })) : render.kind === 'error' ? (_jsx(ErrorView, { message: render.message, location: render.location })) : null })] }));
}
