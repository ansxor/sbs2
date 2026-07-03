// Central registrar for the module-owned settings (ARCHITECTURE §5/§10, L2b).
//
// In the vanilla app these were registered via `Settings.add({...})` as top-level side effects
// scattered across the owning modules (lazy-image, scroller, page). That coupling made importing a
// view module register settings as a side effect — which blocked lazy-loading views (the settings
// would not be registered at boot) and made the import graph's side effects implicit and fragile.
//
// They are now collected here and applied via `registerModuleSettings()`, called ONCE from the boot
// sequence (main.tsx) after the built-in SETTINGS_REGISTRY (registered at settings.ts load) and
// before `Settings.init()`. Registration order is preserved exactly — it drives the order
// init-time `update()` side effects run (NOT `order`, which only drives DOM row position).
//
// The `update(value, event)` bodies are unchanged: they mutate the same module singletons
// (Scroller.anim_type/reverse, the lazy-image observer via toggle_observer, Apx.start/stop) the
// original owning modules exposed. This module imports those modules; they no longer import
// Settings for registration (only for value reads, where they still do).

import type { SettingDescriptor } from '../data/types'
import { Settings } from './settings'
import { Scroller } from './scroller'
import { toggle_observer } from './lazy-image'
import { Apx } from './apx'

// `options_labels` is a SettingsForm (L6) presentation extension carried alongside SettingDescriptor
// — not on the frozen type, but read by SettingsForm via a cast. Kept here so the descriptors stay
// self-describing.
export interface SelectSettingDescriptor extends SettingDescriptor {
  options_labels?: string[]
}

// Order mirrors the original import-evaluation order: lazy-image (draw.js/view.js) → scroller
// (scroller.js) → page.js's chat settings.
export const MODULE_SETTINGS: SelectSettingDescriptor[] = [
  // ---- lazy-image.ts (was view.js:311-318) ----
  {
    name: 'lazy_loading',
    label: 'Image Loading',
    type: 'select',
    options: ['on', 'off'],
    update(value) {
      // bad
      toggle_observer(value == 'on')
    },
  },
  // ---- scroller.ts (was scroller.js) ----
  {
    name: 'scroller_anim_type',
    label: 'Smooth Scrolling',
    type: 'select',
    options: ['1', '2', '0'],
    options_labels: ['original', 'css animation', 'disabled'],
    update(value) {
      Scroller.anim_type = +value
    },
  },
  {
    name: 'scroller_anchor',
    label: 'Scroller Origin',
    type: 'select',
    options: ['top', 'bottom'],
    options_labels: ['top', 'bottom (unstable!)'],
    update(value) {
      Scroller.reverse = value == 'bottom'
    },
  },
  // ---- PageView.tsx (was page.js:564-614) ----
  { name: 'nickname', label: 'Chat Nickname', type: 'text', order: -9000 },
  {
    name: 'chat_markup',
    label: 'Chat Markup',
    type: 'select',
    options: ['12y2', '12y', 'plaintext'],
    order: -8000,
  },
  { name: 'avatar', label: 'Device Avatar', type: 'text', order: -7000 },
  {
    name: 'avatar_pixel',
    label: 'Pixelate My Avatar',
    type: 'select',
    options: ['off', 'on'],
    order: -6000,
  },
  {
    name: 'pixel_art',
    label: 'Display Pixel Avatars',
    type: 'select',
    options: ['on', 'off'],
    default: 'off',
    order: -5000,
    update(value) {
      if (value == 'on') Apx.start()
      else {
        Apx.stop()
        for (const img of document.querySelectorAll<HTMLElement>('.apx')) {
          img.classList.remove('pixelAvatar')
          img.style.width = ''
          img.style.height = ''
        }
      }
    },
  },
  {
    name: 'chat_enter',
    label: 'Chat Enter Key',
    type: 'select',
    options: ['submit', 'newline', 'submit, strip trailing', 'newline, strip trailing'],
  },
]

// Called once from boot (main.tsx) after SETTINGS_REGISTRY (applied at settings.ts load) and before
// Settings.init(). Idempotent guard matches Settings.add's own `initialized` re-init behavior.
export function registerModuleSettings(): void {
  for (const desc of MODULE_SETTINGS) Settings.add(desc)
}
