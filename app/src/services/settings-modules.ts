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

import type { Id, SettingDescriptor, User } from '../data/types'
import { Settings } from './settings'
import { Scroller } from './scroller'
import { toggle_observer } from './lazy-image'
import { Apx } from './apx'
import { AVATAR_SIZE, avatar_url } from './draw'
import { Req } from './request'
import {
  getBlockedRooms,
  getBlockedUsers,
  subscribe as subscribeBlocks,
  unblockRoom,
  unblockUser,
} from './block'

// `options_labels` is a SettingsForm (L6) presentation extension carried alongside SettingDescriptor
// — not on the frozen type, but read by SettingsForm via a cast. Kept here so the descriptors stay
// self-describing.
export interface SelectSettingDescriptor extends SettingDescriptor {
  options_labels?: string[]
}

function blockedRow(
  imgSrc: string,
  name: string,
  onRemove: () => void,
): HTMLElement {
  const row = document.createElement('div')
  row.className = 'blocked-row'

  const img = document.createElement('img')
  img.className = 'item avatar'
  img.src = imgSrc
  img.alt = ''

  const title = document.createElement('span')
  title.className = 'entity-title pre'
  title.textContent = name

  const spacer = document.createElement('span')
  spacer.className = 'FILL'

  const remove = document.createElement('button')
  remove.textContent = 'X'
  remove.title = 'Unblock'
  remove.onclick = onRemove

  row.append(img, title, spacer, remove)
  return row
}

function renderBlockedList(row: HTMLElement, elem: HTMLElement, label: HTMLElement): void {
  elem.remove()
  label.textContent = 'Blocked:'
  // Stack the label above a full-width table instead of the default side-by-side settings layout.
  row.classList.add('blocked-setting')

  const list = document.createElement('div')
  list.className = 'blocked-list'
  row.append(list)

  const rebuild = (): void => {
    list.textContent = ''
    const users = getBlockedUsers()
    const rooms = getBlockedRooms()
    if (users.length === 0 && rooms.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'blocked-row'
      empty.textContent = 'No users or rooms blocked.'
      list.append(empty)
      return
    }
    for (const user of users) {
      // The stored `avatar` is a raw image hash, not a URL — resolve it via avatar_url (which also
      // handles the empty/'0' → default-avatar fallback), matching how avatars render elsewhere.
      list.append(
        blockedRow(
          avatar_url({ avatar: user.avatar } as User),
          user.username,
          () => unblockUser(user.id),
        ),
      )
    }
    for (const room of rooms) {
      // `thumbnail` is likewise a raw image hash; resolve it the same way content_label does.
      const thumb = room.thumbnail
        ? Req.image_url(room.thumbnail as unknown as Id, AVATAR_SIZE, true)
        : 'resource/page-resource.png'
      list.append(blockedRow(thumb, room.name, () => unblockRoom(room.id)))
    }
  }

  rebuild()
  // The SettingsForm island is torn down only when the whole Sidebar unmounts, which is
  // effectively never; still attach the cleanup so the row can be disposed correctly.
  ;(row as HTMLElement & { __unblock?: () => void }).__unblock = subscribeBlocks(rebuild)
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
  {
    name: 'blocked',
    label: 'Blocked',
    type: 'text',
    order: Infinity,
    render: renderBlockedList,
  },
]

// Called once from boot (main.tsx) after SETTINGS_REGISTRY (applied at settings.ts load) and before
// Settings.init(). Idempotent guard matches Settings.add's own `initialized` re-init behavior.
export function registerModuleSettings(): void {
  for (const desc of MODULE_SETTINGS) Settings.add(desc)
}
