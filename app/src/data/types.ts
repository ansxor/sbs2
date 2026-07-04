// The frozen shared contract (ARCHITECTURE §3). Every layer imports entity/API/route
// shapes from here; no agent redeclares an entity shape locally. Entities are MUTABLE
// transport DTOs, not immutable React state.

// ---- the ~id dual index ----
// array order preserved AND O(1) lookup via list[~id] (id = ~negId). `list[~id]`
// writes/reads a NEGATIVE integer key on the array object. Kept literally.
export type EntityList<T> = T[] & { [negId: number]: T | undefined }

export type Id = number
export type Perms = Record<string, string> // uid -> "CRUD"-ish; key "0" = everyone
export type MarkupLang = '12y2' | '12y' | 'plaintext' | (string & {})

// ---- base ----
export interface BaseEntity {
  readonly Type: string
  Blob(): Blob // kept for POST bodies
}

// ---- content (page / file / category / userpage) ----
export interface Content extends BaseEntity {
  Type: 'content'
  id: Id
  hash: string
  name: string
  text: string
  description: string
  contentType: number // CODES.InternalContentType
  literalType: string // 'category' | 'image/png' | 'chat' | ...
  parentId: Id
  createUserId: Id
  createDate: string
  permissions: Perms
  values: {
    markupLang?: MarkupLang
    pinned?: Id[]
    thumbnail?: string
    share?: unknown
    [k: string]: unknown
  }
  keywords: string[]
  lastCommentId: Id
  meta: string | null
  specialCount?: number
  readonly createDate2: Date | null // datetime getter ("key2")
  readonly name2: string // untitled-file normalization getter (regex verbatim)
  Meta?: FileMeta | null
}

// ---- user ----
export interface User extends BaseEntity {
  Type: 'user'
  id: Id
  username: string
  avatar: string
  groups: Id[]
  createDate: string
  readonly createDate2: Date | null
}

// ---- message (chat comment) ----
export interface Message extends BaseEntity {
  Type: 'message'
  id: Id
  text: string
  contentId: Id
  createUserId: Id
  editUserId?: Id
  createDate: string
  readonly createDate2: Date | null
  edited: boolean
  deleted: boolean
  module: string | null
  uidsInText: Id[]
  values: {
    m?: MarkupLang
    replyingTo?: Id
    a?: string
    big?: string
    n?: string
    b?: string
    apx?: boolean
    [k: string]: unknown
  }
  Author: Author // attached in place during link_comments
  LinkedUsers: User[]
}
export type Comment = Message // alias used by views

export interface Watch extends BaseEntity {
  Type: 'watch'
  id: Id
  contentId: Id
  Message?: Message
}

export interface Activity extends BaseEntity {
  Type: 'activity'
  id: Id
  date: string
  readonly date2: Date | null
  contentId: Id
  userId: Id
  action?: number
  parent?: Content
}
// + activity_aggregate, message_aggregate, ban, adminlog, content_engagement,
//   message_engagement, keyword_aggregate, userrelation, uservariable — all
//   mechanical, from ABOUT; added by the data layer (L1c) as needed.

// ---- Author (render metadata attached during normalization — NOT the user record) ----
export interface Author {
  username: string
  nickname: string | null
  avatar: string
  bigAvatar: string | null
  avatar_pixel: boolean
  bridge: boolean
  merge_hash: string // block-grouping key — template string preserved char-for-char
  date: Date
  page_name: string
  reply: Message | null
}

export interface FileMeta {
  width?: number
  height?: number
  size?: number
  quantize?: number
  createUser: User
  name?: string
}

// ---- API / chain layer ----
export interface ChainRequest {
  name?: string
  type: string
  fields?: string
  query?: string
  order?: string
  limit?: number
  skip?: number
}
export interface Chain {
  values?: Record<string, unknown>
  requests: ChainRequest[]
}
export interface ListMap {
  [listName: string]: EntityList<any>
}
export interface ListMapMap {
  [eventType: string]: ListMap
}
export interface ApiResponse extends ListMap {
  objects?: ListMap
  [k: string]: any
}

// ApiRequest completion contract — PRESERVED EXACTLY:
//   success: cb(resp)          (single arg)
//   failure: cb(poison, err)   (arg0 = SELF_DESTRUCT proxy that throws on any access;
//                               arg1 = real Error)
export type ApiDone<T = ListMap> = (resp: T, err?: Error) => void

// ---- routing / view lifecycle contract ----
export interface NavLocation {
  type: string
  id: number | string | null
  query: Record<string, string>
  fragment: string | null
}

export interface SlotDescriptor {
  id: number
  url: string
}

// View lifecycle Start contract (§6):
export type StartResult =
  | { quick: true }
  | { chain: Chain; check?: (resp: ListMap) => unknown }

// Per-slot header portal API (§6) — set/append into the slot's <view-header>.
export interface SlotHeaderApi {
  set_title(title: string): void
  set_entity_title(entity: BaseEntity): void
  add_header_links(...links: Node[]): void
}

// Props every route Component receives from the lifecycle engine (§5b/§6).
export interface ViewComponentProps {
  data: ListMap
  loc: NavLocation
  header: SlotHeaderApi
}

// ---- settings descriptor (§5) ----
export type SettingEvent = 'init' | 'change' | 'update' | 'save'
export interface SettingDescriptor {
  name: string
  label?: string
  type: 'text' | 'select' | 'code' | 'checkbox' | (string & {})
  options?: Array<[string, string] | string>
  default?: unknown
  order?: number
  autosave?: boolean
  update?: (value: any, event: SettingEvent) => void
  render?: unknown
}
