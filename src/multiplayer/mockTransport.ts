import {
  type ClientMessage,
  type ConnectionStatus,
  type Participant,
  type ServerMessage,
  validateClientMessage,
} from './protocol';
import type { MessageListener, MultiplayerTransport, StatusListener } from './transport';

type RoomParticipant = {
  participant: Participant;
  transport: MockTransport;
};

/**
 * Shared in-memory hub to simulate a relay server between multiple MockTransport clients.
 */
export class MockRelayHub {
  private rooms = new Map<string, RoomParticipant[]>();

  reset(): void {
    this.rooms.clear();
  }

  handleClientMessage(transport: MockTransport, msg: ClientMessage): void {
    const valid = validateClientMessage(msg);
    if (!valid) {
      transport.deliverServerMessage({ type: 'ERROR', message: 'Malformed client message.' });
      return;
    }

    if (valid.type === 'JOIN_ROOM') {
      const { roomCode, participantId, participantName } = valid;
      const room = this.rooms.get(roomCode) ?? [];
      const isHost = room.length === 0;

      const newParticipant: Participant = {
        id: participantId,
        name: participantName,
        isHost,
        joinedAt: Date.now(),
      };

      // Add to room
      room.push({ participant: newParticipant, transport });
      this.rooms.set(roomCode, room);

      // Confirm to joiner
      transport.deliverServerMessage({
        type: 'ROOM_JOINED',
        roomCode,
        participantId,
        isHost,
        participants: room.map((r) => r.participant),
      });

      // Broadcast to other participants
      for (const p of room) {
        if (p.participant.id !== participantId) {
          p.transport.deliverServerMessage({
            type: 'PARTICIPANT_JOINED',
            participant: newParticipant,
          });
        }
      }
      return;
    }

    if (valid.type === 'LEAVE_ROOM') {
      this.removeParticipant(transport, valid.roomCode, valid.participantId, 'left');
      return;
    }

    if (valid.type === 'SEND_TEST_MESSAGE') {
      const room = this.rooms.get(valid.roomCode);
      if (!room) {
        transport.deliverServerMessage({ type: 'ERROR', message: 'Room not found.' });
        return;
      }

      const sender = room.find((r) => r.participant.id === valid.participantId);
      if (!sender) {
        transport.deliverServerMessage({ type: 'ERROR', message: 'Not a member of this room.' });
        return;
      }

      const testMsg = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        senderId: valid.participantId,
        senderName: sender.participant.name,
        text: valid.text,
        timestamp: Date.now(),
      };

      // Broadcast to all room members
      for (const p of room) {
        p.transport.deliverServerMessage({
          type: 'TEST_MESSAGE_RECEIVED',
          message: testMsg,
        });
      }
      return;
    }

    if (valid.type === 'PING') {
      transport.deliverServerMessage({ type: 'PONG', timestamp: valid.timestamp });
    }
  }

  removeParticipant(
    transport: MockTransport,
    roomCode: string,
    participantId: string,
    reason?: string
  ): void {
    const room = this.rooms.get(roomCode);
    if (!room) return;

    const remaining = room.filter((r) => r.participant.id !== participantId);
    if (remaining.length === 0) {
      this.rooms.delete(roomCode);
    } else {
      this.rooms.set(roomCode, remaining);
      for (const p of remaining) {
        p.transport.deliverServerMessage({
          type: 'PARTICIPANT_LEFT',
          participantId,
          reason,
        });
      }
    }
  }

  handleDisconnect(transport: MockTransport): void {
    for (const [code, members] of this.rooms.entries()) {
      const found = members.find((m) => m.transport === transport);
      if (found) {
        this.removeParticipant(transport, code, found.participant.id, 'disconnected');
      }
    }
  }
}

// Global default mock hub for integration testing
export const defaultMockHub = new MockRelayHub();

export class MockTransport implements MultiplayerTransport {
  private status: ConnectionStatus = 'disconnected';
  private statusListeners = new Set<StatusListener>();
  private messageListeners = new Set<MessageListener>();
  private hub: MockRelayHub;

  constructor(hub: MockRelayHub = defaultMockHub) {
    this.hub = hub;
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  onMessage(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  private setStatus(status: ConnectionStatus, error?: string): void {
    this.status = status;
    for (const listener of this.statusListeners) {
      listener(status, error);
    }
  }

  async connect(url: string): Promise<void> {
    if (url.includes('fail-to-connect')) {
      this.setStatus('error', 'Mock connection failed.');
      throw new Error('Mock connection failed.');
    }
    this.setStatus('connecting');
    // Microtask delay to emulate async connection handshake
    await new Promise((r) => setTimeout(r, 10));
    this.setStatus('connected');
  }

  send(message: ClientMessage): void {
    if (this.status !== 'connected') {
      throw new Error('Cannot send: not connected.');
    }
    // Asynchronous delivery to emulate network packet transmission
    setTimeout(() => {
      this.hub.handleClientMessage(this, message);
    }, 5);
  }

  deliverServerMessage(message: ServerMessage): void {
    for (const listener of this.messageListeners) {
      listener(message);
    }
  }

  disconnect(): void {
    this.hub.handleDisconnect(this);
    this.setStatus('disconnected');
  }
}
