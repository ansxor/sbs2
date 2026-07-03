import { jsx as _jsx } from "react/jsx-runtime";
// Imperative island: the Scroller-driven chat viewport (ARCHITECTURE §0/§8.1/§10 L6a; scroller.js).
//
// `services/scroller.ts` (L4a) is the class-for-class port with all raw scroll math verbatim. Its
// ONLY intentional edit is the `skipReparent` flag: the vanilla `Scroller` constructor builds a
// `<scroll-middle>` and reparents `$inner` into it (scroller.js) — here React already renders the
// full `outer > scroll-middle > inner` tree in JSX, so the constructor is told to skip that
// insertion and is handed the existing nodes. The final DOM is identical either way, and React and
// the Scroller never fight over the subtree.
//
// Old structure (page.js:151,518-527): `new Scroller(this.$outer, this.$inner)` where
//   <auto-scroller class='FILL' $=outer>
//     <scroll-inner $=inner> …view content… </scroll-inner>   (constructor wraps inner in scroll-middle)
//   </auto-scroller>
// so this host renders `<auto-scroller>` (outer, scrolling element) > `<scroll-middle>` >
// `<scroll-inner>` (inner, transform target) and puts the view content (`$extra`, the
// `MessageListView`, the chat-bottom sentinel) inside `<scroll-inner>` as children.
//
// The Scroller instance is exposed via `onReady` so the view can drive it imperatively around DOM
// mutations — `print/print_top/before_print/after_print/lock/unlock/scroll_instant` (page.js
// display_live + the `Events.after_messages`→`unlock` pairing). `anim_type`/`reverse` are snapshotted
// from the class statics at construction inside the Scroller (NOT wired to reactive state), so
// changing the setting does not retro-update a live instance — verbatim behavior.
import { useLayoutEffect, useRef } from 'react';
import { Scroller } from '../services/scroller';
export function ScrollerHost({ className, innerClassName, children, onReady }) {
    const outerRef = useRef(null);
    const innerRef = useRef(null);
    // Held in a ref so an inline `onReady` can't land in the deps and recreate the Scroller (which
    // would drop its ResizeTracker wiring / scroll state). The Scroller is created once per mount.
    const onReadyRef = useRef(onReady);
    onReadyRef.current = onReady;
    useLayoutEffect(() => {
        const scroller = new Scroller(outerRef.current, innerRef.current, { skipReparent: true });
        onReadyRef.current?.(scroller);
        return () => {
            // Removes this instance's ResizeTracker observations (scroller.js destroy()). React removes
            // the outer/inner elements themselves on unmount.
            scroller.destroy();
        };
    }, []);
    return (_jsx("auto-scroller", { ref: outerRef, className: className, children: _jsx("scroll-middle", { children: _jsx("scroll-inner", { ref: innerRef, className: innerClassName, children: children }) }) }));
}
