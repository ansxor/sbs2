import { jsx as _jsx } from "react/jsx-runtime";
// L6d — src/input.js ported. A declarative form/input widget system (`Form` + `INPUTS`
// registry) built as a <form-table> grid of typed inputs. Ported UNCONTROLLED (ARCHITECTURE
// §9): every input keeps a JS-typed in-memory `value` (the source of truth) separate from the
// DOM element's string value. `read()` pulls DOM→value, `write()` pushes value→DOM, and these
// are NEVER automatic — `attach_onchange()` always returns null (this.auto is never set), so DOM
// `change` events do not sync into `value`. Callers must `read()` before `get()`/`to_query()`.
//
// Only two callers exist (both L7): FileUploader (upload.js) and CommentsView (comments.js).
//
// React only mounts the container: `useForm(spec)` builds the imperative controller (a near-
// verbatim port of `class Form`) and returns it as a ref-stable handle; `<Form handle={...}/>`
// renders the <form-table> host and moves the pre-built children into it. React never diffs
// inside the form-table. The flat grid child ordering (label div + field element, no per-field
// wrapper) is preserved exactly or the CSS grid (layout.css) breaks.
import { useLayoutEffect, useRef } from 'react';
// fill.js:164 — safe .match returning [] on no match (destructuring never throws).
function rmatch(re, str) {
    if (typeof str != 'string')
        throw new TypeError('RegExp.rmatch() expects string');
    return str.match(re) || [];
}
// ---- GenericInput (base) ----
class GenericInput {
    static unique_id() {
        this.html_id++;
        return 'input-' + this.html_id;
    }
    constructor(p) {
        Object.defineProperty(this, "p", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "html_id", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "default", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "_value", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        // never assigned anywhere → attach_onchange() always returns null (kept quirk).
        Object.defineProperty(this, "auto", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        // used by GenericInput.toString / text draw
        Object.defineProperty(this, "type", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        // word_list draw writes here instead of input.placeholder (kept quirk)
        Object.defineProperty(this, "placeholder", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "output", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "elem", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.p = p;
        this.value = p.default;
        this.default = p.default;
        this.html_id = GenericInput.unique_id();
    }
    // select/word_list/output do not override these; calling them throws (as in the original,
    // where the method is simply undefined). Only ever reached for inputs with a truthy p.param,
    // which none of those types have — so this is never hit in practice.
    to_query() {
        throw new TypeError('input.to_query is not a function');
    }
    from_query(_s) {
        throw new TypeError('input.from_query is not a function');
    }
    toString() {
        return `Input.${this.type}()`;
    }
    attach_onchange() {
        if (!this.auto)
            return null;
        return () => {
            this.read();
            if (this.p.onchange)
                this.p.onchange(this.value);
        };
    }
    reset() {
        if (this.default === undefined)
            this._value = null;
        else
            this._value = this.default;
    }
    get value() {
        return this._value;
    }
    set value(v) {
        if (v === undefined)
            this.reset();
        else
            this._value = v;
    }
}
Object.defineProperty(GenericInput, "html_id", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 0
});
function elem(x) {
    return document.createElement(x);
}
// ---- input registry ----
class SelectInput extends GenericInput {
    constructor(p) {
        super(p);
        Object.defineProperty(this, "options", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "allow_extra", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "input", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "extra_option", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "extra_value", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        this.options = p.options;
        this.allow_extra = p.allow_extra;
    }
    draw() {
        this.elem = this.input = document.createElement('select');
        this.input.onchange = this.attach_onchange();
        this.input.id = this.html_id;
        function option(value, label) {
            const o = document.createElement('option');
            o.value = value;
            o.append(label);
            return o;
        }
        const labels = this.p.option_labels || this.options;
        this.input.append(...labels.map((label, i) => option(String(i), label)));
        this.extra_option = option('extra', '');
    }
    read() {
        const raw = this.input.value;
        if (raw == 'extra') {
            this.value = this.extra_value;
            return;
        }
        else {
            const v = raw | 0;
            if (v >= 0 && v < this.options.length) {
                this.value = this.options[v];
                return;
            }
        }
        this.value = this.default;
    }
    write() {
        const v = this.value;
        const i = this.options.indexOf(v);
        if (i >= 0) {
            this.extra_option.remove();
            this.input.value = String(i);
        }
        else {
            this.extra_value = v;
            try {
                this.extra_option.textContent = 'Unknown value: ' + v;
            }
            catch (e) {
                print('input dropdown error invalid value??', e);
                this.extra_option.textContent = 'Unknown value: ???';
            }
            this.input.append(this.extra_option);
            this.input.value = 'extra';
        }
    }
}
class CheckboxInput extends GenericInput {
    constructor() {
        super(...arguments);
        Object.defineProperty(this, "input", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
    }
    draw() {
        this.elem = this.input = document.createElement('input');
        this.input.id = this.html_id;
        this.input.type = 'checkbox';
        this.input.onchange = this.attach_onchange();
    }
    read() {
        this.value = this.input.checked;
    }
    write() {
        this.input.checked = this.value;
    }
    to_query() {
        return this.value ? '' : null;
    }
    from_query(s) {
        this.value = s != null;
    }
}
class TextInput extends GenericInput {
    constructor(p) {
        super(p);
        Object.defineProperty(this, "confirm", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "input", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "input2", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.confirm = p.confirm;
        this.type = p.type;
    }
    draw() {
        this.elem = this.input = elem('input');
        this.input.id = this.html_id;
        this.input.placeholder = 'text';
        if (this.type == 'password')
            this.input.type = 'password';
        else if (this.type == 'email')
            this.input.type = 'email';
        this.input.onchange = this.attach_onchange();
        if (this.confirm == true) {
            this.confirm = true;
            this.elem = document.createElement('div');
            this.input2 = elem('input');
            this.input2.placeholder = '(repeat)';
            this.input2.type = this.input.type;
            this.input2.onchange = this.input.onchange;
            this.elem.append(this.input, this.input2);
        }
    }
    read() {
        let v = this.input.value;
        if (this.confirm) {
            if (v != this.input2.value)
                v = null;
        }
        if (v == '')
            v = null;
        this.value = v;
    }
    write() {
        this.input.value = this.value || '';
        if (this.confirm)
            this.input2.value = '';
    }
    to_query() {
        return this.value;
    }
    from_query(s) {
        this.value = s;
    }
}
class RangeInput extends GenericInput {
    constructor() {
        super(...arguments);
        Object.defineProperty(this, "input", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
    }
    draw() {
        this.elem = this.input = elem('input');
        this.input.id = this.html_id;
        this.input.placeholder = 'min-max or id list';
        this.input.onchange = this.attach_onchange();
    }
    decode(x) {
        if (x == '' || x == null) {
            this.value = null;
            return;
        }
        const [match, min, max] = rmatch(/^(\d*)-(\d*)$/, x);
        if (match) {
            this.value = {
                min: min ? Number(min) : null,
                max: max ? Number(max) : null,
            };
        }
        else {
            this.value = { ids: x.split(',').map((y) => Number(y)) };
        }
    }
    encode() {
        const x = this.value;
        if (x == null)
            return null;
        if (x.ids != null)
            return x.ids.join(',');
        if (x.min != null && x.max != null)
            return `${x.min}-${x.max}`;
        if (x.min != null)
            return `${x.min}-`;
        if (x.max != null)
            return `0-${x.max}`;
        return null;
    }
    read() {
        this.decode(this.input.value);
    }
    write() {
        this.input.value = this.encode() || '';
    }
    to_query() {
        return this.encode();
    }
    from_query(s) {
        this.decode(s);
    }
}
class TextareaInput extends GenericInput {
    constructor() {
        super(...arguments);
        Object.defineProperty(this, "input", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
    }
    draw() {
        this.elem = this.input = elem('textarea');
        this.input.id = this.html_id;
        this.input.onchange = this.attach_onchange();
    }
    // NO-OP quirk kept: reads this.value (in-memory), NOT this.input.value.
    read() {
        let v = this.value;
        if (v == '')
            v = null;
        this.value = v;
    }
    write() {
        this.input.value = this.value || '';
    }
    to_query() {
        return this.value;
    }
    from_query(s) {
        this.value = s;
    }
}
class NumberInput extends GenericInput {
    constructor() {
        super(...arguments);
        Object.defineProperty(this, "input", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
    }
    draw() {
        this.elem = this.input = elem('input');
        this.input.id = this.html_id;
        this.input.type = 'number';
        this.input.onchange = this.attach_onchange();
    }
    read() {
        this.value = this.input.value == '' ? null : Number(this.input.value);
    }
    write() {
        this.input.value = this.value == null ? '' : String(this.value);
    }
    to_query() {
        return this.value == null ? null : String(this.value);
    }
    from_query(s) {
        this.value = s == null ? null : Number(s);
    }
}
class NumberListInput extends GenericInput {
    constructor() {
        super(...arguments);
        Object.defineProperty(this, "input", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
    }
    draw() {
        this.elem = this.input = elem('input');
        this.input.id = this.html_id;
        this.input.pattern = ' *(\\d+( *[, ] *\\d+)*)? *';
        this.input.placeholder = 'list of numbers';
        this.input.onchange = this.attach_onchange();
    }
    read() {
        const m = this.input.value.match(/[^,\s]+/g);
        if (m)
            this.value = m.map((x) => Number(x));
        else
            this.value = null;
    }
    write() {
        if (this.value == null)
            this.input.value = '';
        else
            this.input.value = this.value.join(',');
    }
    to_query() {
        return this.value ? this.value.join(',') : null;
    }
    from_query(s) {
        if (s)
            this.value = s.match(/[^,\s]+/g).map((x) => Number(x));
        else
            this.value = null;
    }
}
class WordListInput extends GenericInput {
    constructor() {
        super(...arguments);
        Object.defineProperty(this, "input", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
    }
    draw() {
        this.elem = this.input = elem('input');
        this.input.id = this.html_id;
        // quirk: sets this.placeholder (dead) instead of this.input.placeholder
        this.placeholder = 'list of words';
        this.input.onchange = this.attach_onchange();
    }
    read() {
        const words = this.input.value.match(/[^\s]+/g);
        this.value = words;
    }
    write() {
        this.input.value = this.value == null ? '' : this.value.join(' ');
    }
}
class DateInput extends GenericInput {
    constructor(p) {
        super(p);
        Object.defineProperty(this, "shortcuts", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "input1", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "input2", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.shortcuts = !!p.date_shortcuts;
    }
    draw() {
        this.elem = elem('div');
        this.input1 = elem('input');
        this.input1.id = this.html_id;
        this.input1.type = 'date';
        this.elem.append(this.input1);
        this.input2 = elem('input');
        this.input2.type = 'time';
        this.elem.append(this.input2);
        const oc = (this.input2.onchange = this.input1.onchange = this.attach_onchange());
        if (this.shortcuts) {
            // HACK
            for (const [label, prop] of [
                ['−1y', 'FullYear'],
                ['−1mo', 'Month'],
            ]) {
                const btn = elem('button');
                btn.type = 'button';
                btn.textContent = label;
                btn.onclick = (ev) => {
                    const old = this.value;
                    this.read();
                    if (!this.value)
                        this.value = new Date();
                    const d = this.value;
                    if (prop === 'FullYear')
                        d.setFullYear(d.getFullYear() - 1);
                    else
                        d.setMonth(d.getMonth() - 1);
                    this.write();
                    this.value = old;
                    oc && oc(ev);
                };
                this.elem.append(btn);
            }
        }
    }
    read() {
        // local time (cannot use valueAsNumber/valueAsDate — those read UTC)
        const [m1, year, month, day] = rmatch(/(\d+)-(\d+)-(\d+)/, this.input1.value);
        if (!m1) {
            this.value = null;
        }
        else {
            const t = rmatch(/(\d+):(\d+)(?::([\d.]+))?/, this.input2.value);
            let hour = t[1];
            let minute = t[2];
            let second = t[3];
            if (!t[0])
                hour = minute = second = 0;
            this.value = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Math.floor(Number(second) || 0));
        }
    }
    write() {
        const v = this.value;
        let date = '', time = '';
        function str(x, len = 2) {
            return String(x).padStart(len, '0');
        }
        if (v) {
            date = str(v.getFullYear(), 4) + '-' + str(v.getMonth() + 1) + '-' + str(v.getDate());
            time = str(v.getHours()) + ':' + str(v.getMinutes());
        }
        this.input1.value = date;
        this.input2.value = time;
    }
    to_query() {
        return this.value ? this.value.toISOString() : null;
    }
    from_query(s) {
        if (s)
            this.value = new Date(s);
        else
            this.value = null;
    }
}
class OutputInput extends GenericInput {
    constructor(p) {
        super(p);
        Object.defineProperty(this, "input", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.output = true;
    }
    draw() {
        this.input = elem('output');
        this.elem = this.input;
    }
    write() {
        this.input.value = this.value || '';
    }
    read() {
        // useless
        this.value = this.input.value || null;
    }
}
const INPUTS = {
    select: SelectInput,
    checkbox: CheckboxInput,
    text: TextInput,
    range: RangeInput,
    textarea: TextareaInput,
    number: NumberInput,
    number_list: NumberListInput,
    word_list: WordListInput,
    date: DateInput,
    output: OutputInput,
};
// ---- Form controller (port of `class Form`) ----
class FormController {
    constructor(p) {
        Object.defineProperty(this, "inputs", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "elem", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.inputs = Object.create(null);
        this.elem = document.createElement('form-table');
        const body = this.elem;
        for (const [name, type, opt] of p.fields) {
            const Ctor = INPUTS[type];
            const input = new Ctor(opt);
            input.name = name;
            this.inputs[name] = input;
            input.draw();
            const lc = document.createElement('div');
            lc.className = 'label';
            body.append(lc);
            const label = document.createElement('label');
            lc.append(label);
            label.htmlFor = input.html_id;
            label.textContent = opt.label + ':';
            input.elem.className += ' field';
            if (opt.span) {
                lc.className += ' wide';
                input.elem.className += ' wide';
            }
            body.append(input.elem);
        }
    }
    get element() {
        return this.elem;
    }
    each(fn) {
        for (const [name, input] of Object.entries(this.inputs))
            fn(input, name);
    }
    destroy() {
        this.elem.replaceChildren();
    }
    reset() {
        this.each((input) => {
            input.reset();
            input.write();
        });
    }
    read() {
        this.each((input) => input.read());
    }
    write() {
        this.each((input) => input.write());
    }
    get() {
        const a = {};
        this.each((input, name) => {
            a[name] = input.value;
        });
        return a;
    }
    set(data) {
        this.each((input, name) => {
            input.value = data[name];
        });
    }
    set_some(data) {
        this.each((input, name) => {
            const value = data[name];
            if (value !== undefined)
                input.value = value;
        });
    }
    to_query() {
        const params = {};
        this.each((input) => {
            const key = input.p.param;
            if (key) {
                const q = input.to_query();
                if (q != null)
                    params[key] = q;
            }
        });
        return params;
    }
    from_query(query) {
        this.each((input) => {
            const key = input.p.param;
            if (key) {
                const value = query[key];
                if (value !== undefined)
                    input.from_query(value);
                else
                    input.reset();
            }
        });
    }
    // --- island mount (not part of the frozen handle) ---
    mount(host) {
        const src = this.elem;
        while (src.firstChild)
            host.appendChild(src.firstChild);
        this.elem = host;
    }
    unmount() {
        const host = this.elem;
        const detached = document.createElement('form-table');
        while (host.firstChild)
            detached.appendChild(host.firstChild);
        this.elem = detached;
    }
}
// ---- React surface ----
/**
 * Build the imperative form controller once and keep it ref-stable across re-renders (the inputs
 * hold the source-of-truth values; recreating would lose them). Returns the frozen handle plus
 * the superset used by the two L7 callers (direct `inputs` access, `reset`/`destroy`).
 */
export function useForm(spec) {
    const ref = useRef(null);
    if (ref.current === null)
        ref.current = new FormController(spec);
    return ref.current;
}
/**
 * Renders the <form-table> host and hands its interior to the controller (island pattern). React
 * never diffs inside it, so the flat label-div/field-element child ordering is preserved exactly.
 */
export function Form({ handle }) {
    const ref = useRef(null);
    useLayoutEffect(() => {
        const host = ref.current;
        if (!host)
            return;
        handle.mount(host);
        return () => {
            handle.unmount();
        };
    }, [handle]);
    return _jsx("form-table", { ref: ref });
}
