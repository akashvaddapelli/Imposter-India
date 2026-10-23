/**
 * Imposter India — Multiplayer Protocol (Mode B Connection Proof)
 *
 * Defines the wire protocol, message validation, and payload safety rules.
 * Does not transmit game roles or secret words in this proof phase.
 */

export const PROTOCOL_VERSION = '1.0';
export const MAX_NAME_LENGTH = 24;
export const MAX_TEXT_LENGTH = 140;
export const MAX_ROOM_CODE_LENGTH = 12;

export type Participant = {
  id: string;
  name: string;
  isHost: boolean;
  joinedAt: number;
};

export type TestMessage = {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
};

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// Client -> Server messages
export type ClientJoinRoomMessage = {
  type: 'JOIN_ROOM';
  roomCode: string;
  participantId: string;
  participantName: string;
};

export type ClientLeaveRoomMessage = {
  type: 'LEAVE_ROOM';
  roomCode: string;
  participantId: string;
};

export type ClientSendTestMessage = {
  type: 'SEND_TEST_MESSAGE';
  roomCode: string;
  participantId: string;
  text: string;
};

export type ClientPingMessage = {
  type: 'PING';
  timestamp: number;
};

export type ClientMessage =
  | ClientJoinRoomMessage
  | ClientLeaveRoomMessage
  | ClientSendTestMessage
  | ClientPingMessage;

// Server -> Client messages
export type ServerRoomJoinedMessage = {
  type: 'ROOM_JOINED';
  roomCode: string;
  participantId: string;
  isHost: boolean;
  participants: Participant[];
};

export type ServerJoinErrorMessage = {
  type: 'JOIN_ERROR';
  reason: string;
};

export type ServerParticipantJoinedMessage = {
  type: 'PARTICIPANT_JOINED';
  participant: Participant;
};

export type ServerParticipantLeftMessage = {
  type: 'PARTICIPANT_LEFT';
  participantId: string;
  reason?: string;
};

export type ServerTestMessageReceived = {
  type: 'TEST_MESSAGE_RECEIVED';
  message: TestMessage;
};

export type ServerPongMessage = {
  type: 'PONG';
  timestamp: number;
};

export type ServerErrorMessage = {
  type: 'ERROR';
  message: string;
};

export type ServerMessage =
  | ServerRoomJoinedMessage
  | ServerJoinErrorMessage
  | ServerParticipantJoinedMessage
  | ServerParticipantLeftMessage
  | ServerTestMessageReceived
  | ServerPongMessage
  | ServerErrorMessage;

