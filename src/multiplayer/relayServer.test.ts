// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createRelayServer } from '../../server/server.mjs';

let relay: ReturnType<typeof createRelayServer> | undefined;
let clients: WebSocket[] = [];

function waitForMessage(socket: WebSocket, type: string): Promise<Record<string, unknown>> {
  return new Promise((resolveMessage, rejectMessage) => {
    const timeout = setTimeout(() => rejectMessage(new Error(`Timed out waiting for ${type}.`)), 3000);
    const onMessage = (data: WebSocket.RawData) => {
      const message = JSON.parse(data.toString()) as Record<string, unknown>;
      if (message.type !== type) return;
      clearTimeout(timeout);
      socket.off('message', onMessage);
      resolveMessage(message);
    };
    socket.on('message', onMessage);
  });
}

async function connectClient(url: string): Promise<WebSocket> {
  const socket = new WebSocket(url);
  clients.push(socket);
  await new Promise<void>((resolveOpen, rejectOpen) => {
    socket.once('open', resolveOpen);
    socket.once('error', rejectOpen);
  });
  return socket;
}

function send(socket: WebSocket, message: Record<string, unknown>) {
  socket.send(JSON.stringify(message));
}

beforeEach(async () => {
  relay = createRelayServer();
  await new Promise<void>((resolveListen) => relay?.httpServer.listen(0, '127.0.0.1', resolveListen));
});

afterEach(async () => {
  await relay?.close();
  relay = undefined;
  clients = [];
});

describe('WebSocket relay integration', () => {
  it('rejects browser origins outside the configured allowlist', async () => {
    await relay?.close();
    relay = createRelayServer({ allowedOrigins: ['https://game.example'] });
    await new Promise<void>((resolveListen) => relay?.httpServer.listen(0, '127.0.0.1', resolveListen));

    const address = relay?.httpServer.address();
    if (!address || typeof address === 'string') throw new Error('Relay did not bind to a TCP port.');
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}`, { origin: 'https://untrusted.example' });
    clients.push(socket);
    const response = await new Promise<number>((resolveResponse, rejectResponse) => {
      socket.once('unexpected-response', (_request, result) => resolveResponse(result.statusCode ?? 0));
      socket.once('open', () => rejectResponse(new Error('Unexpected origin was accepted.')));
      socket.once('error', () => undefined);
    });

    expect(response).toBe(403);
    socket.terminate();
  });

  it('creates, joins, rejects invalid room actions, relays messages, and transfers host on disconnect', async () => {
    const address = relay?.httpServer.address();
    if (!address || typeof address === 'string') throw new Error('Relay did not bind to a TCP port.');
    const url = `ws://127.0.0.1:${address.port}`;
    const host = await connectClient(url);
    const guest = await connectClient(url);
    const roomCode = 'INDIA-ABC234';

    const hostJoined = waitForMessage(host, 'ROOM_JOINED');
    send(host, { type: 'CREATE_ROOM', roomCode, participantId: 'p-host', participantName: 'Host' });
    expect(await hostJoined).toMatchObject({ type: 'ROOM_JOINED', roomCode, isHost: true });

    const guestJoined = waitForMessage(guest, 'ROOM_JOINED');
    const hostSeesGuest = waitForMessage(host, 'PARTICIPANT_JOINED');
    send(guest, { type: 'JOIN_ROOM', roomCode, participantId: 'p-guest', participantName: 'Guest' });
    expect(await guestJoined).toMatchObject({ type: 'ROOM_JOINED', isHost: false });
    expect(await hostSeesGuest).toMatchObject({ participant: { id: 'p-guest', name: 'Guest' } });

    const hostReceivesTest = waitForMessage(host, 'TEST_MESSAGE_RECEIVED');
    const guestReceivesTest = waitForMessage(guest, 'TEST_MESSAGE_RECEIVED');
    send(guest, { type: 'SEND_TEST_MESSAGE', roomCode, participantId: 'p-guest', text: 'Hello from a test client.' });
    expect(await hostReceivesTest).toMatchObject({ message: { senderId: 'p-guest', text: 'Hello from a test client.' } });
    expect(await guestReceivesTest).toMatchObject({ message: { senderId: 'p-guest', text: 'Hello from a test client.' } });

    const rejectedJoin = waitForMessage(guest, 'JOIN_ERROR');
    send(guest, { type: 'JOIN_ROOM', roomCode: 'INDIA-OTHER', participantId: 'p-elsewhere', participantName: 'Elsewhere' });
    expect(await rejectedJoin).toMatchObject({ type: 'JOIN_ERROR' });

    const guestLeft = waitForMessage(guest, 'PARTICIPANT_LEFT');
    const newHost = waitForMessage(guest, 'HOST_CHANGED');
    host.close();
    await expect(guestLeft).resolves.toMatchObject({ participantId: 'p-host', reason: 'disconnected' });
    await expect(newHost).resolves.toMatchObject({ participantId: 'p-guest' });
  });
});
