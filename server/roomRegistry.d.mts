export const MAX_ROOM_CAPACITY: number;

type Participant = { id: string; name: string; isHost: boolean; joinedAt: number };
type RoomResult = {
  error?: string;
  roomCode?: string;
  participant?: Participant;
  participants?: Participant[];
};

export class RoomRegistry {
  rooms: Map<string, { createdAt: number; members: Map<object, Participant> }>;
  memberships: Map<object, string>;
  create(socket: object, payload: { roomCode: string; participantId: string; participantName: string }): RoomResult;
  join(socket: object, payload: { roomCode: string; participantId: string; participantName: string }): RoomResult;
  getParticipant(socket: object, roomCode: string, participantId: string): Participant | null;
  leave(socket: object, roomCode: string, participantId: string, reason?: string): {
    participant: Participant;
    remaining: Map<object, Participant>;
    hostChanged: Participant | null;
    reason: string;
  } | null;
  removeSocket(socket: object, reason?: string): ReturnType<RoomRegistry['leave']>;
  clearExpired(now?: number, maxAgeMs?: number): void;
}
