// Edit — undo-safe <textarea>/<input> mutation via document.execCommand (keyboard.js →
// ARCHITECTURE §9, §10, L4e). These MUST keep using execCommand('insertText'|'delete') on a
// selection rather than assigning `.value`, so the browser's native undo history survives; the
// message box and the page editor therefore stay UNCONTROLLED (ref-based) in the React port so
// Edit can mutate them and undo keeps working. Ported verbatim from keyboard.js:8-28. The
// NAMESPACE (Object.seal) wrapper is dropped per the architecture's drop-the-seal rule; the
// object is a plain module singleton.
export const Edit = {
    // keyboard.js:9-12 — clear content, preserving undo.
    clear(elem) {
        elem.select();
        document.execCommand('delete');
    },
    // keyboard.js:13-19 — replace whole content, preserving undo. Empty text collapses to delete.
    set(elem, text) {
        elem.select();
        if (text)
            document.execCommand('insertText', false, text);
        else
            document.execCommand('delete');
    },
    // keyboard.js:20-23 — insert at the caret.
    insert(elem, text) {
        elem.focus();
        document.execCommand('insertText', false, text);
    },
    // keyboard.js:24-27 — generic exec (used for 'undo'/'redo'). The variadic tail is narrowed to
    // execCommand's single optional value arg (the only arg any caller ever forwards).
    exec(elem, command, ...args) {
        elem.focus();
        document.execCommand(command, false, ...args);
    },
};
