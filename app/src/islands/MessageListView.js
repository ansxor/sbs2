import { jsx as _jsx } from "react/jsx-runtime";
// Imperative island: the chat MessageList (ARCHITECTURE §0/§8.2/§10 L6a; rendering.md messages.js).
//
// `services/message-list.ts` (L4b) is the verbatim imperative controller — circular linked list,
// positional DOM building, the shared `<message-controls>` singleton, the `message_control`
// CustomEvent capture-phase injection, `%uid%` in-place text mutation, and the tri-state
// `display_live` return. This component is the thin React host: it renders an EMPTY
// `<message-list>` container, hands it to a `MessageList` in a `useLayoutEffect`, subscribes to
// `Events.messages` / `Events.after_messages` imperatively under a private view identity, and
// disposes on unmount. **React never renders a message** — no JSX children, no
// `dangerouslySetInnerHTML`; the controller owns everything inside the container.
//
// The old views wired this by hand:
//   - page.js:152,165-166,169-174 — `new MessageList($message_list, page_id)`, `display_edge`
//     the initial batch, then `Events.messages.listen(this, m=>this.display_live(m))` +
//     `Events.after_messages.listen(this, ()=>this.scroller.unlock())`, torn down by
//     `Events.destroy(this)` on nav.
//   - comments.js:219-225 — a static `new MessageList(inner, contentId)` populated with
//     `display_edge` / `display_only`, no live subscription.
// Both reduce to: create the controller (exposed via `onReady` so the view can populate the
// initial edges and drive its Scroller), optionally subscribe live. The live handlers are held in
// refs so a re-render can't stale-close them AND can't recreate the controller (which would drop
// the linked list / DOM). Subscription args are forwarded verbatim — `Events.messages` fires
// `(comments, message_event)`, matching the old `(messages)=>…` closure.
import { useLayoutEffect, useRef } from 'react';
import { MessageList } from '../services/message-list';
import { Events } from '../services/events';
export function MessageListView({ pageId, edit, onReady, onMessages, onAfterMessages, }) {
    const ref = useRef(null);
    // Latest callbacks, held in refs so a re-render (e.g. an inline `onReady`/`onMessages`) can't
    // stale-close them AND can't land in the effect deps below — which would recreate the whole
    // MessageList and drop its linked list + DOM. Only pageId/edit (a genuinely different list)
    // recreate the controller.
    const onReadyRef = useRef(onReady);
    const onMessagesRef = useRef(onMessages);
    const onAfterMessagesRef = useRef(onAfterMessages);
    onReadyRef.current = onReady;
    onMessagesRef.current = onMessages;
    onAfterMessagesRef.current = onAfterMessages;
    useLayoutEffect(() => {
        const list = new MessageList(ref.current, pageId, edit);
        // Private per-instance bus key: `Events.destroy(view)` bulk-removes every listener registered
        // under it, isolating this island's live subscription from the view's other listeners.
        const view = {};
        // page.js populates the initial edges (and stashes the list) BEFORE subscribing live.
        onReadyRef.current?.(list);
        Events.messages.listen(view, (...data) => {
            onMessagesRef.current?.(...data);
        });
        Events.after_messages.listen(view, (...data) => {
            onAfterMessagesRef.current?.(...data);
        });
        return () => {
            // Reproduces the old `Events.destroy(this)` on nav teardown. React removes the
            // `<message-list>` container itself, disposing the controller's DOM and its
            // `message_control` capture listener with it.
            Events.destroy(view);
        };
        // Stable identity deps only — never the callbacks (kept in refs above).
    }, [pageId, edit]);
    return _jsx("message-list", { ref: ref });
}
