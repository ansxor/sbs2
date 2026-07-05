// L7c — AllView (sbs2-cog): merged room feed + room-targeted composer.
//
// A new `all` route that merges messages from multiple rooms into one
// chronological stream. Users add rooms by searching; a filter tab bar at
// the top toggles room visibility; a target tab bar above the composer
// selects the destination room for outgoing messages. Each message group
// has a room-colored vertical ribbon.
//
// Architecture: the view uses { quick: true } in Start (no initial chain),
// then manages its own data loading via Lp.chain when the room set changes.
// A single MessageList in multi-room mode (rooms set) handles rendering.
// The ScrollerHost + MessageListView islands are reused from PageView.
//
// See .hermes/plans/sbs2-cog-all-chat-view.md for the full design.

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type * as React from 'react'

import type {
  Content,
  EntityList,
  Id,
  ListMap,
  Message,
  NavLocation,
  StartResult,
  User,
  ViewComponentProps,
} from '../data/types'
import { Author } from '../data/entity'
import { Req } from '../services/request'
import { Lp } from '../services/socket'
import { Settings } from '../services/settings'
import { Edit } from '../services/edit'
import { Nav, setActiveEditor } from '../services/nav'
import { type MessageListHandle } from '../services/message-list'
import type { Scroller } from '../services/scroller'
import { isRoomBlocked, isUserBlocked } from '../services/block'
import { buildMergedChain, buildRoomSearchChain } from '../services/merged-feed'
import { roomColor } from '../services/room-color'
import type { RouteModule } from '../routing/view-registry'
import { ScrollerHost } from '../islands/ScrollerHost'
import { MessageListView } from '../islands/MessageListView'
import { RoomTabs } from '../components/RoomTabs'
import { MessageInfo } from '../components/MessageInfo'

// ---- helpers ----

// Parse the room id list from the URL query string `?rooms=1,2,3`.
function parseRooms(query: Record<string, string>): Id[] {
  const raw = query.rooms
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => n > 0 && Number.isFinite(n))
}

// Serialize a room id list back to a query string fragment.
function serializeRooms(rooms: Id[]): string {
  return rooms.join(',')
}

// The read_input working object for composing a new message.
type Draft = {
  contentId: number
  text: string
  values: Record<string, unknown>
}

// ---- Start: always quick (no initial chain; the component loads dynamically) ----
function Start(_loc: NavLocation): StartResult {
  return { quick: true }
}

