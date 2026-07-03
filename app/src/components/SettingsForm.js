import { jsx as _jsx } from "react/jsx-runtime";
// SettingsForm (settings.js `Settings.draw`/`SettingProto.draw` → ARCHITECTURE §5/§9/§10, L6e).
// The local-settings panel: one row per registered setting, sorted by numeric `order`, each row a
// label + typed input (+ optional buttons). The Settings STORE (values, 4-event model, localStorage
// contract, registration-order init) lives in services/settings.ts; this component owns ONLY the
// presentational draw that settings-registry.ts deliberately deferred here — the per-type input
// element, the code-editor swap button, the autosave `⚠️ Update` button, and the sitecss
// `reload css` render augmentation.
//
// Ported as an IMPERATIVE ISLAND, not idiomatic JSX rows. Rationale (parity beats idiom):
//   - The code-editor swap MOVES a row's live child nodes into `$sidebarEditorPanel` and back
//     (`row.append(...$sidebarEditorPanel.childNodes)`); React managing that subtree would fight the
//     node moves and change DOM identity. So React renders an empty `.local-settings` container and
//     a single `useLayoutEffect` builds every row exactly as `SettingProto.draw` did, once.
//   - Settings inputs are STRING-valued and read straight off `elem.value` (select option value ==
//     the option STRING, not an index) — semantics that differ from input.js/Form.tsx, so Form's
//     index-based SelectInput is intentionally NOT used here.
//
// The two Sidebar bridges (`Sidebar.tabs.select`, `Sidebar.output`) are received as optional props
// (mirrors FilePanel's selectTab/closeFullscreen), so this component is self-contained; the Sidebar
// (higher layer) wires them. `$sidebarEditorPanel` is reached by its fixed DOM id, exactly as the
// old code referenced the auto-global element.
import { useLayoutEffect, useRef } from 'react';
import { Settings } from '../services/settings';
// Ordering comparator: preserves registration order for equal `order` (stable sort), and — unlike
// `a - b` — never yields NaN for `Infinity` vs `Infinity` (sitecss/sitejs both use `Infinity`).
function cmp(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}
// The sitecss `render` (settings.js) — deferred from settings-registry.ts to here. Adds a
// `reload css` button after the label that hot-swaps every linked stylesheet by cloning its <link>.
function reloadCssRender(output) {
    return (_row, _elem, label) => {
        const btn = document.createElement('button');
        btn.textContent = 'reload css';
        btn.onclick = () => {
            for (const sheet of [...document.styleSheets])
                if (sheet.href) {
                    const node = sheet.ownerNode;
                    const nw = node.cloneNode();
                    const note = output
                        ? output(`reloading ‘${nw.href.replace(/^.*[/]/, '')}’...`)
                        : document.createElement('div');
                    nw.onload = () => {
                        nw.onload = nw.onerror = null;
                        node.remove();
                        note.append(' [OK]');
                    };
                    nw.onerror = () => {
                        nw.onload = nw.onerror = null;
                        note.append(' [ERROR]');
                    };
                    nw.href += '#';
                    node.after(nw);
                }
        };
        label.after(btn);
    };
}
// Build one setting row (port of SettingProto.draw). `elem` is the live input; read()/write() and
// the change events are wired straight to the Settings store (SettingProto.read == elem.value;
// change('change'|'update') == Settings.change(name, elem.value, event)).
function drawRow(field, props) {
    const name = field.name;
    const order = field.order ?? 0;
    const row = document.createElement('div');
    row.dataset.order = String(order);
    const label = document.createElement('label');
    label.textContent = field.label + ': ';
    const getValue = () => Settings.get(name);
    let elem;
    const type = field.type;
    if (type === 'select') {
        const select = document.createElement('select');
        elem = select;
        // redraw_options: options as VALUES (strings), options_labels || options as text.
        select.textContent = '';
        let found = false;
        const val = getValue();
        const options = field.options;
        const labels = field.options_labels || options;
        options.forEach((value, i) => {
            const opt = document.createElement('option');
            opt.value = value;
            opt.text = labels[i];
            select.add(opt);
            if (value === val)
                found = true;
        });
        // placeholder option if the current value is a string missing from the list.
        if (typeof val === 'string' && !found) {
            const opt = document.createElement('option');
            opt.value = val;
            opt.text = val + ' ?';
            select.add(opt);
        }
        select.value = getValue();
    }
    else if (type === 'textarea') {
        elem = document.createElement('textarea');
    }
    else if (type === 'code') {
        const ta = document.createElement('textarea');
        elem = ta;
        ta.setAttribute('spellcheck', 'false');
        ta.classList.add('code-textarea');
        if (field.placeholder)
            ta.placeholder = field.placeholder;
        const btn = document.createElement('button');
        btn.textContent = '🖥️ Editor';
        let in_editor = false;
        const back = () => {
            btn.textContent = '🖥️ Editor';
            const panel = document.getElementById('$sidebarEditorPanel');
            if (panel)
                row.append(...panel.childNodes);
            in_editor = false;
        };
        // TODO: hack!! (kept verbatim)
        btn.onclick = () => {
            if (in_editor) {
                back();
                props.selectTab?.('user');
            }
            else {
                const panel = document.getElementById('$sidebarEditorPanel');
                if (!panel)
                    return;
                if (panel.hasChildNodes())
                    return; // uh oh
                btn.textContent = '❎ Back';
                panel.append(...row.childNodes);
                panel.onpause = () => {
                    back();
                };
                props.selectTab?.('editor');
                ta.focus();
                in_editor = true;
            }
        };
        row.append(btn);
    }
    else if (type === 'range') {
        const input = document.createElement('input');
        elem = input;
        input.type = 'range';
        const range = field.range;
        input.min = String(range[0]);
        input.max = String(range[1]);
        input.step = String(field.step || 'any');
        if (field.notches) {
            const notches = document.createElement('datalist');
            row.append(notches);
            for (const e of field.notches.concat(range)) {
                const opt = document.createElement('option');
                opt.value = String(e);
                notches.append(opt);
            }
            notches.id = `settings_panel__${name}_datalist`;
            input.setAttribute('list', notches.id);
        }
    }
    else if (type === 'text') {
        elem = document.createElement('input');
    }
    else {
        console.warn('unknown settings type: ' + type);
        elem = document.createElement('input');
    }
    // set the initial value (SettingProto.write: elem.value = get_value()).
    ;
    elem.value = getValue();
    row.prepend(elem);
    row.prepend(label);
    elem.onchange = () => {
        // SettingProto.change('change') — value defaults to read() == elem.value.
        Settings.change(name, elem.value, 'change');
    };
    if (field.autosave === false) {
        const btn = document.createElement('button');
        btn.textContent = '⚠️ Update'; // 💫
        btn.onclick = () => {
            Settings.change(name, elem.value, 'update');
        };
        row.append(btn);
    }
    // render augmentation: honor a descriptor-provided render fn, plus the sitecss render deferred here.
    const render = typeof field.render === 'function'
        ? field.render
        : name === 'sitecss'
            ? reloadCssRender(props.output)
            : undefined;
    if (render)
        render(row, elem, label);
    return row;
}
/**
 * Renders the `.local-settings` panel. All rows are built imperatively once (island); React never
 * diffs inside. Rows are inserted sorted ascending by `order` (stable for ties == registration
 * order), reproducing `Settings.draw`'s `insertBefore(first child with order > field.order)`.
 */
export function SettingsForm({ selectTab, output }) {
    const ref = useRef(null);
    // Read the latest bridges without re-running the build effect (the panel is drawn once, as in
    // the original `Settings.draw`); handlers dereference the refs at click time.
    const selectTabRef = useRef(selectTab);
    selectTabRef.current = selectTab;
    const outputRef = useRef(output);
    outputRef.current = output;
    useLayoutEffect(() => {
        const host = ref.current;
        if (!host)
            return;
        const fields = Object.values(Settings.fields);
        const sorted = fields.slice().sort((a, b) => cmp(a.order ?? 0, b.order ?? 0));
        for (const field of sorted)
            host.append(drawRow(field, {
                selectTab: (n) => selectTabRef.current?.(n),
                output: (s) => outputRef.current?.(s) ?? document.createElement('div'),
            }));
        return () => {
            host.textContent = '';
        };
    }, []);
    return _jsx("div", { className: "local-settings", ref: ref });
}
