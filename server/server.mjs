import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = Number(process.env.PORT) || 3001;
const MAX_ROOM_CAPACITY = 12;

/**
 * Sanitizes user-entered string: strips control characters, normalizes whitespace.
 */
function sanitizeString(val, maxLen = 140) {
  if (typeof val !== 'string') return '';
  return val
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function normalizeRoomCode(raw) {
  if (typeof raw !== 'string') return '';
  return raw.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12);
}

// In-memory room store: Map<roomCode, { createdAt: number, members: Map<WebSocket, Participant> }>
const rooms = new Map();

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        service: 'imposter-india-relay',
        activeRooms: rooms.size,
        timestamp: Date.now(),
      })
    );
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

const wss = new WebSocketServer({ server });

function safeSend(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      // Ignore socket send errors
    }
  }
}

function broadcastToRoom(roomCode, payload, excludeWs = null) {
  const room = rooms.get(roomCode);
  if (!room) return;
  for (const [memberWs] of room.members.entries()) {
    if (memberWs !== excludeWs) {
      safeSend(memberWs, payload);
    }
  }
}

function removeClientFromRoom(ws, reason = 'left') {
  for (const [code, room] of rooms.entries()) {
    const participant = room.members.get(ws);
    if (participant) {
      room.members.delete(ws);

      // If room is now empty, delete it
      if (room.members.size === 0) {
        rooms.delete(code);
      } else {
        // If the host left, assign host to the oldest remaining member
        if (participant.isHost) {
          const nextHost = room.members.values().next().value;
          if (nextHost) nextHost.isHost = true;
        }

        broadcastToRoom(code, {
          type: 'PARTICIPANT_LEFT',
          participantId: participant.id,
          reason,
        });
      }
      break;
    }
  }
}

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      safeSend(ws, { type: 'ERROR', message: 'Malformed JSON payload.' });
      return;
    }

    if (!msg || typeof msg !== 'object') {
      safeSend(ws, { type: 'ERROR', message: 'Invalid message structure.' });
      return;
    }

    const type = msg.type;

    if (type === 'JOIN_ROOM') {
      const roomCode = normalizeRoomCode(msg.roomCode);
      const participantId = sanitizeString(msg.participantId, 40);
      const participantName = sanitizeString(msg.participantName, 24);

      if (!roomCode || roomCode.length < 3) {
        safeSend(ws, { type: 'JOIN_ERROR', reason: 'Invalid room code.' });
        return;
      }

      if (!participantId || !participantName) {
        safeSend(ws, { type: 'JOIN_ERROR', reason: 'Participant name and ID required.' });
        return;
      }

      let room = rooms.get(roomCode);
      const isNewRoom = !room;

      if (!room) {
        room = { createdAt: Date.now(), members: new Map() };
        rooms.set(roomCode, room);
      }

      if (room.members.size >= MAX_ROOM_CAPACITY) {
        safeSend(ws, { type: 'JOIN_ERROR', reason: `Room is full (max ${MAX_ROOM_CAPACITY} players).` });
        return;
      }

      const isHost = isNewRoom || room.members.size === 0;
      const participant = {
        id: participantId,
        name: participantName,
        isHost,
        joinedAt: Date.now(),
      };

      room.members.set(ws, participant);

      // Send confirmation with current membership
      safeSend(ws, {
        type: 'ROOM_JOINED',
        roomCode,
        participantId,
        isHost,
        participants: Array.from(room.members.values()),
      });

      // Notify others in room
      broadcastToRoom(
        roomCode,
        {
          type: 'PARTICIPANT_JOINED',
          participant,
        },
        ws
      );

      return;
    }

    if (type === 'LEAVE_ROOM') {
      removeClientFromRoom(ws, 'left');
      safeSend(ws, { type: 'PONG', timestamp: Date.now() });
      return;
    }

    if (type === 'SEND_TEST_MESSAGE') {
      const roomCode = normalizeRoomCode(msg.roomCode);
      const participantId = sanitizeString(msg.participantId, 40);
      const text = sanitizeString(msg.text, 140);

      if (!roomCode || !participantId || !text) {
        safeSend(ws, { type: 'ERROR', message: 'Missing test message fields.' });
        return;
      }

      const room = rooms.get(roomCode);
      if (!room) {
        safeSend(ws, { type: 'ERROR', message: 'Room not found.' });
        return;
      }

      const sender = room.members.get(ws);
      if (!sender || sender.id !== participantId) {
        safeSend(ws, { type: 'ERROR', message: 'Not an active member of this room.' });
        return;
      }

      const testMsg = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        senderId: participantId,
        senderName: sender.name,
        text,
        timestamp: Date.now(),
      };

      broadcastToRoom(roomCode, {
        type: 'TEST_MESSAGE_RECEIVED',
        message: testMsg,
      });

      return;
    }

    if (type === 'PING') {
      safeSend(ws, { type: 'PONG', timestamp: typeof msg.timestamp === 'number' ? msg.timestamp : Date.now() });
      return;
    }

    safeSend(ws, { type: 'ERROR', message: `Unknown message type: "${String(type)}"` });
  });

  ws.on('close', () => {
    removeClientFromRoom(ws, 'disconnected');
  });

  ws.on('error', () => {
    removeClientFromRoom(ws, 'error');
  });
});

// Periodic cleanup: delete rooms older than 4 hours
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (now - room.createdAt > 4 * 60 * 60 * 1000) {
      rooms.delete(code);
    }
  }
}, 30 * 60 * 1000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[imposter-india-relay] WebSocket server listening on 0.0.0.0:${PORT}`);
});
