import type { RoomRegistry } from './roomRegistry.mjs';

export function createRelayServer(options?: {
  allowedOrigins?: string | string[];
  maxConnections?: number;
}): {
  httpServer: {
    listen(port: number, host: string, callback: () => void): void;
    address(): { port: number } | string | null;
    close(callback?: () => void): void;
    listening: boolean;
  };
  webSocketServer: { clients: Set<{ terminate(): void }> };
  registry: RoomRegistry;
  close(): Promise<void>;
};
