// Ambient declarations for the markup2 package. The global `Markup` binding is populated by
// app/src/main.tsx, which imports the package modules and assigns `window.Markup` so the rest
// of the app can keep using the bare global. See ARCHITECTURE §8.3.

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

// main.tsx assigns window.Markup after importing markup2/helpers.js.
declare const Markup: MarkupGlobal

interface Window {
  Markup: MarkupGlobal
}

declare module 'markup2/helpers.js' {
  const Markup: MarkupGlobal
  export default Markup
}

declare module 'markup2/runtime.js' {
  // side-effects only (registers <youtube-embed> custom element)
}

declare module 'markup2/markup.css' {
  // side-effects only (styles for .Markup content)
}
