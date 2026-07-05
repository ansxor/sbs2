// Merged feed helpers for the All chat view (sbs2-cog).
//
// The All view merges messages from multiple rooms into one chronological
// stream. This module provides the chain-query builders and the merge-sort
// helper that the AllView component uses for initial load and "load older".
//
// The chain query pattern mirrors PageView.Start's message request, but
// queries across a set of room ids (`contentId IN @rooms`) instead of a
// single pid. Messages come back in `id_desc` order (newest first); the
// AllView feeds them to MessageList.display_edge oldest-first (reversed),
// matching PageView's onListReady loop.

import type { Chain, Id } from '../data/types'

// Limit per room for the initial load. With ~8 rooms this is ~240 messages.
const PER_ROOM_LIMIT = 30

// Build the chain for the initial multi-room message load.
// `rooms` is the array of active room ids. `lastId` (optional) is the cursor
// for "load older" — only messages with id < lastId are returned.
export function buildMergedChain(rooms: Id[], lastId?: Id): Chain {
  const values: Record<string, unknown> = {
    rooms,
  }
  let query = 'contentId IN @rooms AND !notdeleted()'
  if (lastId != null) {
    values.last = lastId
    query += ' AND id < @last'
  }
  return {
    values,
    requests: [
      { type: 'message', fields: '*', query, order: 'id_desc', limit: rooms.length * PER_ROOM_LIMIT },
      { name: 'replies', type: 'message', fields: '*', query: 'id in @message.values.replyingTo AND id NOT IN @message.id' },
      {
        type: 'user',
        fields: '*',
        query:
          'id IN @message.createUserId OR id IN @message.editUserId OR id IN @replies.createUserId',
      },
      {
        type: 'content',
        fields: 'id,name,hash,contentType,literalType,permissions,createUserId,values',
        query: 'id IN @rooms',
      },
    ],
  }
}

// Build a chain to search for rooms by name (for the room-add UI).
// Mirrors Sidebar.tsx's doSearch chain but filters to chat-type content.
export function buildRoomSearchChain(search: string): Chain {
  return {
    values: {
      search: `%${search}%`,
      pagetype: [1, 4], // chat + resource pages
    },
    requests: [
      {
        type: 'content',
        fields: 'name,id,contentType,permissions,createUserId,lastCommentId,values',
        query: 'contentType in @pagetype AND name LIKE @search',
        limit: 50,
        order: 'lastCommentId_desc',
      },
    ],
  }
}
