import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// MessageInfo (minfo.js → ARCHITECTURE §10, L6g). Lets a parent view select one message and
// emit `message_control` events for it (raw / edit / reply / link) via MessageList.send_mce.
//
// The old class kept an internal `current` and a `set_message(data)` mutator. Here the component
// is CONTROLLED: the parent owns the selection and passes `selected` (Message | null); the close
// button asks the parent to clear via `onClose`. `set_message`'s three effects are reproduced:
//   - the <textarea> shows JSON.stringify(data, null, 1) (or "" when null),
//   - the root is `hidden` unless a message is selected,
//   - the close button is focused whenever the selection changes.
// The textarea is left UNCONTROLLED (value written imperatively) so a user can type into it and
// the value is only reset on the next selection change — exactly as the original behaved.
import { useLayoutEffect, useRef } from 'react';
import { MessageList } from '../services/message-list';
// minfo.js constructor: btn('raw',…), btn('edit',…), btn('reply',…), btn('link',…), in order.
const CONTROLS = [
    ['raw', '📠raw'],
    ['edit', '✏️edit'],
    ['reply', '⤴️reply'],
    ['link', '🔗link'],
];
export function MessageInfo({ selected, onClose }) {
    const rootRef = useRef(null);
    const dataRef = useRef(null);
    const closeRef = useRef(null);
    // The original constructor calls set_message(null) BEFORE the root is attached to the document,
    // so its $close.focus() is a no-op on first run; skip focusing on the initial mount to match.
    const first = useRef(true);
    useLayoutEffect(() => {
        dataRef.current.value = selected ? JSON.stringify(selected, null, 1) : '';
        if (!first.current)
            closeRef.current.focus(); // i guess
        first.current = false;
    }, [selected]);
    // minfo.js: btn.onclick → MessageList.send_mce(action, this.current, this.$root)
    const control = (action) => {
        MessageList.send_mce(action, selected, rootRef.current);
    };
    return (_jsxs("div", { ref: rootRef, className: "message-info", hidden: !selected, children: [_jsx("button", { ref: closeRef, onClick: () => onClose?.(), children: "\u00D7" }), "message info!", _jsx("textarea", { ref: dataRef }), _jsx("div", { children: CONTROLS.map(([action, label]) => (_jsx("button", { "data-action": action, tabIndex: -1, onClick: () => control(action), children: label }, action))) })] }));
}
