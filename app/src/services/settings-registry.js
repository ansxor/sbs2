// The static declarative registry of the built-in settings that the old `settings.js`
// registered inline at load (theme, sitecss, sitejs, html_inject) — ARCHITECTURE §5/§10 (L2b).
//
// In the vanilla app these four were registered via `Settings.add({...})` at the bottom of
// settings.js. Here they are a static array that `services/settings.ts` registers at module
// load, preserving REGISTRATION ORDER (which drives the order init-time `update()` side effects
// run — NOT `order`, which only drives DOM row insertion position). Every OTHER setting
// (lazy_loading, bsky_client, scroller_*, nickname, chat_markup, avatar, avatar_pixel, pixel_art,
// chat_enter) is owned by its higher-layer module and registered from there via `Settings.add()`,
// because those `update()` bodies touch higher-layer services (View/Scroller/Apx/page state).
//
// The `update(value, event)` bodies are ported verbatim from settings.js:
//   - theme:   'auto' re-derives from the OS via theme_query.onchange; else writes data-theme.
//   - sitecss: writes <style id=$customCSS> — but SKIPS the write when event=='init' (index.html
//              already seeded $customCSS before first paint), autosave:false.
//   - sitejs:  eval()'d in try/catch on EVERY apply INCLUDING init (no init guard), autosave:false.
//   - html_inject: no update (value is read imperatively by boot).
//
// Presentational DOM augmentation (the `render` reload-css button for sitecss, the code-editor
// swap) is deliberately NOT reproduced here — that is L6's SettingsForm concern, and its old body
// reached into Sidebar.* which does not exist at this layer.
// The <style id=$customCSS> element (index.html) whose textContent the `sitecss` setting drives.
// Queried lazily per-apply (never cached) so a rebuilt DOM is always honored, matching the old
// bare-`$customCSS` auto-global lookup.
function customCssElement() {
    return document.getElementById('$customCSS');
}
export const SETTINGS_REGISTRY = [
    {
        name: 'theme',
        label: 'Theme',
        type: 'select',
        options: ['auto', 'light', 'dark'],
        order: -10000,
        update(value) {
            if (value === 'auto')
                // re-derive from the OS by re-invoking the early-init media-query handler
                theme_query.onchange(theme_query);
            else
                document.documentElement.dataset.theme = value;
        },
    },
    {
        name: 'sitecss',
        label: 'Custom CSS',
        type: 'code',
        autosave: false,
        order: Infinity - 2,
        update(value, type) {
            if (type !== 'init') {
                const el = customCssElement();
                if (el)
                    el.textContent = value;
            }
        },
    },
    {
        name: 'sitejs',
        label: 'Custom Javascript',
        type: 'code',
        autosave: false,
        order: Infinity - 1,
        update(value) {
            try {
                // eslint-disable-next-line no-eval
                eval(value);
            }
            catch (e) {
                console.error('failed to run sitejs', e);
                print(e);
                print('error in sitejs ^');
            }
        },
    },
    {
        name: 'html_inject',
        label: 'HTML to Inject',
        type: 'code',
        order: 100000,
    },
];
