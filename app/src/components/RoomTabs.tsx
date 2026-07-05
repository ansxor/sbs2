// RoomTabs — reusable horizontal tab bar for the All chat view (sbs2-cog).
//
// Two modes:
// - "filter" (top of feed): each tab toggles a room's visibility. Multiple
//   tabs can be active. Clicking an active tab deactivates it (hides that
//   room's messages).
// - "target" (above composer): exactly one tab is selected at a time;
//   clicking a tab sets the target room for the next outgoing message.
//
// Styling follows DESIGN.md: dark bar background, active tab matches the
// page surface. Each tab has a room-colored left border (the ribbon color).

import type { Id } from '../data/types'
import { roomColor } from '../services/room-color'

export interface RoomTab {
  id: Id
  name: string
}

export interface RoomTabsProps {
  rooms: RoomTab[]
  // "filter": Set of visible room ids (multi-select toggles).
  // "target": single selected room id.
  mode: 'filter' | 'target'
  // For filter mode: the set of visible room ids.
  visible?: Set<Id>
  // For target mode: the selected room id.
  selected?: Id | null
  // For filter mode: toggle a room's visibility.
  onToggle?: (id: Id) => void
  // For target mode: select a room.
  onSelect?: (id: Id) => void
  // Optional: close (remove) button per tab.
  onClose?: (id: Id) => void
}

export function RoomTabs({
  rooms,
  mode,
  visible,
  selected,
  onToggle,
  onSelect,
  onClose,
}: RoomTabsProps): React.JSX.Element {
  return (
    <div className="all-room-tabs" role="tablist">
      {rooms.length === 0 && (
        <span className="all-room-tabs-empty">No rooms added yet</span>
      )}
      {rooms.map((room) => {
        const color = roomColor(room.id)
        const isActive =
          mode === 'filter'
            ? visible?.has(room.id) ?? true
            : selected === room.id
        return (
          <button
            key={room.id}
            role="tab"
            className={`all-room-tab${isActive ? ' active' : ''}`}
            style={{ ['--room-color' as string]: color } as React.CSSProperties}
            onClick={() => {
              if (mode === 'filter') onToggle?.(room.id)
              else onSelect?.(room.id)
            }}
            aria-selected={isActive}
            title={room.name}
          >
            <span className="all-room-tab-name">{room.name}</span>
            {onClose && (
              <span
                className="all-room-tab-close"
                role="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation()
                  onClose(room.id)
                }}
              >
                ×
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
