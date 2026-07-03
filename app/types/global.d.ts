// Ambient globals defined by index.html's byte-identical early inline <script>, plus the
// print/log sink and the build-injected COMMIT string. Declared here so bundled modules
// can reference them by bare name (ARCHITECTURE §1.4). These are the ONLY window globals
// the port keeps.

// --- early-init globals (index.html) ---
declare const OPTS: URLSearchParams
declare const BASE_URL: string
declare function RELOAD(): void
declare const theme_query: MediaQueryList
declare const IOS_SAFARI: boolean
declare var run_on_load: Array<() => void>
declare var do_when_ready: (fn: () => void) => void

// --- build-injected version string (window.COMMIT) ---
declare const COMMIT: string

// --- sidebar-log sink (ARCHITECTURE §9): `print` overrides window.print and takes args;
//     `log` is a getter/setter that prints on assignment. Extra `print` overload merges
//     with lib.dom's `print(): void`. ---
declare function print(...args: any[]): void
declare var log: any

interface Window {
  // The early script seeds `window.Settings.values` from localStorage; settings.ts adopts
  // this object as its store seed.
  Settings: { values: { [key: string]: any }; fields?: { [key: string]: any } }
  COMMIT: string
  print(...args: any[]): void
  log: any
}
