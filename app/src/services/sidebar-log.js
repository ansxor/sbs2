// sidebar-log.ts — the print/log sink backing window.print / window.log, plus the
// value/error renderers used by the sidebar debug console and the routing error view.
//
// Near-verbatim port of the renderer half of src/debug.js (Debug.format_error /
// Debug.sidebar_debug) together with the window.print / window.log wiring from the tail
// of src/sidebar.js. The imperative DOM console (deferral, reentrancy guard, 500-message
// cap, scroller append) is owned by the L6 Sidebar/DebugPanel, which registers itself as
// the sink via setPrintSink(). Until a sink is registered, printed batches buffer so no
// early log lines are lost (the faithful analog of the old do_when_ready deferral).
let sink = null;
const pending = [];
// Register (or clear, with null) the console sink. On registration, any batches that were
// printed before the sink existed are flushed in order.
export function setPrintSink(fn) {
    sink = fn;
    if (fn) {
        while (pending.length)
            fn(pending.shift());
    }
}
// The app-wide console entry point. Installed as window.print below; ported services and
// views call it by bare name (`print(...)`) via the ambient global declaration.
export function print(...args) {
    if (sink)
        sink(args);
    else
        pending.push(args);
}
// ---------------------------------------------------------------------------
// renderers (from src/debug.js — Firefox stack parser kept verbatim)
// ---------------------------------------------------------------------------
// Debug.format_error — bound to 𐀶`<pre>` in the original (this() = a fresh <pre>).
export function format_error(thing) {
    const s = document.createElement('pre');
    let out = "";
    let pf = null;
    for (let line of thing.stack.split("\n")) {
        if (line == "")
            continue;
        const at = line.split("@");
        if (at.length == 2) {
            const file = at[1].replace(BASE_URL, "");
            const star = at[0].split("*");
            if (star.length == 2) {
                at[0] = star[1];
            }
            const func = pf;
            pf = at[0];
            if (func != null)
                line = "↓" + func + "() - " + file; //🙚❧🙘 //🙯⸽🙘
            else
                line = "💥 - " + file;
            if (star.length == 2) {
                out = ":<async " + star[0] + ">\n" + out;
            }
            out = line + "\n" + out;
        }
        else {
            out = ":(\n" + thing.stack;
            break;
        }
    }
    s.textContent = out;
    return s;
}
//📥 thing‹???›
//📤 ‹ParentNode›
// Debug.sidebar_debug — bound to {message: 𐀶`<div class='debugMessage pre'>`} in the
// original (this.message() = a fresh <div class="debugMessage pre">).
export function sidebar_debug(thing) {
    const e = document.createElement('div');
    e.className = 'debugMessage pre';
    switch (thing === null ? 'null' : typeof thing) {
        // Original stacks the primitive cases above `case 'string'` and falls through after
        // `thing = String(thing)`. Merged here (noFallthroughCasesInSwitch); String() on an
        // already-string value is identical, so the appended text is unchanged.
        case 'boolean':
        case 'number':
        case 'bigint':
        case 'undefined':
        case 'null':
        case 'symbol':
        case 'string':
            {
                e.append(String(thing));
            }
            break;
        case 'function':
            {
                const src = Function.prototype.toString.call(thing);
                e.append(src);
            }
            break;
        case 'object': {
            if (thing instanceof Error) {
                const s = format_error(thing);
                e.append(s);
                e.append(thing.toString());
                break;
            }
            if (thing instanceof Element) {
                let text = "<" + thing.tagName;
                // technically this could fail if e.g. a class inherits from Element and overrides .attributes to do something weird..
                for (const x of thing.attributes) {
                    text += ` ${x.name}="${x.value.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`;
                }
                text += ">";
                if (thing.childElementCount)
                    text += `\n(${thing.childElementCount} childs)`;
                e.append(text);
                break;
            }
            let text = "{???}";
            const pro = Object.getPrototypeOf(thing);
            if (pro === Object.prototype) {
                text = "{...}";
            }
            else if (pro === null) {
                text = "{null}";
            }
            else if (pro && pro.constructor) {
                const c = pro.constructor;
                if (c && c.name && 'string' == typeof c.name)
                    text = `{new ${c.name}}`;
            }
            e.append(text);
        }
    }
    return e;
}
// ---------------------------------------------------------------------------
// window.print / window.log wiring (src/sidebar.js:318-323)
// ---------------------------------------------------------------------------
// Overrides the native window.print (and the early-init `window.print = window.alert`
// fallback) so bare `print(...)` app-wide reaches this sink. `log` is a magic global:
// reading it returns print; assigning `log = x` prints x.
window.print = print;
Object.defineProperty(window, 'log', {
    configurable: true,
    get() { return window.print; },
    set(x) { window.print(x); },
});
