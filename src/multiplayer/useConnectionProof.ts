import { useEffect, useRef, useState, useCallback } from 'react';
import {
  type ConnectionStatus,
  type Participant,
  type ServerMessage,
  type TestMessage,
  generateParticipantId,
  generateRoomCode,
  normalizeRoomCode,
  sanitizeString,
} from './protocol';
import type { MultiplayerTransport } from './transport';
import { WebSocketTransport } from './websocketTransport';

export const DEFAULT_SERVER_PORT = 3001;

export function resolveDefaultServerUrl(): string {
  // Configured env variable takes precedence if available
  const envUrl = import.meta.env.VITE_MULTIPLAYER_SERVER_URL;
  if (typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.trim();
  }

  if (typeof window !== 'undefined' && window.location) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname || 'localhost';
    return `${protocol}//${host}:${DEFAULT_SERVER_PORT}`;
  }

  return `ws://localhost:${DEFAULT_SERVER_PORT}`;
}

export type UseConnectionProofOptions = {
  transport?: MultiplayerTransport;
  initialParticipantId?: string;
  defaultServerUrl?: string;
};

export function useConnectionProof(options: UseConnectionProofOptions = {}) {
  const [transport] = useState<MultiplayerTransport>(
    () => options.transport ?? new WebSocketTransport()
  );

  const [participantId] = useState<string>(
    () => options.initialParticipantId || generateParticipantId()
  );
  const [participantName, setParticipantName] = useState<string>('Player');
  const [roomCode, setRoomCode] = useState<string>('');
  const [isHost, setIsHost] = useState<boolean>(false);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<TestMessage[]>([]);
  const [serverUrl, setServerUrl] = useState<string>(
    () => options.defaultServerUrl ?? resolveDefaultServerUrl()
  );

  // Keep ref to avoid stale closures in message handlers
  const roomCodeRef = useRef(roomCode);
  roomCodeRef.current = roomCode;

  const participantIdRef = useRef(participantId);
  participantIdRef.current = participantId;

  // Listen for status changes
  useEffect(() => {
    return transport.onStatusChange((newStatus, error) => {
      setStatus(newStatus);
      if (error) setErrorMessage(error);
      if (newStatus === 'disconnected') {
        setIsHost(false);
        setParticipants([]);
      }
    });
  }, [transport]);

  // Listen for server messages
  useEffect(() => {
    return transport.onMessage((msg: ServerMessage) => {
      if (msg.type === 'ROOM_JOINED') {
        setRoomCode(msg.roomCode);
        setIsHost(msg.isHost);
        setParticipants(msg.participants);
        setErrorMessage(null);
        return;
      }

      if (msg.type === 'JOIN_ERROR') {
        setErrorMessage(msg.reason);
        setStatus('error');
        return;
      }

      if (msg.type === 'PARTICIPANT_JOINED') {
        setParticipants((prev) => {
          if (prev.some((p) => p.id === msg.participant.id)) return prev;
          return [...prev, msg.participant];
        });
        return;
      }

      if (msg.type === 'PARTICIPANT_LEFT') {
        setParticipants((prev) => prev.filter((p) => p.id !== msg.participantId));
        return;
      }

      if (msg.type === 'HOST_CHANGED') {
        setParticipants((prev) => prev.map((p) => ({ ...p, isHost: p.id === msg.participantId })));
        setIsHost(msg.participantId === participantIdRef.current);
        return;
      }

      if (msg.type === 'TEST_MESSAGE_RECEIVED') {
        setMessages((prev) => [...prev, msg.message]);
        return;
      }

      if (msg.type === 'ERROR') {
        setErrorMessage(msg.message);
      }
    });
  }, [transport]);

  // Disconnect on unmount
  useEffect(() => {
    return () => {
      transport.disconnect();
    };
  }, [transport]);

  const createRoom = useCallback(
    async (name: string, customUrl?: string) => {
      const cleanName = sanitizeString(name, 24) || 'Host';
      setParticipantName(cleanName);
      setErrorMessage(null);
      setMessages([]);

      const targetUrl = customUrl || serverUrl;
      const newCode = generateRoomCode();

      try {
        if (transport.getStatus() !== 'connected') {
          await transport.connect(targetUrl);
        }

        transport.send({
          type: 'CREATE_ROOM',
          roomCode: newCode,
          participantId: participantIdRef.current,
          participantName: cleanName,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not create room.';
        setErrorMessage(msg);
      }
    },
    [serverUrl, transport]
  );

  const joinRoom = useCallback(
    async (code: string, name: string, customUrl?: string) => {
      const cleanCode = normalizeRoomCode(code);
      const cleanName = sanitizeString(name, 24) || 'Player';
      setParticipantName(cleanName);
      setErrorMessage(null);
      setMessages([]);

      if (!cleanCode) {
        setErrorMessage('Enter a valid room code.');
        return;
      }

      const targetUrl = customUrl || serverUrl;

      try {
        if (transport.getStatus() !== 'connected') {
          await transport.connect(targetUrl);
        }

        transport.send({
          type: 'JOIN_ROOM',
          roomCode: cleanCode,
          participantId: participantIdRef.current,
          participantName: cleanName,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not join room.';
        setErrorMessage(msg);
      }
    },
    [serverUrl, transport]
  );

  const sendTestMessage = useCallback(
    (text: string) => {
      const clean = sanitizeString(text, 140);
      if (!clean || !roomCodeRef.current) return;

      try {
        transport.send({
          type: 'SEND_TEST_MESSAGE',
          roomCode: roomCodeRef.current,
          participantId: participantIdRef.current,
          text: clean,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to send message.';
        setErrorMessage(msg);
      }
    },
    [transport]
  );

  const leaveRoom = useCallback(() => {
    if (roomCodeRef.current) {
      try {
        transport.send({
          type: 'LEAVE_ROOM',
          roomCode: roomCodeRef.current,
          participantId: participantIdRef.current,
        });
      } catch {
        // Ignore if transport was already closed
      }
    }
    transport.disconnect();
    setRoomCode('');
    setIsHost(false);
    setParticipants([]);
    setMessages([]);
    setErrorMessage(null);
  }, [transport]);

  return {
    participantId,
    participantName,
    setParticipantName,
    roomCode,
    isHost,
    status,
    errorMessage,
    participants,
    messages,
    serverUrl,
    setServerUrl,
    createRoom,
    joinRoom,
    sendTestMessage,
    leaveRoom,
  };
}
