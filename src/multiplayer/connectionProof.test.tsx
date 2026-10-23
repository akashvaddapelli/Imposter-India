import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConnectionProofView } from './ConnectionProofView';
import { MockRelayHub, MockTransport } from './mockTransport';
import { useConnectionProof } from './useConnectionProof';

let hub: MockRelayHub;

beforeEach(() => {
  hub = new MockRelayHub();
});

afterEach(() => {
  cleanup();
  hub.reset();
});

describe('Multiplayer Connection Proof: Hook and Transport Integration', () => {
  it('host can create a room, and a peer can join using the room code', async () => {
    const hostTransport = new MockTransport(hub);
    const peerTransport = new MockTransport(hub);

    const { result: host } = renderHook(() =>
      useConnectionProof({ transport: hostTransport, initialParticipantId: 'p-host-1' })
    );
    const { result: peer } = renderHook(() =>
      useConnectionProof({ transport: peerTransport, initialParticipantId: 'p-peer-2' })
    );

    // Host creates room
    await act(async () => {
      await host.current.createRoom('Host Ramesh');
    });

    expect(host.current.status).toBe('connected');
    expect(host.current.isHost).toBe(true);
    expect(host.current.roomCode).toMatch(/^INDIA-/);
    expect(host.current.participants).toHaveLength(1);
    expect(host.current.participants[0].name).toBe('Host Ramesh');

    const generatedCode = host.current.roomCode;

    // Peer joins room
    await act(async () => {
      await peer.current.joinRoom(generatedCode, 'Friend Priya');
    });

    // Wait for in-memory dispatch
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(peer.current.status).toBe('connected');
    expect(peer.current.isHost).toBe(false);
    expect(peer.current.roomCode).toBe(generatedCode);
    expect(peer.current.participants).toHaveLength(2);

    // Host also sees the updated participants list
    expect(host.current.participants).toHaveLength(2);
    expect(host.current.participants.map((p) => p.name)).toEqual(['Host Ramesh', 'Friend Priya']);
  });

  it('participants can exchange harmless test messages in real-time', async () => {
    const hostTransport = new MockTransport(hub);
    const peerTransport = new MockTransport(hub);

    const { result: host } = renderHook(() =>
      useConnectionProof({ transport: hostTransport, initialParticipantId: 'p-host-1' })
    );
    const { result: peer } = renderHook(() =>
      useConnectionProof({ transport: peerTransport, initialParticipantId: 'p-peer-2' })
    );

    await act(async () => {
      await host.current.createRoom('Host Ramesh');
    });
    const code = host.current.roomCode;

    await act(async () => {
      await peer.current.joinRoom(code, 'Friend Priya');
    });

    // Peer sends a harmless test message
    await act(async () => {
      peer.current.sendTestMessage('Namaste from device 2!');
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(peer.current.messages).toHaveLength(1);
    expect(peer.current.messages[0].text).toBe('Namaste from device 2!');
    expect(peer.current.messages[0].senderName).toBe('Friend Priya');

    // Host receives the message as well
    expect(host.current.messages).toHaveLength(1);
    expect(host.current.messages[0].text).toBe('Namaste from device 2!');
  });

  it('handles explicit leave gracefully and notifies remaining participants', async () => {
    const hostTransport = new MockTransport(hub);
    const peerTransport = new MockTransport(hub);

    const { result: host } = renderHook(() =>
      useConnectionProof({ transport: hostTransport, initialParticipantId: 'p-host-1' })
    );
    const { result: peer } = renderHook(() =>
      useConnectionProof({ transport: peerTransport, initialParticipantId: 'p-peer-2' })
    );

    await act(async () => {
      await host.current.createRoom('Host');
      await peer.current.joinRoom(host.current.roomCode, 'Guest');
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(host.current.participants).toHaveLength(2);

    // Peer explicitly leaves
    await act(async () => {
      peer.current.leaveRoom();
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(peer.current.roomCode).toBe('');
    expect(peer.current.participants).toHaveLength(0);

    // Host should now have 1 participant remaining
    expect(host.current.participants).toHaveLength(1);
    expect(host.current.participants[0].name).toBe('Host');
  });

  it('reports connection error when connecting to an unreachable endpoint', async () => {
    const failingTransport = new MockTransport(hub);
    const { result } = renderHook(() =>
      useConnectionProof({ transport: failingTransport, defaultServerUrl: 'ws://fail-to-connect' })
    );

    await act(async () => {
      await result.current.createRoom('Player');
    });

    expect(result.current.status).toBe('error');
    expect(result.current.errorMessage).toMatch(/failed/i);
  });
});

describe('Multiplayer Connection Proof: Component View', () => {
  it('renders initial setup view with accessible form fields and 44px buttons', () => {
    const testTransport = new MockTransport(hub);
    const { result } = renderHook(() => useConnectionProof({ transport: testTransport }));

    render(<ConnectionProofView hook={result.current} />);

    expect(screen.getByText('Mode B Connection Proof')).toBeTruthy();
    expect(screen.getByLabelText('Your display name')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Host Test Room/i })).toBeTruthy();
    expect(screen.getByLabelText('Room code to join')).toBeTruthy();
  });

  it('renders active room view after creating room, with message input and copy button', async () => {
    const testTransport = new MockTransport(hub);
    const { result } = renderHook(() => useConnectionProof({ transport: testTransport }));

    const view = render(<ConnectionProofView hook={result.current} />);

    await act(async () => {
      await result.current.createRoom('Ananth');
      await new Promise((r) => setTimeout(r, 20));
    });

    view.rerender(<ConnectionProofView hook={result.current} />);

    expect(screen.getByText('ACTIVE TEST ROOM')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Copy room code/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Leave test room/i })).toBeTruthy();
    expect(screen.getByLabelText('Type a test message')).toBeTruthy();
  });

  it('allows typing and sending a test message', async () => {
    const testTransport = new MockTransport(hub);
    const { result } = renderHook(() => useConnectionProof({ transport: testTransport }));

    const view = render(<ConnectionProofView hook={result.current} />);

    await act(async () => {
      await result.current.createRoom('Ananth');
      await new Promise((r) => setTimeout(r, 20));
    });
    view.rerender(<ConnectionProofView hook={result.current} />);

    const input = screen.getByLabelText('Type a test message');
    fireEvent.change(input, { target: { value: 'Testing 1 2 3' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Send test message/i }));
      await new Promise((r) => setTimeout(r, 20));
    });
    view.rerender(<ConnectionProofView hook={result.current} />);

    expect(screen.getByText('Testing 1 2 3')).toBeTruthy();
  });
});
