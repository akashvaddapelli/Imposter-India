import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { RoomRegistry } from './roomRegistry.mjs';

const MAX_ROOM_CODE_LENGTH = 12;
const MAX_NAME_LENGTH = 24;
const MAX_TEXT_LENGTH = 140;
const MAX_ACTIVE_ROOMS = 1000;
const MAX_CONNECTIONS = 40;
const MAX_MESSAGES_PER_WINDOW = 40;
const RATE_LIMIT_WINDOW_MS = 10_000;
const ROOM_MAX_AGE_MS = 4 * 60 * 60 * 1000;

function sanitizeString(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function parseRoomCode(value) {
  if (typeof value !== 'string') return '';
  const code = value.toUpperCase();
  if (code.length < 3 || code.length > MAX_ROOM_CODE_LENGTH || !/^[A-Z0-9-]+$/.test(code)) return '';
  return code;
}

function parseParticipantFields(message) {
  const roomCode = parseRoomCode(message.roomCode);
  const participantId = sanitizeString(message.participantId, 40);
  const participantName = sanitizeString(message.participantName, MAX_NAME_LENGTH);
  if (!roomCode || !participantId || !participantName) return null;
  return { roomCode, participantId, participantName };
}

function safeSend(socket, payload) {
  if (socket.readyState !== WebSocket.OPEN) return;
  try {
    socket.send(JSON.stringify(payload));
  } catch {
    socket.terminate();
  }
}

function broadcast(room, payload, except = null) {
  for (const socket of room.keys()) {
    if (socket !== except) safeSend(socket, payload);
  }
}

function notifyDeparture(result) {
  if (!result) return;
  if (result.remaining.size === 0) return;
  broadcast(result.remaining, {
    type: 'PARTICIPANT_LEFT',
    participantId: result.participant.id,
    reason: result.reason,
  });
  if (result.hostChanged) {
    broadcast(result.remaining, { type: 'HOST_CHANGED', participantId: result.hostChanged.id });
  }
}

function parseAllowedOrigins(value) {
  if (!value) return null;
  const origins = Array.isArray(value) ? value : value.split(',');
  return new Set(origins.map((origin) => {
    const normalized = origin.trim();
    const parsed = new URL(normalized);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== normalized) {
      throw new Error(`Invalid allowed browser origin: ${normalized}`);
    }
    return normalized;
  }));
}

