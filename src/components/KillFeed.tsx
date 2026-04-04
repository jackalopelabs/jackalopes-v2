import React, { useState, useEffect, useCallback, useRef } from 'react';

export interface KillFeedEvent {
  id: string;
  type: 'kill' | 'score' | 'info';
  message: string;
  color?: string;
  timestamp: number;
}

interface KillFeedProps {
  maxItems?: number;
  fadeAfterMs?: number;
}

export const KillFeed: React.FC<KillFeedProps> = ({
  maxItems = 5,
  fadeAfterMs = 4000,
}) => {
  const [events, setEvents] = useState<KillFeedEvent[]>([]);
  const eventsRef = useRef<KillFeedEvent[]>([]);

  const addEvent = useCallback((event: Omit<KillFeedEvent, 'id' | 'timestamp'>) => {
    const newEvent: KillFeedEvent = {
      ...event,
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
    };

    eventsRef.current = [newEvent, ...eventsRef.current].slice(0, maxItems);
    setEvents([...eventsRef.current]);
  }, [maxItems]);

  // Listen for kill feed events from the game
  useEffect(() => {
    const handleKillFeed = (e: CustomEvent) => {
      addEvent(e.detail);
    };

    window.addEventListener('killfeed', handleKillFeed as EventListener);
    return () => window.removeEventListener('killfeed', handleKillFeed as EventListener);
  }, [addEvent]);

  // Clean up old events
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const filtered = eventsRef.current.filter(e => now - e.timestamp < fadeAfterMs + 1000);
      if (filtered.length !== eventsRef.current.length) {
        eventsRef.current = filtered;
        setEvents([...filtered]);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [fadeAfterMs]);

  return (
    <div style={{
      position: 'fixed',
      top: '80px',
      right: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      zIndex: 2000,
      pointerEvents: 'none',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      maxWidth: '350px',
    }}>
      {events.map((event) => {
        const age = Date.now() - event.timestamp;
        const opacity = age > fadeAfterMs ? Math.max(0, 1 - (age - fadeAfterMs) / 1000) : 1;

        const bgColor = event.type === 'kill'
          ? 'rgba(255, 69, 0, 0.25)'
          : event.type === 'score'
            ? 'rgba(70, 130, 180, 0.25)'
            : 'rgba(255, 255, 255, 0.1)';

        const borderColor = event.type === 'kill'
          ? '#ff4500'
          : event.type === 'score'
            ? '#4682B4'
            : '#888';

        return (
          <div
            key={event.id}
            style={{
              background: bgColor,
              borderLeft: `3px solid ${borderColor}`,
              padding: '6px 12px',
              borderRadius: '4px',
              color: event.color || '#fff',
              fontSize: '13px',
              fontWeight: 600,
              opacity,
              transition: 'opacity 0.5s ease',
              backdropFilter: 'blur(4px)',
              animation: 'killFeedSlideIn 0.3s ease-out',
              textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
            }}
          >
            {event.message}
          </div>
        );
      })}

      <style>{`
        @keyframes killFeedSlideIn {
          from { transform: translateX(30px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
};

// Helper to dispatch kill feed events from anywhere
export const emitKillFeed = (
  type: KillFeedEvent['type'],
  message: string,
  color?: string
) => {
  window.dispatchEvent(new CustomEvent('killfeed', {
    detail: { type, message, color }
  }));
};

export default KillFeed;
