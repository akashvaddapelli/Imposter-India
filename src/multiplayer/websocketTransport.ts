import {
  type ClientMessage,
  type ConnectionStatus,
  type ServerMessage,
  validateServerMessage,
} from './protocol';
import type { MessageListener, MultiplayerTransport, StatusListener } from './transport';

export class WebSocketTransport implements MultiplayerTransport {
  private socket: WebSocket | null = null;
  private status: ConnectionStatus = 'disconnected';
  private statusListeners = new Set<StatusListener>();
  private messageListeners = new Set<MessageListener>();
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private isExplicitDisconnect = false;

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
    if (this.status === status && !error) return;
    this.status = status;
    for (const listener of this.statusListeners) {
      try {
        listener(status, error);
      } catch {
        // Prevent listener crashes from breaking transport loop
      }
    }
  }

  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.disconnect();
      this.isExplicitDisconnect = false;
      this.setStatus('connecting');

      try {
        const ws = new WebSocket(url);
        this.socket = ws;

        let opened = false;

        ws.onopen = () => {
          opened = true;
          this.setStatus('connected');
          this.startHeartbeat();
          resolve();
        };

        ws.onmessage = (event) => {
          try {
            const raw = typeof event.data === 'string' ? JSON.parse(event.data) : null;
            const valid = validateServerMessage(raw);
            if (!valid) return;

            for (const listener of this.messageListeners) {
              try {
                listener(valid);
              } catch {
                // Ignore listener exceptions
              }
            }
          } catch {
            // Drop invalid non-JSON payloads
          }
        };

        ws.onerror = () => {
          const errMessage = opened ? 'WebSocket connection error.' : 'Failed to connect to relay server.';
          this.setStatus('error', errMessage);
          if (!opened) reject(new Error(errMessage));
        };

        ws.onclose = () => {
          this.stopHeartbeat();
          this.socket = null;
          if (!this.isExplicitDisconnect) {
            this.setStatus('disconnected', 'Connection closed unexpectedly.');
          } else {
            this.setStatus('disconnected');
          }
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Invalid connection URL.';
        this.setStatus('error', msg);
        reject(new Error(msg));
      }
    });
  }

  send(message: ClientMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('Cannot send message: transport is not connected.');
    }
    this.socket.send(JSON.stringify(message));
  }

  disconnect(): void {
    this.isExplicitDisconnect = true;
    this.stopHeartbeat();
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // Ignore close errors
      }
      this.socket = null;
    }
    this.setStatus('disconnected');
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        try {
          this.send({ type: 'PING', timestamp: Date.now() });
        } catch {
          // Socket might have closed
        }
      }
    }, 15000);
  }

  private stopHeartbeat(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
}