export function createRelayServer(options = {}) {
  const registry = new RoomRegistry();
  const allowedOrigins = parseAllowedOrigins(options.allowedOrigins ?? process.env.MULTIPLAYER_ALLOWED_ORIGINS);
  const maxConnections = options.maxConnections ?? MAX_CONNECTIONS;
  const httpServer = http.createServer((request, response) => {
    if (request.url === '/' || request.url === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok', service: 'imposter-india-relay', activeRooms: registry.rooms.size }));
      return;
    }
    response.writeHead(404, { 'Content-Type': 'text/plain' });
    response.end('Not Found');
  });

  const webSocketServer = new WebSocketServer({
    server: httpServer,
    maxPayload: 2048,
    perMessageDeflate: false,
    verifyClient: ({ origin }, done) => {
      if (allowedOrigins && (!origin || !allowedOrigins.has(origin))) {
        done(false, 403, 'Origin not allowed');
        return;
      }
      if (webSocketServer.clients.size >= maxConnections) {
        done(false, 503, 'Relay is at capacity');
        return;
      }
      done(true);
    },
  });
  const messageWindows = new WeakMap();

  webSocketServer.on('connection', (socket) => {
    messageWindows.set(socket, { startedAt: Date.now(), count: 0 });

    socket.on('message', (data, isBinary) => {
      const windowState = messageWindows.get(socket);
      const now = Date.now();
      if (now - windowState.startedAt >= RATE_LIMIT_WINDOW_MS) {
        windowState.startedAt = now;
        windowState.count = 0;
      }
      windowState.count += 1;
      if (windowState.count > MAX_MESSAGES_PER_WINDOW) {
        safeSend(socket, { type: 'ERROR', message: 'Too many messages. Wait a moment and try again.' });
        socket.close(1008, 'Message rate exceeded');
        return;
      }
      if (isBinary) {
        safeSend(socket, { type: 'ERROR', message: 'Only text protocol messages are accepted.' });
        return;
      }

      let message;
      try {
        message = JSON.parse(data.toString());
      } catch {
        safeSend(socket, { type: 'ERROR', message: 'Malformed JSON payload.' });
        return;
      }
      if (!message || typeof message !== 'object' || Array.isArray(message) || typeof message.type !== 'string') {
        safeSend(socket, { type: 'ERROR', message: 'Invalid message structure.' });
        return;
      }

      if (message.type === 'CREATE_ROOM' || message.type === 'JOIN_ROOM') {
        const fields = parseParticipantFields(message);
        if (!fields) {
          safeSend(socket, { type: 'JOIN_ERROR', reason: 'Room code, participant ID, and name are required.' });
          return;
        }
        if (message.type === 'CREATE_ROOM' && registry.rooms.size >= MAX_ACTIVE_ROOMS) {
          safeSend(socket, { type: 'JOIN_ERROR', reason: 'The relay is full. Please try again later.' });
          return;
        }
        const result = message.type === 'CREATE_ROOM'
          ? registry.create(socket, fields)
          : registry.join(socket, fields);
        if (result.error) {
          safeSend(socket, { type: 'JOIN_ERROR', reason: result.error });
          return;
        }
        safeSend(socket, {
          type: 'ROOM_JOINED',
          roomCode: result.roomCode,
          participantId: result.participant.id,
          isHost: result.participant.isHost,
          participants: result.participants,
        });
        if (message.type === 'JOIN_ROOM') {
          const room = registry.rooms.get(result.roomCode).members;
          broadcast(room, { type: 'PARTICIPANT_JOINED', participant: result.participant }, socket);
        }
        return;
      }

      if (message.type === 'LEAVE_ROOM') {
        const roomCode = parseRoomCode(message.roomCode);
        const participantId = sanitizeString(message.participantId, 40);
        const result = roomCode && participantId
          ? registry.leave(socket, roomCode, participantId, 'left')
          : null;
        if (!result) {
          safeSend(socket, { type: 'ERROR', message: 'Invalid room leave action.' });
          return;
        }
        notifyDeparture(result);
        safeSend(socket, { type: 'PONG', timestamp: Date.now() });
        return;
      }

      if (message.type === 'SEND_TEST_MESSAGE') {
        const roomCode = parseRoomCode(message.roomCode);
        const participantId = sanitizeString(message.participantId, 40);
        const text = sanitizeString(message.text, MAX_TEXT_LENGTH);
        if (!roomCode || !participantId || !text) {
          safeSend(socket, { type: 'ERROR', message: 'Invalid test message.' });
          return;
        }
        const sender = registry.getParticipant(socket, roomCode, participantId);
        const room = registry.rooms.get(roomCode);
        if (!sender || !room) {
          safeSend(socket, { type: 'ERROR', message: 'Not an active member of this room.' });
          return;
        }
        const testMessage = {
          id: `msg-${randomUUID()}`,
          senderId: sender.id,
          senderName: sender.name,
          text,
          timestamp: Date.now(),
        };
        broadcast(room.members, { type: 'TEST_MESSAGE_RECEIVED', message: testMessage });
        return;
      }

      if (message.type === 'PING') {
        const timestamp = typeof message.timestamp === 'number' && Number.isFinite(message.timestamp)
          ? message.timestamp
          : Date.now();
        safeSend(socket, { type: 'PONG', timestamp });
        return;
      }

      safeSend(socket, { type: 'ERROR', message: 'Unknown protocol message.' });
    });

    socket.on('close', () => notifyDeparture(registry.removeSocket(socket)));
    socket.on('error', () => notifyDeparture(registry.removeSocket(socket, 'error')));
  });

  const cleanupTimer = setInterval(() => registry.clearExpired(Date.now(), ROOM_MAX_AGE_MS), 30 * 60 * 1000);
  cleanupTimer.unref();

  return {
    httpServer,
    webSocketServer,
    registry,
    close() {
      clearInterval(cleanupTimer);
      for (const socket of webSocketServer.clients) socket.terminate();
      return Promise.all([
        new Promise((resolveClose) => webSocketServer.close(resolveClose)),
        new Promise((resolveClose) => {
          if (httpServer.listening) httpServer.close(resolveClose);
          else resolveClose();
        }),
      ]).then(() => undefined);
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const port = Number(process.env.PORT) || 3001;
  const relay = createRelayServer();
  relay.httpServer.listen(port, '0.0.0.0', () => {
    console.log(`[imposter-india-relay] WebSocket server listening on 0.0.0.0:${port}`);
  });
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    relay.close().catch(() => {
      process.exitCode = 1;
    });
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
