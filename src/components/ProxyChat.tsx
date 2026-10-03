import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ConnectionManager } from '../network/ConnectionManager';

type ChatScope = 'all' | 'team' | 'proxy';

type ChatMessage = {
  id: string;
  playerId?: string;
  playerName?: string;
  message: string;
  timestamp: number;
  scope: ChatScope;
  deliveredByProxy?: boolean;
  effectiveScope?: 'all' | 'team';
};

interface ProxyChatProps {
  connectionManager: ConnectionManager;
  enabled: boolean;
  playerType: 'merc' | 'jackalope';
}

const labelForScope = (scope: ChatScope) => {
  if (scope === 'team') return 'TEAM';
  if (scope === 'proxy') return 'PROXY';
  return 'ALL';
};

export const ProxyChat: React.FC<ProxyChatProps> = ({ connectionManager, enabled, playerType }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [scope, setScope] = useState<ChatScope>('team');
  const inputRef = useRef<HTMLInputElement>(null);
  const seenIds = useRef(new Set<string>());

  const accent = useMemo(() => playerType === 'merc' ? '#ff7a45' : '#60a5fa', [playerType]);

  useEffect(() => {
    if (!enabled || !connectionManager) return;

    const pushMessage = (msg: ChatMessage) => {
      if (!msg?.id || seenIds.current.has(msg.id)) return;
      seenIds.current.add(msg.id);
      setMessages(prev => [...prev.slice(-29), msg]);
    };

    const handleRawChat = (payload: any) => {
      const incomingScope: ChatScope = payload.scope || 'all';
      const senderType = payload.playerType;
      const deliveredByProxy = !!payload.deliveredByProxy;
      const effectiveScope = payload.effectiveScope || (incomingScope === 'proxy' ? 'team' : incomingScope);

      if (incomingScope === 'team' && senderType && senderType !== playerType) return;
      if (incomingScope === 'proxy' && !deliveredByProxy && senderType === playerType) return;

      pushMessage({
        id: payload.id || `chat-${payload.timestamp || Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        playerId: payload.player,
        playerName: payload.playerName,
        message: payload.message || '',
        timestamp: payload.timestamp || Date.now(),
        scope: incomingScope,
        deliveredByProxy,
        effectiveScope,
      });
    };

    connectionManager.on('chat', handleRawChat);
    return () => {
      connectionManager.off('chat', handleRawChat);
    };
  }, [connectionManager, enabled, playerType]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !isOpen) {
        setIsOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
        e.preventDefault();
      } else if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        setDraft('');
      } else if (isOpen && e.key === 'Tab') {
        e.preventDefault();
        setScope(prev => prev === 'team' ? 'proxy' : prev === 'proxy' ? 'all' : 'team');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  if (!enabled) return null;

  const sendChat = () => {
    const message = draft.trim();
    if (!message) return;

    const id = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    connectionManager.sendMessage({
      type: 'chat',
      message,
      scope,
      id,
      playerType,
    });

    setDraft('');
    setIsOpen(false);
  };

  return (
    <div style={{
      position: 'fixed',
      left: 16,
      bottom: 16,
      width: 360,
      zIndex: 2500,
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      color: '#fff',
      pointerEvents: 'none',
    }}>
      <div style={{
        background: 'linear-gradient(180deg, rgba(10,14,24,0.82) 0%, rgba(10,14,24,0.58) 100%)',
        border: `1px solid ${accent}55`,
        borderRadius: 14,
        boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
        backdropFilter: 'blur(10px)',
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 12px 8px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          fontSize: 11,
          letterSpacing: '0.12em',
          color: '#cbd5e1',
        }}>
          <span>COMMS</span>
          <span style={{ color: accent }}>ENTER TO CHAT · TAB TO CYCLE</span>
        </div>

        <div style={{
          maxHeight: 180,
          overflowY: 'auto',
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          {messages.length === 0 ? (
            <div style={{ fontSize: 12, color: '#94a3b8' }}>No chatter yet.</div>
          ) : messages.map(msg => (
            <div key={msg.id} style={{ fontSize: 12, lineHeight: 1.35 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2 }}>
                <span style={{
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: '0.1em',
                  color: msg.scope === 'proxy' ? '#f9a8d4' : msg.effectiveScope === 'team' ? accent : '#e2e8f0',
                }}>
                  {msg.scope === 'proxy' ? 'PROXY' : (msg.effectiveScope === 'team' ? 'TEAM' : 'ALL')}
                </span>
                <span style={{ color: '#e2e8f0', fontWeight: 700 }}>{msg.playerName || msg.playerId || 'unknown'}</span>
                {msg.deliveredByProxy && (
                  <span style={{ color: '#f9a8d4', fontSize: 10 }}>relayed</span>
                )}
              </div>
              <div style={{ color: '#f8fafc' }}>{msg.message}</div>
            </div>
          ))}
        </div>

        <div style={{
          padding: 10,
          borderTop: '1px solid rgba(255,255,255,0.08)',
          pointerEvents: 'auto',
        }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            {(['team', 'proxy', 'all'] as ChatScope[]).map(option => (
              <button
                key={option}
                onClick={() => setScope(option)}
                style={{
                  border: 'none',
                  borderRadius: 999,
                  padding: '5px 10px',
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  cursor: 'pointer',
                  background: scope === option ? accent : 'rgba(255,255,255,0.08)',
                  color: '#fff',
                }}
              >
                {labelForScope(option)}
              </button>
            ))}
          </div>
          {isOpen ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    sendChat();
                  }
                  if (e.key === 'Escape') {
                    setIsOpen(false);
                    setDraft('');
                  }
                }}
                placeholder={`Send ${scope} message...`}
                style={{
                  flex: 1,
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'rgba(255,255,255,0.06)',
                  color: '#fff',
                  padding: '10px 12px',
                  outline: 'none',
                }}
              />
              <button
                onClick={sendChat}
                style={{
                  border: 'none',
                  borderRadius: 10,
                  padding: '0 14px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  background: accent,
                  color: '#fff',
                }}
              >
                Send
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setIsOpen(true);
                setTimeout(() => inputRef.current?.focus(), 0);
              }}
              style={{
                width: '100%',
                border: '1px dashed rgba(255,255,255,0.16)',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.04)',
                color: '#cbd5e1',
                padding: '10px 12px',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              Press Enter or click here to open chat.
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProxyChat;
