import { jsx as _jsx } from "react/jsx-runtime";
// L8 — the React entry. Imports the pre-React bootstrap for its side effects FIRST (immediate()
// gate, markup patches, html_inject injection, view registration — all must run before the first
// render), then mounts <App/> into #root (ARCHITECTURE §10 main.js row, §11 Layer 8).
//
// CSS import decision (finalized): the reused stylesheet cascade is loaded via <link> tags in
// index.html in the exact old order (ARCHITECTURE §1.5) — there is deliberately NO CSS `import`
// here. StrictMode is safe because all fragile state lives in services, never React state
// (ARCHITECTURE §1.2); islands dispose+recreate on the double-invoke.
import './boot/bootstrap';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './components/App';
const container = document.getElementById('root');
if (container) {
    createRoot(container).render(_jsx(StrictMode, { children: _jsx(App, {}) }));
}
