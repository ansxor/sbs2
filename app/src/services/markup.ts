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

import type { Id } from '../data/types'
import { Req } from './request'
import { Settings } from './settings'

// ---------------------------------------------------------------------------------------
// Injected image loader.
//
// The `renderer.create.image` patch calls the old `Draw.load_image(e, src, force)`. In the
// new split that helper lives in `services/lazy-image.ts` (L4e) — a sibling L4 package that
// has no L0 stub, so it cannot be hard-imported here without breaking this file's typecheck
// when built in isolation. Following the established sink precedent (setPrintSink /
// setSidebarTabSelect / setStatusUpdateUser), the loader is injected at boot. Boot (or
// lazy-image itself) calls setImageLoader(load_image) before the first markup render, so the
// factory below behaves identically to the original once wired.
// ---------------------------------------------------------------------------------------
export type ImageLoader = (img: HTMLImageElement, src: string, force?: boolean) => void

let imageLoader: ImageLoader | null = null

export function setImageLoader(fn: ImageLoader | null): void {
  imageLoader = fn
}

// ---------------------------------------------------------------------------------------
// convert() — the wrapper the islands/views call instead of touching the global directly.
// Signature mirrors Markup.convert_lang exactly: it throws a TypeError only if `text` is not
// a string or `element` is a non-Element; render/parse errors are swallowed by markup2 into
// inline UI. The `etc` options object is forwarded BY REFERENCE (callers keep it stable to
// avoid re-render loops — see ARCHITECTURE §8.3).
// ---------------------------------------------------------------------------------------
export function convert(
  text: string,
  lang: string,
  element?: Element,
  etc?: object | null,
): Element | DocumentFragment {
  return Markup.convert_lang(text, lang, element, etc)
}

// ---------------------------------------------------------------------------------------
// installPatches() — idempotent; installs the two renderer monkeypatches once at startup.
// ---------------------------------------------------------------------------------------
let patched = false

export function installPatches(): void {
  if (patched) return
  patched = true

  // --- src/view.js: sbs: scheme (internal links / image references) ---
  Markup.renderer.url_scheme['sbs:'] = (url, thing) => {
    if (thing == 'image') {
      if (url.pathname.startsWith('image/'))
        // image_url's `id` is typed as a numeric Id, but the original passes an image path
        // string here; image_url only interpolates it, so runtime behavior is identical.
        return Req.image_url((url.pathname.substring(6) + url.search) as unknown as Id)
    }
    return '#' + url.pathname + url.search + url.hash
  }

  // --- src/view.js: https: scheme (host rewrite + optional bsky client override) ---
  Markup.renderer.url_scheme['https:'] = (url) => {
    if (url.host == 'new.smilebasicsource.com') {
      if (url.pathname.startsWith('/api/File/raw/'))
        url.host = 'qcs.shsbs.xyz'
    }
    const bsky = Settings.values.bsky_client
    if (bsky && bsky != 'https://bsky.app/') {
      if (url.host == 'bsky.app') {
        const href = url.href.replace(/^https:[/][/]bsky.app[/]/, bsky)
        return href
      }
    }
    return url.href
  }

  // --- src/draw.js: image element factory ---
  Markup.renderer.create.image = ({ url, alt, width, height }) => {
    const src = Markup.renderer.filter_url(url, 'image')
    const e = document.createElement('img')
    e.classList.add('M-image')
    e.tabIndex = 0
    e.dataset.state = 'loading'
    e.dataset.shrink = ''
    if (alt != null)
      e.alt = e.title = alt
    if (height) {
      e.width = width!
      e.height = height
      e.dataset.state = 'size'
    }
    imageLoader?.(e, src, false)
    return e
  }
}