// ---- Component ----
function AllView({ loc, header }: ViewComponentProps): React.JSX.Element {
  // ---- room state (from URL) ----
  const initialRooms = useMemo(() => parseRooms(loc.query), [loc.query.rooms])
  const [roomIds, setRoomIds] = useState<Id[]>(initialRooms)
  // Room metadata (name, permissions, etc.) loaded from the server.
  const [roomData, setRoomData] = useState<Record<number, Content>>(Object.create(null))
  // Visible rooms (filter). null = all visible. Otherwise a Set of visible ids.
  const [visibleRooms, setVisibleRooms] = useState<Set<Id> | null>(null)
  // Composer target room.
  const [targetRoom, setTargetRoom] = useState<Id | null>(initialRooms[0] ?? null)

  // ---- search state ----
  const [searchResults, setSearchResults] = useState<Content[]>([])
  const [searching, setSearching] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // ---- DOM / imperative refs ----
  const rootRef = useRef<HTMLElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const textareaContainerRef = useRef<HTMLElement>(null)
  const extraRef = useRef<HTMLDivElement>(null)

  // ---- imperative instances ----
  const scrollerRef = useRef<Scroller | null>(null)
  const listRef = useRef<MessageListHandle | null>(null)
  const [infoMessage, setInfoMessage] = useState<Message | null>(null)

  // ---- derived: rooms set for MessageListView (memoized for stable identity) ----
  const roomsSet = useMemo(() => {
    if (roomIds.length === 0) return undefined
    return new Set(roomIds)
  }, [roomIds])

  // ---- room tabs data ----
  const roomTabs = useMemo(
    () =>
      roomIds.map((id) => ({
        id,
        name: roomData[id]?.name ?? `Room ${id}`,
      })),
    [roomIds, roomData],
  )

  // ---- URL sync: when roomIds change, update the URL ----
  const updateUrl = useCallback(
    (rooms: Id[]) => {
      const query: Record<string, string> = { ...loc.query }
      if (rooms.length) query.rooms = serializeRooms(rooms)
      else delete query.rooms
      Nav.load_location({ type: 'all', id: null, query, fragment: loc.fragment })
    },
    [loc.query, loc.fragment],
  )

  // ---- room management: add / remove ----
  const addRoom = useCallback(
    (id: Id) => {
      setRoomIds((prev) => {
        if (prev.includes(id)) return prev
        const next = [...prev, id]
        updateUrl(next)
        return next
      })
      setTargetRoom((prev) => prev ?? id)
    },
    [updateUrl],
  )

  const removeRoom = useCallback(
    (id: Id) => {
      setRoomIds((prev) => {
        const next = prev.filter((r) => r !== id)
        updateUrl(next)
        return next
      })
      setTargetRoom((prev) => (prev === id ? null : prev))
      setVisibleRooms((prev) => {
        if (!prev) return prev
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    },
    [updateUrl],
  )

  // ---- filter toggle ----
  // visibleRooms: null = all visible (no filter). A Set = only those rooms are visible.
  // Clicking a tab toggles a room in/out of the visible set.
  const toggleFilter = useCallback((id: Id) => {
    setVisibleRooms((prev) => {
      if (!prev) {
        // All visible → hide this one: visible = all except this
        const next = new Set(roomIds)
        next.delete(id)
        return next
      }
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [roomIds])

  // ---- search ----
  const doSearch = useCallback(() => {
    const q = searchInputRef.current?.value.trim()
    if (!q) {
      setSearchResults([])
      return
    }
    setSearching(true)
    Lp.chain(buildRoomSearchChain(q), (resp: { content: Content[] }) => {
      setSearching(false)
      setSearchResults(resp.content || [])
    })
  }, [])

  // ---- load room metadata + initial messages when roomIds change ----
  useLayoutEffect(() => {
    if (roomIds.length === 0) return
    // StrictMode double-invokes effects; the first invocation's Lp.chain is
    // still in-flight when cleanup runs, so a `cancelled` flag prevents the
    // stale callback from feeding duplicate messages to display_edge.
    let cancelled = false
    const chain = buildMergedChain(roomIds)
    Lp.chain(chain, (resp: ListMap) => {
      if (cancelled) return
      const messages = (resp.message as EntityList<Message>) || []
      const users = (resp.user as EntityList<User>) || []
      const contents = (resp.content as EntityList<Content>) || []

      // Stash room metadata
      const roomMap: Record<number, Content> = Object.create(null)
      for (const c of contents) roomMap[c.id] = c
      setRoomData((prev) => ({ ...prev, ...roomMap }))

      // Merge users into Lp.users (for StatusDisplay / UserList)
      Object.assign(Lp.users, users)

      // Feed messages to the MessageList (oldest first — they come back id_desc).
      const list = listRef.current
      if (list) {
        for (let i = messages.length - 1; i >= 0; i--) {
          list.display_edge(messages[i])
        }
        scrollerRef.current?.scroll_instant()
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomsSet])

  // ---- header ----
  useLayoutEffect(() => {
    header.set_title('All Chat')
    return () => {}
  }, [header])

  // ---- message_control handler (info/edit/reply) ----
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const on_mce = (e: Event): void => {
      const ce = e as CustomEvent<{ action: string; data: Message }>
      if (ce.detail.action == 'info') {
        e.stopPropagation()
        setInfoMessage(ce.detail.data)
      }
    }
    root.addEventListener('message_control', on_mce)
    return () => {
      root.removeEventListener('message_control', on_mce)
    }
  }, [])

  // ---- composer: send_message ----
  const enter_submits = (): boolean =>
    !['newline', 'newline, strip trailing'].includes(Settings.values.chat_enter)

  const textarea_resize = (): void => {
    const ta = textareaRef.current!
    ta.style.height = '10px'
    let height = ta.scrollHeight
    const dpr = window.devicePixelRatio
    height = Math.ceil(height / dpr + 1) * dpr
    textareaContainerRef.current!.style.height = `${height}px`
    ta.style.height = '100%'
  }

  const send_message = (): void => {
    if (!targetRoom) {
      alert('Select a target room first')
      return
    }
    const text = textareaRef.current!.value
    if (!text) return

    const d: Draft = {
      contentId: targetRoom,
      text,
      values: {},
    }
    const sv = Settings.values
    if (sv.avatar) d.values.a = sv.avatar
    else if (Req.me) d.values.a = Req.me.avatar
    if (sv.nickname) d.values.n = Author.filter_nickname(sv.nickname)
    if (sv.big_avatar == 'on' && sv.big_avatar_id) d.values.big = sv.big_avatar_id
    if (sv.avatar_pixel == 'on') d.values.apx = true
    d.values.m = sv.chat_markup

    if (
      ['submit, strip trailing', 'newline, strip trailing'].includes(Settings.values.chat_enter) &&
      d.text.endsWith('\n')
    )
      d.text = d.text.slice(0, -1)

    Req.send_message(d).do = (_resp, err) => {
      if (err) alert('Posting failed')
    }
    Edit.clear(textareaRef.current!)
    textarea_resize()
  }

  const onContainerKeyDown = (ev: React.KeyboardEvent): void => {
    if (ev.nativeEvent.isComposing) return
    if (ev.key === 'Enter' && !ev.shiftKey && enter_submits()) {
      ev.preventDefault()
      send_message()
    }
  }

  // ---- load older messages across all active rooms ----
  const onLoadOlder = (): void => {
    const list = listRef.current
    if (!list) return
    const oldest = list.oldest()
    if (!oldest) return
    const oldestId = oldest.id
    const chain = buildMergedChain(roomIds, oldestId)
    Lp.chain(chain, (resp: ListMap) => {
      const messages = (resp.message as EntityList<Message>) || []
      const users = (resp.user as EntityList<User>) || []
      Object.assign(Lp.users, users)
      // Feed oldest-first (they come back id_desc)
      const scroller = scrollerRef.current
      scroller?.print_top(() => {
        for (let i = messages.length - 1; i >= 0; i--) {
          list.display_edge(messages[i])
        }
      })
    })
  }

  // ---- island callbacks ----
  const onScrollerReady = (s: Scroller): void => {
    scrollerRef.current = s
  }
  const onListReady = (l: MessageListHandle): void => {
    listRef.current = l
  }
  const onLiveMessages = (...args: unknown[]): void => {
    const comments = args[0] as Message[]
    const list = listRef.current!
    const scroller = scrollerRef.current!
    let x: ReturnType<Scroller['before_print']> | null = null
    let cb: (() => void) | null = () => {
      cb = null
      x = scroller.before_print(true)
    }
    for (const msg of comments) {
      // Skip messages from blocked rooms/users
      if (isUserBlocked(msg.createUserId) || isRoomBlocked(msg.contentId)) continue
      list.display_live(msg, cb)
    }
    if (x == null) return
    scroller.after_print(x)
  }
  const onAfterMessages = (): void => {
    scrollerRef.current?.unlock()
  }

  // ---- active editor registration ----
  const insert_text = (text: string): void => {
    Edit.insert(textareaRef.current!, text)
  }
  const editorHandle = useRef<{ Insert_Text: (t: string) => void } | null>(null)
  if (!editorHandle.current) editorHandle.current = { Insert_Text: insert_text }

  // ---- textarea autosize on input ----
  useLayoutEffect(() => {
    const container = textareaContainerRef.current
    if (!container) return
    const r = (): void => textarea_resize()
    container.addEventListener('input', r, { passive: true })
    return () => {
      container.removeEventListener('input', r)
      if (Nav.view() === editorHandle.current) setActiveEditor(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- render ----
  const visible = visibleRooms ?? new Set(roomIds)

  return (
    <view-root ref={rootRef} class="COL all-view">
      {/* Room filter tabs (top) */}
      <RoomTabs
        rooms={roomTabs}
        mode="filter"
        visible={visible}
        onToggle={toggleFilter}
        onClose={removeRoom}
      />

      {/* Room search + add panel */}
      <div className="all-search-panel COL">
        <div className="ROW">
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search rooms by name..."
            className="all-search-input"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                doSearch()
              }
            }}
          />
          <button onClick={doSearch} disabled={searching}>
            {searching ? '...' : 'Find'}
          </button>
        </div>
        {searchResults.length > 0 && (
          <div className="all-search-results">
            {searchResults.map((room) => (
              <button
                key={room.id}
                className="all-search-result bar"
                style={{ ['--room-color' as string]: roomColor(room.id) } as React.CSSProperties}
                onClick={() => {
                  addRoom(room.id)
                  setSearchResults([])
                  if (searchInputRef.current) searchInputRef.current.value = ''
                }}
              >
                <span className="all-search-result-ribbon" />
                {room.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Merged message feed */}
      {roomIds.length > 0 ? (
        <ScrollerHost className="FILL" onReady={onScrollerReady}>
          <div ref={extraRef} className="all-load-older">
            <button onClick={onLoadOlder}>load older messages</button>
          </div>
          <MessageListView
            pageId={roomIds[0]!}
            rooms={roomsSet}
            roomFilter={{ visibleRooms, roomData }}
            onReady={onListReady}
            onMessages={onLiveMessages}
            onAfterMessages={onAfterMessages}
          />
          <div className="chat-bottom" tabIndex={0} />
        </ScrollerHost>
      ) : (
        <div className="all-empty FILL">
          <p>No rooms added yet.</p>
          <p>Search for rooms above to add them to the All view.</p>
        </div>
      )}

      {/* Composer target tabs + textarea */}
      <div>
        <div className="inputPane">
          <MessageInfo selected={infoMessage} onClose={() => setInfoMessage(null)} />
        </div>
        {roomIds.length > 0 && (
          <RoomTabs
            rooms={roomTabs}
            mode="target"
            selected={targetRoom}
            onSelect={setTargetRoom}
          />
        )}
        <div className="inputPane ROW">
          <textarea-container
            class="FILL"
            ref={textareaContainerRef}
            onKeyDown={onContainerKeyDown}
          >
            <textarea
              className="chatTextarea"
              ref={textareaRef}
              placeholder={targetRoom ? `Send to ${roomData[targetRoom]?.name ?? 'room'}` : 'Select a target room...'}
              disabled={!targetRoom}
              onFocus={() => setActiveEditor(editorHandle.current)}
            />
          </textarea-container>
          <div className="COL">
            <button className="FILL" onClick={() => send_message()}>
              Send
            </button>
          </div>
        </div>
      </div>
    </view-root>
  )
}

export const AllViewModule: RouteModule = { Start, Component: AllView }
