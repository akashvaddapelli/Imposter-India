import { useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  Crown,
  Info,
  LogOut,
  Radio,
  Send,
  ShieldCheck,
  Smartphone,
  Users,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react';
import { useConnectionProof } from './useConnectionProof';

export type ConnectionProofViewProps = {
  hook?: ReturnType<typeof useConnectionProof>;
};

export function ConnectionProofView({ hook: externalHook }: ConnectionProofViewProps) {
  const internalHook = useConnectionProof();
  const hook = externalHook || internalHook;

  const {
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
  } = hook;

  const [inputCode, setInputCode] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  const handleCopyCode = () => {
    if (!roomCode) return;
    navigator.clipboard?.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!chatInput.trim()) return;
    sendTestMessage(chatInput);
    setChatInput('');
  };

  return (
    <div className="connection-proof-container">
      {/* Scope and safety disclaimer */}
      <div className="proof-banner" role="status">
        <ShieldCheck size={20} className="proof-banner-icon" />
        <div>
          <b>Mode B Connection Proof</b>
          <p>
            Isolated multi-device communication test. Secret words and player roles are not
            transmitted in this proof.
          </p>
        </div>
      </div>

      {/* Connection status badge */}
      <div className="connection-topline">
        <div className={`status-pill status-${status}`}>
          {status === 'connected' ? (
            <Wifi size={14} />
          ) : status === 'connecting' ? (
            <Radio size={14} className="pulse" />
          ) : (
            <WifiOff size={14} />
          )}
          <span>
            {status === 'connected'
              ? 'Relay Connected'
              : status === 'connecting'
              ? 'Connecting to Relay…'
              : status === 'error'
              ? 'Connection Error'
              : 'Disconnected'}
          </span>
        </div>

        <button
          className="text-link config-toggle"
          onClick={() => setShowConfig((v) => !v)}
          aria-expanded={showConfig}
        >
          {showConfig ? 'Hide server settings' : 'Server settings'}
        </button>
      </div>

      {/* Optional server endpoint configuration */}
      {showConfig && (
        <div className="panel server-config-panel">
          <label className="field-label">
            RELAY SERVER WEBSOCKET ENDPOINT
            <input
              aria-label="Relay server endpoint"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="ws://localhost:3001"
              disabled={status === 'connected'}
            />
          </label>
          <small className="config-hint">
            To connect phones on the same Wi-Fi, use your computer&apos;s LAN IP (e.g.{' '}
            <code>ws://192.168.1.5:3001</code>). For cross-network internet play, deploy{' '}
            <code>server/server.mjs</code> to a hosted WebSocket service.
          </small>
        </div>
      )}

      {/* Error display */}
      {errorMessage && (
        <div className="proof-error" role="alert">
          <XCircle size={18} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Screen 1: Not in a room */}
      {!roomCode ? (
        <div className="panel proof-entry-panel">
          <div className="section-heading">
            <div>
              <h3>
                <Smartphone size={17} /> Device Setup
              </h3>
              <p>Choose your name and create or join a test room.</p>
            </div>
            <span className="selection-count">Your ID: {participantId.slice(0, 10)}</span>
          </div>

          <label className="field-label">
            YOUR DISPLAY NAME
            <input
              aria-label="Your display name"
              value={participantName}
              maxLength={24}
              onChange={(e) => setParticipantName(e.target.value)}
              placeholder="e.g. Ramesh"
            />
          </label>

          <div className="proof-action-grid">
            <div className="proof-action-card">
              <h4>Create a new test room</h4>
              <p>Generates a room code to share with other devices.</p>
              <button
                className="btn btn-primary btn-md full-width"
                onClick={() => createRoom(participantName)}
                disabled={status === 'connecting'}
              >
                <Crown size={16} /> Host Test Room <ArrowRight size={15} />
              </button>
            </div>

            <div className="proof-action-card">
              <h4>Join an existing test room</h4>
              <p>Enter the code displayed on the host device.</p>
              <div className="join-code-row">
                <input
                  aria-label="Room code to join"
                  value={inputCode}
                  maxLength={12}
                  onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                  placeholder="e.g. INDIA-7K2"
                />
                <button
                  className="btn btn-secondary btn-md"
                  onClick={() => joinRoom(inputCode, participantName)}
                  disabled={status === 'connecting' || !inputCode.trim()}
                >
                  Join
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Screen 2: In active test room */
        <div className="panel proof-room-panel">
          <div className="room-header">
            <div>
              <span className="eyebrow">ACTIVE TEST ROOM</span>
              <h2 className="room-code-display">{roomCode}</h2>
            </div>
            <div className="room-header-actions">
              <button
                className="btn btn-outline btn-sm"
                onClick={handleCopyCode}
                aria-label="Copy room code"
              >
                {copied ? <CheckCircle2 size={15} /> : <Copy size={15} />}
                {copied ? 'Copied!' : 'Copy Code'}
              </button>
              <button
                className="btn btn-outline btn-sm leave-btn"
                onClick={leaveRoom}
                aria-label="Leave test room"
              >
                <LogOut size={15} /> Leave
              </button>
            </div>
          </div>

          {/* Connected participants list */}
          <section className="room-participants">
            <div className="section-heading">
              <div>
                <h3>
                  <Users size={16} /> Connected Devices ({participants.length})
                </h3>
                <p>Real-time membership across all connected clients.</p>
              </div>
              {isHost && <span className="selection-count">You are Host</span>}
            </div>

            <div className="participant-chips">
              {participants.map((p, idx) => {
                const isMe = p.id === participantId;
                return (
                  <div key={p.id} className={`participant-chip ${isMe ? 'is-self' : ''}`}>
                    <span className={`player-avatar avatar-${idx % 6}`}>
                      {p.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="participant-info">
                      <b>
                        {p.name} {isMe ? '(You)' : ''}
                      </b>
                      <small>{p.isHost ? 'Host' : 'Participant'}</small>
                    </span>
                    {p.isHost && <Crown size={14} className="host-icon" />}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Harmless test message exchange */}
          <section className="room-chat">
            <div className="section-heading">
              <div>
                <h3>Test Message Stream</h3>
                <p>Send a harmless message to verify real-time packet exchange.</p>
              </div>
            </div>

            <div
              className="chat-stream"
              role="log"
              aria-label="Test messages"
              aria-live="polite"
            >
              {messages.length === 0 ? (
                <div className="chat-empty">
                  <Info size={18} />
                  <span>No test messages exchanged yet. Send one below!</span>
                </div>
              ) : (
                messages.map((m) => {
                  const isMine = m.senderId === participantId;
                  const time = new Date(m.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  });
                  return (
                    <div
                      key={m.id}
                      className={`chat-message ${isMine ? 'chat-mine' : 'chat-theirs'}`}
                    >
                      <div className="chat-meta">
                        <b>{m.senderName}</b>
                        <small>{time}</small>
                      </div>
                      <p className="chat-text">{m.text}</p>
                    </div>
                  );
                })
              )}
            </div>

            <form className="chat-form" onSubmit={handleSend}>
              <input
                aria-label="Type a test message"
                value={chatInput}
                maxLength={140}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Type a test message (e.g. Hello from Device 2!)"
              />
              <button
                type="submit"
                className="btn btn-primary btn-md"
                disabled={!chatInput.trim()}
                aria-label="Send test message"
              >
                <Send size={15} /> Send
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
