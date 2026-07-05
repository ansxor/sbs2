// Shared floating <message-controls> singleton for chat messages.
//
// Ported from the static controls in services/message-list.ts (messages.js). A single
// <message-controls> element is created once at module load and moved around the DOM to the
// currently hovered <message-part>. Buttons dispatch `message_control` CustomEvents whose
// `detail.data` is filled by the host <message-list> capture listener using the message id
// stored on the hovered part.

import * as React from 'react'
import { useRef } from 'react'
import { Req } from '../../services/request'

const controls = document.createElement('message-controls')
let controls_message: Element | null = null
const control_buttons: Record<string, HTMLButtonElement> = Object.create(null)

let initialized = false
function init_controls(): void {
  if (initialized) return
  initialized = true

  const btn = (action: string, label: string): void => {
    const b = document.createElement('button')
    b.onclick = () => {
      send_mce(action, null, controls_message as EventTarget)
    }
    b.dataset.action = action
    b.tabIndex = -1
    b.append(label)
    controls.append(b)
    control_buttons[action] = b
  }
  btn('info', '🗺️')
  btn('edit', '✏️')
  btn('reply', '⤴️')

  const listen = (ev: string, fn: (e: Event) => void): void => {
    document.addEventListener(ev, fn, { passive: true })
  }

  const enter = (ev: Event): void => {
    const elem = (ev.target as Element).closest('message-part, message-controls, .message-list')
    if (!elem || elem.classList.contains('message-list')) show_controls(null)
    else if (elem.tagName == 'MESSAGE-PART') show_controls(elem)
    // otherwise, the element is <message-controls> so we do nothing
  }

  if (IOS_SAFARI) {
    listen('click', enter)
    listen('touchstart', (ev) => {
      if (!controls_message) return
      if (controls.contains(ev.target as Node)) return
      if (controls_message.contains(ev.target as Node)) {
        // return
      }
      show_controls(null)
    })
  } else {
    listen('mouseover', enter)
    listen('mouseleave', () => {
      show_controls(null)
    })
  }
}

function show_controls(elem: Element | null): void {
  if (elem == controls_message) return
  if (elem) {
    elem.before(controls)
  } else {
    controls.remove()
  }
  controls_message = elem
  if (elem) {
    const block = elem.closest('message-block')
    const me = block && +((block as HTMLElement).dataset.uid as string) == Req.uid
    control_buttons.reply.hidden = me as boolean
    control_buttons.edit.hidden = !me
  }
}

function send_mce(action: string, data: unknown, target: EventTarget): void {
  const ev2 = new CustomEvent('message_control', {
    bubbles: true,
    // 'cancellable' is a preserved typo from the original controller.
    cancellable: true,
    detail: { data, action },
  } as CustomEventInit<{ data: unknown; action: string }>)
  target.dispatchEvent(ev2)
}



export function MessageControls(): React.JSX.Element | null {
  const initRef = useRef(false)
  if (!initRef.current) {
    initRef.current = true
    init_controls()
  }
  return null
}

export { send_mce, show_controls, controls }
