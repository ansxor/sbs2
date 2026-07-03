// L5b — protected-view navigation blocker (ports View.protect/beforeunload from view.js:130
// and the ViewSlot.destroy / handle_view2 `confirm("are you sure you want to leave this
// view?")` guards from navigate.js:118/190; ARCHITECTURE §6/§12).
//
// A view (EditView, L7c) marks its slot protected while it holds unsaved changes. Leaving that
// slot is guarded three ways, reproducing the original:
//   1. full page unload  → window.onbeforeunload preventDefault (browser "leave site?" prompt);
//   2. the slot's close button (× in Slot.tsx) → confirm_leave() before removing the slot;
//   3. a `#`-link click inside the protected slot → a capture-phase listener on `window`
//      (which fires BEFORE Nav's document-capture link handler) confirms and blocks navigation
//      if declined.
//
// A protected slot is identified by its live `<view-slot>` element (was the BaseView instance in
// `View.protected`); the Slot passes its root element in.
const CONFIRM_TEXT = 'are you sure you want to leave this view?';
// was View.protected (a Set of view instances) — here a Set of `<view-slot>` elements.
const protectedSlots = new Set();
// view.js:147 View.beforeunload
function beforeunload(ev) {
    if (protectedSlots.size)
        ev.preventDefault();
}
// view.js:130 View.protect(view, state) — toggle protection for a slot, installing/removing the
// beforeunload blocker exactly as the set becomes non-empty / empty. `window.onbeforeunload` is
// only replaced when its current value matches (the original's `if (!window.onbeforeunload)` /
// `if (window.onbeforeunload)` guards), so an unrelated handler is never clobbered.
export function protect(slot, state) {
    if (protectedSlots.has(slot) === state)
        return;
    if (state)
        protectedSlots.add(slot);
    else
        protectedSlots.delete(slot);
    if (protectedSlots.size) {
        if (!window.onbeforeunload)
            window.onbeforeunload = beforeunload;
    }
    else {
        if (window.onbeforeunload)
            window.onbeforeunload = null;
    }
}
export function is_protected(slot) {
    return protectedSlots.has(slot);
}
// navigate.js:118/190 — confirm before leaving a protected slot. Returns true to proceed
// (unprotected slots always proceed). Called by Slot.tsx's close button.
export function confirm_leave(slot) {
    if (!protectedSlots.has(slot))
        return true;
    return window.confirm(CONFIRM_TEXT);
}
// In-app link navigation guard. A capture-phase click listener on `window` runs before Nav's
// document-capture link interceptor (capture order: window → document), so declining here and
// stopping propagation prevents Nav from loading the new url — i.e. keeps the old view, matching
// the original confirm-on-leave. Only `#`-links (Nav's own links) inside a protected slot, and
// not in-page `target="self"` anchor scrolls, are guarded.
window.addEventListener('click', (ev) => {
    if (!protectedSlots.size)
        return;
    const el = ev.target;
    const link = (el instanceof Element ? el.closest(':any-link') : null);
    if (!link)
        return;
    if (link.target === 'self')
        return; // in-page anchor scroll — no navigation, no confirm
    let href = link.getAttribute('href'); // note: can't use link.href
    if (href && href.startsWith('https://oboy.smilebasicsource.com/12/'))
        href = link.hash;
    if (!href || !href.startsWith('#'))
        return;
    const slotEl = link.closest('view-slot');
    if (!slotEl || !protectedSlots.has(slotEl))
        return;
    if (!window.confirm(CONFIRM_TEXT)) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
    }
}, { capture: true });
