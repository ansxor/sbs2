// Pixel-avatar DPR manager (apx.js → ARCHITECTURE §9, §10, L4e). Watches devicePixelRatio via a
// `(-webkit-device-pixel-ratio: N)` matchMedia query and, whenever the DPR changes (monitor / zoom
// change), re-runs recalc_image_scale on every `.apx` avatar so integer-multiple pixel-art
// upscaling stays crisp. Ported verbatim from apx.js:31-58. recalc_image_scale itself was split to
// services/draw.ts (L2c, ARCHITECTURE §9) and is imported from there.
//
// The public surface is start()/stop() — the real callers (page.js, L7) — NOT the module map's
// sketched `{scale,recalc,watch}`; the old source is the authority. The addEventListener('change')
// / removeListener asymmetry (and the deprecated removeListener) are kept exactly as the original.
import { recalc_image_scale } from './draw';
// apx.js:31-58 — a closure singleton over the current matchMedia listener `ql`.
export const Apx = (function () {
    let ql = null;
    const cycle = () => {
        const dpr = +window.devicePixelRatio;
        // refresh listener
        ql && ql.removeListener(cycle);
        ql = window.matchMedia('(-webkit-device-pixel-ratio: ' + dpr + ')');
        ql.addEventListener('change', cycle);
        console.log('dpr change');
        for (const img of document.querySelectorAll('.apx'))
            recalc_image_scale(img);
    };
    return {
        start() {
            console.log('apx start');
            if (!ql)
                cycle();
        },
        stop() {
            console.log('apx stop');
            if (ql) {
                ql.removeListener(cycle);
                ql = null;
            }
        },
    };
})();
