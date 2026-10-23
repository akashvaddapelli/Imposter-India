import { describe, expect, it } from 'vitest';
import {
  generateParticipantId,
  generateRoomCode,
  normalizeRoomCode,
  sanitizeString,
  validateClientMessage,
  validateServerMessage,
  MAX_NAME_LENGTH,
  MAX_TEXT_LENGTH,
} from './protocol';

describe('multiplayer protocol: sanitization and generators', () => {
  it('sanitizeString removes control characters and collapses extra spaces', () => {
    expect(sanitizeString('  Hello\u0000\u001F World  ')).toBe('Hello World');
    expect(sanitizeString('Multi   Space   Line')).toBe('Multi Space Line');
    expect(sanitizeString(123 as unknown)).toBe('');
    expect(sanitizeString(null)).toBe('');
  });

  it('sanitizeString caps length at maxLen', () => {
    const long = 'A'.repeat(200);
    expect(sanitizeString(long, 50)).toHaveLength(50);
  });

  it('normalizeRoomCode forces uppercase and drops illegal characters', () => {
    expect(normalizeRoomCode('india-7k2')).toBe('INDIA-7K2');
    expect(normalizeRoomCode('room #123! ')).toBe('ROOM123');
    expect(normalizeRoomCode(null)).toBe('');
  });

  it('generateRoomCode produces a clean format (INDIA-XXX)', () => {
    const code = generateRoomCode();
    expect(code).toMatch(/^INDIA-[2-9A-Z]{3}$/);
  });

  it('generateParticipantId produces unique client IDs', () => {
    const id1 = generateParticipantId();
    const id2 = generateParticipantId();
    expect(id1).toMatch(/^p-[a-z0-9]+-[a-z0-9]+$/);
    expect(id1).not.toBe(id2);
  });
});

describe('multiplayer protocol: validateClientMessage', () => {
  it('accepts valid JOIN_ROOM message', () => {
    const valid = validateClientMessage({
      type: 'JOIN_ROOM',
      roomCode: 'india-7k2',
      participantId: 'p-user-1',
      participantName: 'Ramesh',
    });
    expect(valid).toEqual({
      type: 'JOIN_ROOM',
      roomCode: 'INDIA-7K2',
      participantId: 'p-user-1',
      participantName: 'Ramesh',
    });
  });

  it('rejects JOIN_ROOM with missing or empty fields', () => {
    expect(validateClientMessage({ type: 'JOIN_ROOM', roomCode: '', participantId: 'p-1', participantName: 'A' })).toBeNull();
    expect(validateClientMessage({ type: 'JOIN_ROOM', roomCode: 'IN', participantId: 'p-1', participantName: 'A' })).toBeNull();
    expect(validateClientMessage({ type: 'JOIN_ROOM', roomCode: 'INDIA-1', participantId: '', participantName: 'A' })).toBeNull();
    expect(validateClientMessage({ type: 'JOIN_ROOM', roomCode: 'INDIA-1', participantId: 'p-1', participantName: '   ' })).toBeNull();
  });

  it('accepts valid LEAVE_ROOM message', () => {
    const valid = validateClientMessage({
      type: 'LEAVE_ROOM',
      roomCode: 'INDIA-7K2',
      participantId: 'p-user-1',
    });
    expect(valid).toEqual({
      type: 'LEAVE_ROOM',
      roomCode: 'INDIA-7K2',
      participantId: 'p-user-1',
    });
  });

  it('accepts valid SEND_TEST_MESSAGE and enforces length cap', () => {
    const valid = validateClientMessage({
      type: 'SEND_TEST_MESSAGE',
      roomCode: 'INDIA-7K2',
      participantId: 'p-1',
      text: 'Hello from device 2!',
    });
    expect(valid).toEqual({
      type: 'SEND_TEST_MESSAGE',
      roomCode: 'INDIA-7K2',
      participantId: 'p-1',
      text: 'Hello from device 2!',
    });

    const oversized = validateClientMessage({
      type: 'SEND_TEST_MESSAGE',
      roomCode: 'INDIA-7K2',
      participantId: 'p-1',
      text: 'X'.repeat(300),
    });
    expect(oversized?.type).toBe('SEND_TEST_MESSAGE');
    if (oversized && oversized.type === 'SEND_TEST_MESSAGE') {
      expect(oversized.text.length).toBe(MAX_TEXT_LENGTH);
    }
  });

  it('accepts valid PING message with fallback timestamp', () => {
    expect(validateClientMessage({ type: 'PING', timestamp: 123456 })).toEqual({
      type: 'PING',
      timestamp: 123456,
    });
    const fallback = validateClientMessage({ type: 'PING' });
    expect(fallback?.type).toBe('PING');
  });

  it('rejects unknown message types, null, or malformed JSON objects', () => {
    expect(validateClientMessage(null)).toBeNull();
    expect(validateClientMessage('not-an-object')).toBeNull();
    expect(validateClientMessage([])).toBeNull();
    expect(validateClientMessage({ type: 'UNKNOWN_OPCODE' })).toBeNull();
    expect(validateClientMessage({ type: 'REVEAL_SECRET_WORD' })).toBeNull();
  });
});

