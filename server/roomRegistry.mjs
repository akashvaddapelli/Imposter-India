export const MAX_ROOM_CAPACITY = 12;

export class RoomRegistry {
  rooms = new Map();
  memberships = new Map();

  create(socket, { roomCode, participantId, participantName }) {
    if (this.memberships.has(socket)) return { error: 'This connection is already in a room.' };
    if (this.rooms.has(roomCode)) return { error: 'That room code is already in use. Create another room.' };

    const participant = { id: participantId, name: participantName, isHost: true, joinedAt: Date.now() };
    const room = { createdAt: Date.now(), members: new Map([[socket, participant]]) };
    this.rooms.set(roomCode, room);
    this.memberships.set(socket, roomCode);
    return { roomCode, participant, participants: [participant] };
  }

  join(socket, { roomCode, participantId, participantName }) {
    if (this.memberships.has(socket)) return { error: 'This connection is already in a room.' };
    const room = this.rooms.get(roomCode);
    if (!room) return { error: 'Room not found. Check the code and try again.' };
    if (room.members.size >= MAX_ROOM_CAPACITY) return { error: `Room is full (max ${MAX_ROOM_CAPACITY} players).` };
    if ([...room.members.values()].some((participant) => participant.id === participantId)) {
      return { error: 'That participant is already in this room.' };
    }

    const participant = { id: participantId, name: participantName, isHost: false, joinedAt: Date.now() };
    room.members.set(socket, participant);
    this.memberships.set(socket, roomCode);
    return { roomCode, participant, participants: [...room.members.values()] };
  }

  getParticipant(socket, roomCode, participantId) {
    if (this.memberships.get(socket) !== roomCode) return null;
    const participant = this.rooms.get(roomCode)?.members.get(socket);
    return participant?.id === participantId ? participant : null;
  }

  leave(socket, roomCode, participantId, reason = 'left') {
    const participant = this.getParticipant(socket, roomCode, participantId);
    if (!participant) return null;
    const room = this.rooms.get(roomCode);
    room.members.delete(socket);
    this.memberships.delete(socket);

    let hostChanged = null;
    if (room.members.size === 0) {
      this.rooms.delete(roomCode);
    } else if (participant.isHost) {
      hostChanged = room.members.values().next().value;
      hostChanged.isHost = true;
    }
    return { participant, remaining: room.members, hostChanged, reason };
  }

  removeSocket(socket, reason = 'disconnected') {
    const roomCode = this.memberships.get(socket);
    if (!roomCode) return null;
    const participant = this.rooms.get(roomCode)?.members.get(socket);
    return participant ? this.leave(socket, roomCode, participant.id, reason) : null;
  }

  clearExpired(now = Date.now(), maxAgeMs = 4 * 60 * 60 * 1000) {
    for (const [roomCode, room] of this.rooms) {
      if (now - room.createdAt > maxAgeMs) {
        for (const socket of room.members.keys()) this.memberships.delete(socket);
        this.rooms.delete(roomCode);
      }
    }
  }
}
