// React island: the chat MessageList (ARCHITECTURE §0/§8.2/§10 L6a).
//
// The message list is now rendered with idiomatic React components via
// components/messages/MessageList.tsx. This component renders the <message-list> host directly
// and mounts MessageListComponent as a child (it renders a fragment of <message-block>s into the
// host). The list instance is exposed through an imperative handle so the parent view can call
// display_edge, display_live, etc. Live Events.messages / Events.after_messages subscriptions are
// wired in a layout effect and torn down on unmount.
import { useLayoutEffect, useRef, useState } from 'react'
import { MessageListComponent, type MessageListHandle } from '../components/messages/MessageList'
import type { RoomFilterProps } from '../components/messages/MessageList'
import { Events } from '../services/events'
import type { Id } from '../data/types'

export interface MessageListViewProps {
  // Page / content id the list belongs to (`MessageList` pid). page.js passes page_id;
  // comments.js passes `comment.contentId`.
  pageId: Id
  // editpage/comment editing flag forwarded to the list.
  edit?: boolean
  // Multi-room mode (All view): when set, the list accepts messages from any room in this set.
  rooms?: Set<Id>
  // AllView-specific room filter data passed through to the list component.
  roomFilter?: RoomFilterProps
  // Called once, synchronously, right after the list is mounted and before live subscription.
  onReady?: (list: MessageListHandle) => void
  // Live-batch handlers. Args are forwarded verbatim from the bus fire.
  onMessages?: (...data: unknown[]) => void
  onAfterMessages?: (...data: unknown[]) => void
}

export function MessageListView({
  pageId,
  edit,
  rooms,
  roomFilter,
  onReady,
  onMessages,
  onAfterMessages,
}: MessageListViewProps) {
  const hostRef = useRef<HTMLElement | null>(null)
  const handleRef = useRef<MessageListHandle | null>(null)
  const [mounted, setMounted] = useState(false)

  // Latest callbacks, held in refs so a re-render can't stale-close them AND can't land in
  // the effect deps below, which would recreate the subscriptions.
  const onReadyRef = useRef(onReady)
  const onMessagesRef = useRef(onMessages)
  const onAfterMessagesRef = useRef(onAfterMessages)
  onReadyRef.current = onReady
  onMessagesRef.current = onMessages
  onAfterMessagesRef.current = onAfterMessages

  const setHost = (el: HTMLElement | null): void => {
    if (el) {
      el.classList.add('message-list')
      hostRef.current = el
      setMounted(true)
    }
  }

  const setHandle = (handle: MessageListHandle | null): void => {
    handleRef.current = handle
  }

  // Wire live subscriptions once the component is mounted and expose the handle to the parent.
  useLayoutEffect(() => {
    if (!mounted) return

    // page.js populates the initial edges (and stashes the list) BEFORE subscribing live.
    onReadyRef.current?.(handleRef.current!)

    const view = {}
    Events.messages.listen(view, (...data: unknown[]) => {
      onMessagesRef.current?.(...data)
    })
    Events.after_messages.listen(view, (...data: unknown[]) => {
      onAfterMessagesRef.current?.(...data)
    })

    return () => {
      Events.destroy(view)
    }
  }, [mounted])

  return (
    <message-list ref={setHost}>
      {mounted && (
        <MessageListComponent
          ref={setHandle}
          pageId={pageId}
          edit={edit}
          rooms={rooms}
          roomFilter={roomFilter}
          host={hostRef.current}
        />
      )}
    </message-list>
  )
}
