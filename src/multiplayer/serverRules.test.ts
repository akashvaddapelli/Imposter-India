// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { MAX_ROOM_CAPACITY, RoomRegistry } from '../../server/roomRegistry.mjs';

const participant = (id: string, name = id) => ({ participantId: id, participantName: name });

describe('relay room and participant rules', () => {
  it('creates distinct rooms and only joins an existing room', () => {
    const registry = new RoomRegistry();
    const host = {};
    const guest = {};
    expect(registry.create(host, { ...participant('p-host'), roomCode: 'INDIA-ABC234' }).participant?.isHost).toBe(true);
    expect(registry.create({}, { ...participant('p-other'), roomCode: 'INDIA-ABC234' }).error).toMatch(/already in use/i);
    expect(registry.join(guest, { ...participant('p-guest'), roomCode: 'INDIA-MISSING' }).error).toMatch(/not found/i);
    expect(registry.join(guest, { ...participant('p-guest'), roomCode: 'INDIA-ABC234' }).participant?.isHost).toBe(false);
  });

  it('rejects duplicate participant IDs and a socket joining a second room', () => {
    const registry = new RoomRegistry();
    const host = {};
    const guest = {};
    registry.create(host, { ...participant('p-host'), roomCode: 'INDIA-ABC234' });
    registry.create({}, { ...participant('p-host'), roomCode: 'INDIA-DEF345' });
    expect(registry.join(guest, { ...participant('p-host'), roomCode: 'INDIA-ABC234' }).error).toMatch(/already in this room/i);
    expect(registry.join(guest, { ...participant('p-guest'), roomCode: 'INDIA-ABC234' }).participant?.id).toBe('p-guest');
    expect(registry.join(guest, { ...participant('p-guest'), roomCode: 'INDIA-DEF345' }).error).toMatch(/already in a room/i);
  });

  it('enforces room capacity and binds messages and leaves to the socket identity', () => {
    const registry = new RoomRegistry();
    const sockets = Array.from({ length: MAX_ROOM_CAPACITY }, () => ({}));
    registry.create(sockets[0], { ...participant('p-0'), roomCode: 'INDIA-ABC234' });
    for (let index = 1; index < sockets.length; index += 1) {
      expect(registry.join(sockets[index], { ...participant(`p-${index}`), roomCode: 'INDIA-ABC234' }).error).toBeUndefined();
    }
    expect(registry.join({}, { ...participant('p-full'), roomCode: 'INDIA-ABC234' }).error).toMatch(/full/i);
    expect(registry.getParticipant({}, 'INDIA-ABC234', 'p-0')).toBeNull();
    expect(registry.getParticipant(sockets[1], 'INDIA-ABC234', 'p-0')).toBeNull();
    expect(registry.leave(sockets[1], 'INDIA-ABC234', 'p-0')).toBeNull();
    expect(registry.getParticipant(sockets[1], 'INDIA-ABC234', 'p-1')?.id).toBe('p-1');
  });

  it('elects the oldest remaining participant as host and removes closed rooms', () => {
    const registry = new RoomRegistry();
    const host = {};
    const nextHost = {};
    registry.create(host, { ...participant('p-host'), roomCode: 'INDIA-ABC234' });
    registry.join(nextHost, { ...participant('p-next'), roomCode: 'INDIA-ABC234' });
    const departure = registry.leave(host, 'INDIA-ABC234', 'p-host');
    expect(departure?.hostChanged).toMatchObject({ id: 'p-next', isHost: true });
    expect(registry.leave(nextHost, 'INDIA-ABC234', 'p-next')?.remaining.size).toBe(0);
    expect(registry.rooms.has('INDIA-ABC234')).toBe(false);
  });
});
