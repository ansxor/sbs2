import { jsx as _jsx } from "react/jsx-runtime";
// Imperative island: rendered markup (ARCHITECTURE §0/§8.3/§10 L6a; rendering.md view.js/draw.js).
//
// `services/markup.ts` (L4c) wraps `window.Markup.convert_lang` (the vanilla markup2 global) and
// installs the two renderer monkeypatches once at boot. This component is the ref + layout-effect
// host: it renders its OWN empty container and calls `convert(text, lang, node, etc)` into it in a
// `useLayoutEffect`. `convert_lang`, via `renderer.render`, clears the node (`node.textContent=""`,
// render.js:453) and refills it, so React must NOT also manage that subtree — there are NO JSX
// children and NO `dangerouslySetInnerHTML` on the same element. `convert_lang` swallows its own
// parse/render errors into inline UI (helpers.js:48-73), so no React error boundary is relied on;
// it throws only a `TypeError` for a non-Element arg, which never happens here.
//
// Old call sites:
//   - user.js:48 — `Markup.convert_lang(userpage.text, userpage.values.markupLang, this.$contents)`
//     (one-shot, no etc, no scroll math).
//   - editpage.js:247-253 `update_preview(full)` —
//       let shouldScroll = $preview_outer.scrollHeight - $preview_outer.clientHeight - $preview_outer.scrollTop
//       Markup.convert_lang($textarea.value, $edit_markup.value, $preview, {preview: !full})
//       if (shouldScroll < 20) $preview_outer.scrollTop = 9e9
//     The measure (before) and the pin-to-bottom (after) must run in the SAME synchronous task as
//     the convert — reproduced by the `onBeforeConvert` / `onAfterConvert` hooks that fire
//     immediately around `convert` inside this one layout effect. EditView owns the `$preview_outer`
//     ref those closures read/write; this island only owns `$preview` (its container).
//
// The `etc` options object is forwarded BY REFERENCE (markup.ts `convert` does not copy it); callers
// keep it stable (memoized) to avoid needless re-converts — it is an effect dep, so a genuinely new
// `etc` (e.g. `{preview:false}` vs `{preview:true}`) triggers a fresh convert, matching the old
// per-call options.
import { useLayoutEffect, useRef } from 'react';
import { convert } from '../services/markup';
export function MarkupContent({ text, lang, etc, tag = 'div', className, onBeforeConvert, onAfterConvert, }) {
    // A ref callback typed for HTMLElement so it accepts any tag (div or a custom element); the
    // `as 'div'` cast lets TS treat the variable tag as an intrinsic while the real tag is `tag`.
    const nodeRef = useRef(null);
    const setNode = (el) => {
        nodeRef.current = el;
    };
    // Latest scroll-math hooks, so a re-render can't stale-close them (they read live EditView refs).
    const onBeforeRef = useRef(onBeforeConvert);
    const onAfterRef = useRef(onAfterConvert);
    onBeforeRef.current = onBeforeConvert;
    onAfterRef.current = onAfterConvert;
    useLayoutEffect(() => {
        const node = nodeRef.current;
        if (!node)
            return;
        // editpage.js order: measure -> convert -> pin. All synchronous, same task.
        onBeforeRef.current?.();
        convert(text, lang, node, etc);
        onAfterRef.current?.();
    }, [text, lang, etc]);
    const Tag = tag;
    return _jsx(Tag, { ref: setNode, className: className });
}
