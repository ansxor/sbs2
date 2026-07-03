import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// DebugPanel (debug.js Debug.onload/eval → ARCHITECTURE §10, L6g). The `js eval:` textarea in the
// sidebar user panel: on Enter (without Shift, and not while an IME is composing) it evaluates the
// textarea's contents, printing ">"+code, then the result or the thrown error to the sidebar log
// (window.print, backed by services/sidebar-log). The input is cleared afterwards via Edit.clear
// (undo-preserving). The keydown handler is wired imperatively (as the original `.onkeydown` was)
// so `e.isComposing` and preventDefault behave exactly like the native handler.
import { useLayoutEffect, useRef } from 'react';
import { Edit } from '../services/edit';
// debug.js Debug.eval — evaluate `code`, printing the echo, the result, or the error.
function runEval(code) {
    print('>' + code);
    try {
        // Direct eval, mirroring debug.js's dev-only console. (Bundling narrows the visible lexical
        // scope vs the old global-script world, but the print/eval/print-error mechanism is identical.)
        const res = eval(code);
        print(res);
    }
    catch (e) {
        print(e);
    }
}
export function DebugPanel() {
    const ref = useRef(null);
    useLayoutEffect(() => {
        const el = ref.current;
        el.onkeydown = (e) => {
            if (e.isComposing)
                return;
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const code = el.value;
                if (!code)
                    return;
                runEval(code);
                Edit.clear(el);
            }
        };
        return () => {
            el.onkeydown = null;
        };
    }, []);
    return (_jsxs("div", { className: "loggedOut registerBox", children: ["js eval:", _jsx("textarea", { id: "$debugInput", className: "code-textarea", ref: ref })] }));
}
