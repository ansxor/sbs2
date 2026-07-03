// Markup wrapper (L4c). A thin façade over the vanilla `window.Markup.convert_lang`
// (markup2 submodule, loaded as classic <script>s → lexical global `Markup`) plus the two
// renderer monkeypatches the old app installed at load time:
//
//   - `renderer.url_scheme['sbs:'|'https:']`  (from src/view.js)
//   - `renderer.create.image`                 (from src/draw.js)
//
// In the vanilla app those assignments ran as top-level statements in view.js / draw.js.
// Here they are collected into `installPatches()`, called ONCE at startup by the boot
// sequence (L8) after Req / Settings / the image loader exist, and NEVER inside a render
// body. See ARCHITECTURE §8.3 + §10 (view.js/draw.js rows) + §12.
//
// Depends on: Req (image_url), Settings (bsky_client), types/markup2.d.ts (Markup global),
// and an injected image loader (see setImageLoader below).
import { Req } from './request';
import { Settings } from './settings';
let imageLoader = null;
export function setImageLoader(fn) {
    imageLoader = fn;
}
// ---------------------------------------------------------------------------------------
// convert() — the wrapper the islands/views call instead of touching the global directly.
// Signature mirrors Markup.convert_lang exactly: it throws a TypeError only if `text` is not
// a string or `element` is a non-Element; render/parse errors are swallowed by markup2 into
// inline UI. The `etc` options object is forwarded BY REFERENCE (callers keep it stable to
// avoid re-render loops — see ARCHITECTURE §8.3).
// ---------------------------------------------------------------------------------------
export function convert(text, lang, element, etc) {
    return Markup.convert_lang(text, lang, element, etc);
}
// ---------------------------------------------------------------------------------------
// installPatches() — idempotent; installs the two renderer monkeypatches once at startup.
// ---------------------------------------------------------------------------------------
let patched = false;
export function installPatches() {
    if (patched)
        return;
    patched = true;
    // --- src/view.js: sbs: scheme (internal links / image references) ---
    Markup.renderer.url_scheme['sbs:'] = (url, thing) => {
        if (thing == 'image') {
            if (url.pathname.startsWith('image/'))
                // image_url's `id` is typed as a numeric Id, but the original passes an image path
                // string here; image_url only interpolates it, so runtime behavior is identical.
                return Req.image_url((url.pathname.substring(6) + url.search));
        }
        return '#' + url.pathname + url.search + url.hash;
    };
    // --- src/view.js: https: scheme (host rewrite + optional bsky client override) ---
    Markup.renderer.url_scheme['https:'] = (url) => {
        if (url.host == 'new.smilebasicsource.com') {
            if (url.pathname.startsWith('/api/File/raw/'))
                url.host = 'qcs.shsbs.xyz';
        }
        const bsky = Settings.values.bsky_client;
        if (bsky && bsky != 'https://bsky.app/') {
            if (url.host == 'bsky.app') {
                const href = url.href.replace(/^https:[/][/]bsky.app[/]/, bsky);
                return href;
            }
        }
        return url.href;
    };
    // --- src/draw.js: image element factory ---
    Markup.renderer.create.image = ({ url, alt, width, height }) => {
        const src = Markup.renderer.filter_url(url, 'image');
        const e = document.createElement('img');
        e.classList.add('M-image');
        e.tabIndex = 0;
        e.dataset.state = 'loading';
        e.dataset.shrink = '';
        if (alt != null)
            e.alt = e.title = alt;
        if (height) {
            e.width = width;
            e.height = height;
            e.dataset.state = 'size';
        }
        imageLoader?.(e, src, false);
        return e;
    };
}
