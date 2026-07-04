// Block/ignore store for users and rooms.
//
// Persists two lists in localStorage:
//   - sbs-blocked-users: { id, username, avatar? }
//   - sbs-blocked-rooms:  { id, name, thumbnail? }
//
// Provides reactive subscriptions so imperative islands (UserList, MessageList,
// Sidebar) can redraw when the block lists change, and item-level Alt-click handlers
// on user/room labels call promptBlockUser / promptBlockRoom below.

export interface BlockedUser {
  id: number
  username: string
  avatar?: string
}

export interface BlockedRoom {
  id: number
  name: string
  thumbnail?: string
}

export function roomBlockProps(content: { id: number; name2: string; values: { thumbnail?: string } }): BlockedRoom {
  return {
    id: content.id,
    name: content.name2,
    thumbnail: content.values.thumbnail,
  }
}

const USERS_KEY = 'sbs-blocked-users'
const ROOMS_KEY = 'sbs-blocked-rooms'

const listeners = new Set<() => void>()

let blockedUsers: BlockedUser[] = []
let blockedRooms: BlockedRoom[] = []

function isBlockedUser(value: unknown): value is BlockedUser {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.id === 'number' && typeof v.username === 'string'
}

function isBlockedRoom(value: unknown): value is BlockedRoom {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.id === 'number' && typeof v.name === 'string'
}

function parseList<T>(raw: string | null, guard: (v: unknown) => v is T): T[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) return parsed.filter(guard)
  } catch {}
  return []
}

function load(): void {
  blockedUsers = parseList(localStorage.getItem(USERS_KEY), isBlockedUser)
  blockedRooms = parseList(localStorage.getItem(ROOMS_KEY), isBlockedRoom)
}

function save(): void {
  localStorage.setItem(USERS_KEY, JSON.stringify(blockedUsers))
  localStorage.setItem(ROOMS_KEY, JSON.stringify(blockedRooms))
  for (const cb of listeners) cb()
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function getBlockedUsers(): readonly BlockedUser[] {
  return blockedUsers
}

export function getBlockedRooms(): readonly BlockedRoom[] {
  return blockedRooms
}

export function isUserBlocked(id: number): boolean {
  return blockedUsers.some((u) => u.id === id)
}

export function isRoomBlocked(id: number): boolean {
  return blockedRooms.some((r) => r.id === id)
}

export function blockUser(user: BlockedUser): void {
  if (!isUserBlocked(user.id)) {
    blockedUsers.push(user)
    save()
  }
}

export function unblockUser(id: number): void {
  const before = blockedUsers.length
  blockedUsers = blockedUsers.filter((u) => u.id !== id)
  if (blockedUsers.length !== before) save()
}

export function blockRoom(room: BlockedRoom): void {
  if (!isRoomBlocked(room.id)) {
    blockedRooms.push(room)
    save()
  }
}

export function unblockRoom(id: number): void {
  const before = blockedRooms.length
  blockedRooms = blockedRooms.filter((r) => r.id !== id)
  if (blockedRooms.length !== before) save()
}

export function promptBlockUser(
  ev: { altKey: boolean; preventDefault: () => void },
  user: BlockedUser,
): void {
  if (!ev.altKey) return
  ev.preventDefault()
  if (
    confirm(
      `Block user "${user.username}"?\nTheir messages will be hidden and their avatars will be tinted sepia.`,
    )
  )
    blockUser(user)
}

export function promptBlockRoom(
  ev: { altKey: boolean; preventDefault: () => void },
  room: BlockedRoom,
): void {
  if (!ev.altKey) return
  ev.preventDefault()
  if (confirm(`Block room "${room.name}"?\nMessages from this room will be hidden from the sidebar.`))
    blockRoom(room)
}

load()