/** Sanitizes user-entered text: trims whitespace, removes control chars, caps length. */
export function sanitizeString(val: unknown, maxLen = MAX_TEXT_LENGTH): string {
  if (typeof val !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return val
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // strip control chars
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

/** Formats and normalizes a room code (uppercase alphanumeric + hyphens). */
export function normalizeRoomCode(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, MAX_ROOM_CODE_LENGTH);
}

/** Generates a human-friendly room code (e.g. INDIA-7K2). */
export function generateRoomCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // exclude ambiguous characters: 0, 1, I, O
  let random = '';
  for (let i = 0; i < 3; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `INDIA-${random}`;
}

/** Generates a safe, random client ID. */
export function generateParticipantId(): string {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Validates and parses an incoming ClientMessage. Returns null if invalid or malformed. */
export function validateClientMessage(raw: unknown): ClientMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const msg = raw as Record<string, unknown>;
  const type = msg.type;

  if (type === 'JOIN_ROOM') {
    const roomCode = normalizeRoomCode(msg.roomCode);
    const participantId = sanitizeString(msg.participantId, 40);
    const participantName = sanitizeString(msg.participantName, MAX_NAME_LENGTH);
    if (!roomCode || roomCode.length < 3) return null;
    if (!participantId) return null;
    if (!participantName) return null;
    return { type: 'JOIN_ROOM', roomCode, participantId, participantName };
  }

  if (type === 'LEAVE_ROOM') {
    const roomCode = normalizeRoomCode(msg.roomCode);
    const participantId = sanitizeString(msg.participantId, 40);
    if (!roomCode || !participantId) return null;
    return { type: 'LEAVE_ROOM', roomCode, participantId };
  }

  if (type === 'SEND_TEST_MESSAGE') {
    const roomCode = normalizeRoomCode(msg.roomCode);
    const participantId = sanitizeString(msg.participantId, 40);
    const text = sanitizeString(msg.text, MAX_TEXT_LENGTH);
    if (!roomCode || !participantId || !text) return null;
    return { type: 'SEND_TEST_MESSAGE', roomCode, participantId, text };
  }

  if (type === 'PING') {
    const timestamp = typeof msg.timestamp === 'number' && Number.isFinite(msg.timestamp) ? msg.timestamp : Date.now();
    return { type: 'PING', timestamp };
  }

  return null;
}

/** Validates and parses an incoming ServerMessage. Returns null if invalid or malformed. */
export function validateServerMessage(raw: unknown): ServerMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const msg = raw as Record<string, unknown>;
  const type = msg.type;

  if (type === 'ROOM_JOINED') {
    const roomCode = normalizeRoomCode(msg.roomCode);
    const participantId = sanitizeString(msg.participantId, 40);
    const isHost = Boolean(msg.isHost);
    if (!roomCode || !participantId || !Array.isArray(msg.participants)) return null;
    const participants: Participant[] = [];
    for (const p of msg.participants) {
      if (!p || typeof p !== 'object') continue;
      const id = sanitizeString((p as Record<string, unknown>).id, 40);
      const name = sanitizeString((p as Record<string, unknown>).name, MAX_NAME_LENGTH);
      const host = Boolean((p as Record<string, unknown>).isHost);
      const joinedAt = Number((p as Record<string, unknown>).joinedAt) || Date.now();
      if (id && name) participants.push({ id, name, isHost: host, joinedAt });
    }
    return { type: 'ROOM_JOINED', roomCode, participantId, isHost, participants };
  }

  if (type === 'JOIN_ERROR') {
    const reason = sanitizeString(msg.reason, 200) || 'Could not join room.';
    return { type: 'JOIN_ERROR', reason };
  }

  if (type === 'PARTICIPANT_JOINED') {
    const p = msg.participant as Record<string, unknown> | undefined;
    if (!p || typeof p !== 'object') return null;
    const id = sanitizeString(p.id, 40);
    const name = sanitizeString(p.name, MAX_NAME_LENGTH);
    const isHost = Boolean(p.isHost);
    const joinedAt = Number(p.joinedAt) || Date.now();
    if (!id || !name) return null;
    return { type: 'PARTICIPANT_JOINED', participant: { id, name, isHost, joinedAt } };
  }

  if (type === 'PARTICIPANT_LEFT') {
    const participantId = sanitizeString(msg.participantId, 40);
    if (!participantId) return null;
    const reason = typeof msg.reason === 'string' ? sanitizeString(msg.reason, 100) : undefined;
    return { type: 'PARTICIPANT_LEFT', participantId, ...(reason ? { reason } : {}) };
  }

  if (type === 'TEST_MESSAGE_RECEIVED') {
    const m = msg.message as Record<string, unknown> | undefined;
    if (!m || typeof m !== 'object') return null;
    const id = sanitizeString(m.id, 60);
    const senderId = sanitizeString(m.senderId, 40);
    const senderName = sanitizeString(m.senderName, MAX_NAME_LENGTH);
    const text = sanitizeString(m.text, MAX_TEXT_LENGTH);
    const timestamp = Number(m.timestamp) || Date.now();
    if (!id || !senderId || !senderName || !text) return null;
    return { type: 'TEST_MESSAGE_RECEIVED', message: { id, senderId, senderName, text, timestamp } };
  }

  if (type === 'PONG') {
    const timestamp = typeof msg.timestamp === 'number' && Number.isFinite(msg.timestamp) ? msg.timestamp : Date.now();
    return { type: 'PONG', timestamp };
  }

  if (type === 'ERROR') {
    const message = sanitizeString(msg.message, 200) || 'An unexpected error occurred.';
    return { type: 'ERROR', message };
  }

  return null;
}
