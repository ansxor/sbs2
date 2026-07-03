// MessageInfo (minfo.js → ARCHITECTURE §10, L6g). Lets a parent view select one message and
// emit `message_control` events for it (raw / edit / reply / link) via MessageList.send_mce.
//
// The old class kept an internal `current` and a `set_message(data)` mutator. Here the component
// is CONTROLLED: the parent owns the selection and passes `selected` (Message | null); the close
// button asks the parent to clear via `onClose`. `set_message`'s three effects are reproduced:
//   - the <textarea> shows JSON.stringify(data, null, 1) (or "" when null),
//   - the root is `hidden` unless a message is selected,
//   - the close button is focused whenever the selection changes.
// The textarea is left UNCONTROLLED (value written imperatively) so a user can type into it and
// the value is only reset on the next selection change — exactly as the original behaved.
import { useLayoutEffect, useRef } from 'react'
import type { Message } from '../data/types'
import { MessageList } from '../services/message-list'

export interface MessageInfoProps {
  selected: Message | null
  // Close button handler — the controlled analog of the old `set_message(null)`.
  onClose?: () => void
}

// minfo.js constructor: btn('raw',…), btn('edit',…), btn('reply',…), btn('link',…), in order.
const CONTROLS: ReadonlyArray<readonly [string, string]> = [
  ['raw', '📠raw'],
  ['edit', '✏️edit'],
  ['reply', '⤴️reply'],
  ['link', '🔗link'],
]

export function MessageInfo({ selected, onClose }: MessageInfoProps): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null)
  const dataRef = useRef<HTMLTextAreaElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  // The original constructor calls set_message(null) BEFORE the root is attached to the document,
  // so its $close.focus() is a no-op on first run; skip focusing on the initial mount to match.
  const first = useRef(true)

  useLayoutEffect(() => {
    dataRef.current!.value = selected ? JSON.stringify(selected, null, 1) : ''
    if (!first.current) closeRef.current!.focus() // i guess
    first.current = false
  }, [selected])

  // minfo.js: btn.onclick → MessageList.send_mce(action, this.current, this.$root)
  const control = (action: string): void => {
    MessageList.send_mce(action, selected, rootRef.current!)
  }

  return (
    <div ref={rootRef} className="message-info" hidden={!selected}>
      <button ref={closeRef} onClick={() => onClose?.()}>×</button>message info!
      <textarea ref={dataRef} />
      <div>
        {CONTROLS.map(([action, label]) => (
          <button key={action} data-action={action} tabIndex={-1} onClick={() => control(action)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
