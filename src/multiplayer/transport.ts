import type { ClientMessage, ConnectionStatus, ServerMessage } from './protocol';

export type StatusListener = (status: ConnectionStatus, error?: string) => void;
export type MessageListener = (message: ServerMessage) => void;

/**
 * Common abstraction for connection transport.
 * Allows interchangeable use of real WebSockets and deterministic in-memory mock transports.
 */
export interface MultiplayerTransport {
  connect(url: string): Promise<void>;
  disconnect(): void;
  send(message: ClientMessage): void;
  onMessage(listener: MessageListener): () => void;
  onStatusChange(listener: StatusListener): () => void;
  getStatus(): ConnectionStatus;
}
