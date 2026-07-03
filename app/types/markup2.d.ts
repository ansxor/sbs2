// Ambient declarations for the vanilla `markup2` submodule (loaded as classic <script>s
// in index.html, which assigns the lexical global `Markup`; index.html also surfaces it
// as `window.Markup`). markup2 is an external, untyped dependency — `any` is used for its
// internals; the extension points the ports touch (convert_lang, renderer.url_scheme,
// renderer.create.image, filter_url) are typed. See ARCHITECTURE §8.3.

interface MarkupRenderer {
  // installed monkeypatches: renderer.url_scheme['sbs:'|'https:'] (view.js) map a parsed
  // URL + usage 'thing' to an href string.
  url_scheme: { [scheme: string]: (url: URL, thing: string) => string }
  // installed monkeypatch: renderer.create.image (draw.js) builds the <img> element.
  create: {
    image: (opts: {
      url: string
      alt?: string | null
      width?: number
      height?: number
    }) => HTMLImageElement
    [factory: string]: (...args: any[]) => Node
  }
  filter_url(url: string, type: string): string
  [k: string]: any
}

interface MarkupGlobal {
  css_class: string
  langs: any
  renderer: MarkupRenderer
  // Throws a TypeError if `text` is not a string, or if `element` is defined but not an
  // Element. Otherwise never throws (render/parse errors become inline UI).
  convert_lang(
    text: string,
    lang: string,
    element?: Element,
    etc?: object | null,
  ): Element | DocumentFragment
}

// markup2 helpers.js declares `let Markup` at classic-script top level → a global lexical
// binding reachable by bare name from bundled modules.
declare const Markup: MarkupGlobal

interface Window {
  Markup: MarkupGlobal
}