describe('multiplayer protocol: validateServerMessage', () => {
  it('accepts valid ROOM_JOINED message', () => {
    const valid = validateServerMessage({
      type: 'ROOM_JOINED',
      roomCode: 'india-7k2',
      participantId: 'p-1',
      isHost: true,
      participants: [
        { id: 'p-1', name: 'Host Player', isHost: true, joinedAt: 1000 },
      ],
    });
    expect(valid).toEqual({
      type: 'ROOM_JOINED',
      roomCode: 'INDIA-7K2',
      participantId: 'p-1',
      isHost: true,
      participants: [
        { id: 'p-1', name: 'Host Player', isHost: true, joinedAt: 1000 },
      ],
    });
  });

  it('accepts valid JOIN_ERROR and sanitizes reason', () => {
    const valid = validateServerMessage({
      type: 'JOIN_ERROR',
      reason: 'Room is full (max 12 players).',
    });
    expect(valid).toEqual({
      type: 'JOIN_ERROR',
      reason: 'Room is full (max 12 players).',
    });
  });

  it('accepts valid PARTICIPANT_JOINED and PARTICIPANT_LEFT', () => {
    const joined = validateServerMessage({
      type: 'PARTICIPANT_JOINED',
      participant: { id: 'p-2', name: 'Friend', isHost: false, joinedAt: 2000 },
    });
    expect(joined).toEqual({
      type: 'PARTICIPANT_JOINED',
      participant: { id: 'p-2', name: 'Friend', isHost: false, joinedAt: 2000 },
    });

    const left = validateServerMessage({
      type: 'PARTICIPANT_LEFT',
      participantId: 'p-2',
      reason: 'disconnected',
    });
    expect(left).toEqual({
      type: 'PARTICIPANT_LEFT',
      participantId: 'p-2',
      reason: 'disconnected',
    });
  });

  it('accepts valid TEST_MESSAGE_RECEIVED and sanitizes payload', () => {
    const valid = validateServerMessage({
      type: 'TEST_MESSAGE_RECEIVED',
      message: {
        id: 'msg-1',
        senderId: 'p-2',
        senderName: 'Friend',
        text: 'Test message text',
        timestamp: 5000,
      },
    });
    expect(valid).toEqual({
      type: 'TEST_MESSAGE_RECEIVED',
      message: {
        id: 'msg-1',
        senderId: 'p-2',
        senderName: 'Friend',
        text: 'Test message text',
        timestamp: 5000,
      },
    });
  });

  it('rejects malformed server payloads', () => {
    expect(validateServerMessage(null)).toBeNull();
    expect(validateServerMessage({ type: 'PARTICIPANT_JOINED', participant: null })).toBeNull();
    expect(validateServerMessage({ type: 'TEST_MESSAGE_RECEIVED', message: { text: '' } })).toBeNull();
  });
});
