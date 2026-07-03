// The Settings store (settings.js → ARCHITECTURE §5/§10, L2b). A flat `values` map + a `fields`
// registry, ported with the exact 4-event model (init/change/update/save) and the byte-preserved
// `setting-<name>` JSON localStorage contract.
//
// Parity notes (all from src/settings.js):
//   - SEED: adopt the early inline script's `window.Settings.values` object as our store's values
//     (settings.js did `Settings = NAMESPACE({values: Settings.values, ...})`, reusing the same
//     object). HOWEVER index.html declares the early object as a classic-script `let Settings`,
//     which is NOT a `window` property, so an ES module cannot reach it by reference. We therefore
//     adopt `window.Settings.values` IF the layer gate ever exposes it, and otherwise reproduce the
//     early-init seed here verbatim: scan localStorage for `setting-*` keys and JSON.parse each into
//     a null-proto map (`key.substring(8)` == the name). Under `?nosettings` the early script uses a
//     fresh empty object (no persisted values loaded); we honor that here directly.
//   - 4-EVENT MODEL (SettingProto.change): set values[name]; for events other than 'init'/'update'
//     PERSIST to localStorage, and if autosave===false RETURN before update() (persist-only);
//     otherwise run the field's update(value, event). 'init' and 'update' never persist.
//   - INIT (SettingProto.init): read persisted value; if undefined fall back to default, else
//     options[0], else null; then change('init', value) — applies without persisting.
//   - REGISTRATION-ORDER init: init() applies every queued field's side effect in the order the
//     fields were add()'d (script/import order), NOT `order` (which is DOM-row position only).
//   - sitejs evals at boot (its update has no init guard); sitecss skips its $customCSS write at
//     init (index.html seeded it) — both encoded in settings-registry.ts.
//
// React reads settings through useSetting(name) (hooks/useService.ts, L6b), which subscribes via
// `subscribe` and snapshots via `get`. This store never imports React.
import { SETTINGS_REGISTRY } from './settings-registry';
// adopt the early inline script's values object as the seed, or (since that object is a
// classic-script lexical, not a window property) reproduce it from localStorage exactly as the
// early-init loop does, honoring the `?nosettings` bypass.
function loadSeed() {
    const early = typeof window !== 'undefined' ? window.Settings : undefined;
    if (early && early.values)
        return early.values;
    const values = Object.create(null);
    if (typeof window !== 'undefined' && window.location.search === '?nosettings')
        return values;
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('setting-'))
            try {
                values[key.substring(8)] = JSON.parse(localStorage.getItem(key));
            }
            catch { }
    }
    return values;
}
const seedValues = loadSeed();
const fields = Object.create(null);
const listeners = new Set();
let initialized = false;
function notify() {
    for (const cb of listeners)
        cb();
}
// SettingProto.change — set the value, conditionally persist, conditionally apply.
function change(name, value, event = 'change') {
    seedValues[name] = value;
    const desc = fields[name];
    if (event !== 'init' && event !== 'update') {
        localStorage.setItem('setting-' + name, JSON.stringify(value));
        if (desc && desc.autosave === false) {
            // persist-only: skip update() (SettingProto.change returns here for autosave:false fields).
            notify();
            return;
        }
    }
    if (desc && desc.update)
        desc.update(value, event);
    notify();
}
// SettingProto.init — resolve the boot value (persisted → default → options[0] → null) and apply
// it without persisting.
function initField(desc) {
    let value = seedValues[desc.name];
    if (value === undefined) {
        if (desc.default !== undefined)
            value = desc.default;
        else if (desc.options)
            value = desc.options[0];
        else
            value = null;
    }
    change(desc.name, value, 'init');
}
function add(desc) {
    fields[desc.name] = desc;
    if (initialized)
        initField(desc);
}
function init() {
    initialized = true;
    // registration order == object insertion order for the string keys.
    for (const name in fields)
        initField(fields[name]);
}
export const Settings = {
    values: seedValues,
    fields,
    add,
    init,
    change,
    get(name) {
        return seedValues[name];
    },
    subscribe(cb) {
        listeners.add(cb);
        return () => {
            listeners.delete(cb);
        };
    },
};
// Register the built-in settings at module load, mirroring settings.js registering theme/sitecss/
// sitejs/html_inject at the bottom of the file (deferred pushes — applied later by Settings.init()).
for (const desc of SETTINGS_REGISTRY)
    Settings.add(desc);
