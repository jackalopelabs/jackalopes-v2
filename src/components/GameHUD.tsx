import React, { useState, useEffect, useRef, useCallback } from 'react';

interface GameHUDProps {
  jackalopesScore: number;
  mercsScore: number;
  playerType: 'merc' | 'jackalope';
  matchStartTime?: number;
  matchDuration?: number;
  serverTime?: number;
  isHost?: boolean;
  onTimerEnd?: () => void;
  onTimeUpdate?: (timeRemaining: number) => void;
  roundKey?: number; // increment to reset the timer for a new round
  inventory?: {
    goldenEggs: number;
    rainbowEggs: number;
    greenNightVision: boolean;
  };
}

export const GameHUD: React.FC<GameHUDProps> = ({
  jackalopesScore = 0,
  mercsScore = 0,
  playerType,
  matchStartTime,
  matchDuration = 300,
  serverTime,
  isHost = false,
  onTimerEnd,
  onTimeUpdate,
  roundKey = 0,
  inventory = { goldenEggs: 0, rainbowEggs: 0, greenNightVision: false },
}) => {
  const serverClockOffsetRef = useRef<number | null>(serverTime ? (Date.now() - serverTime) : null);
  const getAuthoritativeRemaining = useCallback((now = Date.now()) => {
    if (!matchStartTime || !matchDuration) return null;
    const offset = serverClockOffsetRef.current ?? 0;
    const serverNow = now - offset;
    return Math.max(0, matchDuration - Math.floor((serverNow - matchStartTime) / 1000));
  }, [matchDuration, matchStartTime]);

  const [timeRemaining, setTimeRemaining] = useState(() => {
    const authoritative = getAuthoritativeRemaining();
    return authoritative ?? matchDuration;
  });

  const [jackalopesFlash, setJackalopesFlash] = useState(false);
  const [mercsFlash, setMercsFlash] = useState(false);
  const prevScores = useRef({ j: jackalopesScore, m: mercsScore });
  const timerResetSentRef = useRef(false);

  // Score flash animations
  useEffect(() => {
    if (jackalopesScore > prevScores.current.j) {
      setJackalopesFlash(true);
      setTimeout(() => setJackalopesFlash(false), 1500);
    }
    prevScores.current.j = jackalopesScore;
  }, [jackalopesScore]);

  useEffect(() => {
    if (mercsScore > prevScores.current.m) {
      setMercsFlash(true);
      setTimeout(() => setMercsFlash(false), 1500);
    }
    prevScores.current.m = mercsScore;
  }, [mercsScore]);

  // Sync clock offset from server time whenever authoritative timer data changes.
  useEffect(() => {
    if (serverTime) {
      serverClockOffsetRef.current = Date.now() - serverTime;
    }

    const authoritative = getAuthoritativeRemaining();
    if (authoritative !== null) {
      timerResetSentRef.current = false;
      setTimeRemaining(authoritative);
    }
  }, [getAuthoritativeRemaining, serverTime]);

  // Timer
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeRemaining(prev => {
        const authoritative = getAuthoritativeRemaining();
        const nextTime = authoritative ?? Math.max(0, prev - 1);

        if (nextTime <= 0) {
          if (isHost && !timerResetSentRef.current) {
            timerResetSentRef.current = true;
            const detail = {
              timestamp: Date.now(),
              id: `gamehud-timer-reset-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
              fromHost: true,
              shouldResetScores: true,
              source: 'game_hud',
            };
            window.dispatchEvent(new CustomEvent('timer_reset', { detail }));
            onTimerEnd?.();
          }
          return 0;
        }

        return nextTime;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [getAuthoritativeRemaining, isHost, onTimerEnd]);

  // Reset timer when a new round starts or new authoritative match timing arrives
  useEffect(() => {
    timerResetSentRef.current = false;
    const authoritative = getAuthoritativeRemaining();
    setTimeRemaining(authoritative ?? matchDuration);
  }, [getAuthoritativeRemaining, matchDuration, matchStartTime, roundKey]);

  // Listen for host timer syncs only in local fallback mode.
  useEffect(() => {
    if (isHost || matchStartTime) return;
    const handleSync = (e: CustomEvent) => {
      if (e.detail?.fromHost && e.detail.timeRemaining !== undefined) {
        setTimeRemaining(e.detail.timeRemaining);
      }
    };
    window.addEventListener('host_timer_full_sync', handleSync as EventListener);
    return () => window.removeEventListener('host_timer_full_sync', handleSync as EventListener);
  }, [isHost, matchStartTime]);

  // Host broadcasts timer
  useEffect(() => {
    if (!isHost) return;
    const interval = setInterval(() => {
      window.dispatchEvent(new CustomEvent('host_timer_full_sync', {
        detail: { timeRemaining, fromHost: true, timestamp: Date.now() }
      }));
    }, 5000);
    return () => clearInterval(interval);
  }, [isHost, timeRemaining]);

  // Broadcast the actual live countdown so other systems, like lighting, follow the same timer the HUD shows.
  useEffect(() => {
    onTimeUpdate?.(timeRemaining);
    window.dispatchEvent(new CustomEvent('jackalopes_timer_tick', {
      detail: {
        timeRemaining,
        timestamp: Date.now(),
        isHost,
        source: 'game_hud',
      }
    }));
  }, [isHost, onTimeUpdate, timeRemaining]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const isUrgent = timeRemaining <= 30;
  const isCritical = timeRemaining <= 10;

  return (
    <>
    <div style={{
      position: 'fixed',
      top: 0,
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      alignItems: 'stretch',
      zIndex: 2000,
      fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
      userSelect: 'none',
      pointerEvents: 'none',
    }}>
      {/* Jackalopes side */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 20px',
        background: jackalopesFlash
          ? 'linear-gradient(180deg, rgba(70,130,180,0.6) 0%, rgba(70,130,180,0.2) 100%)'
          : 'linear-gradient(180deg, rgba(70,130,180,0.35) 0%, rgba(70,130,180,0.1) 100%)',
        borderBottom: `2px solid ${jackalopesFlash ? '#4682B4' : '#4682B460'}`,
        borderBottomLeftRadius: '8px',
        transition: 'all 0.3s ease',
        minWidth: '140px',
        justifyContent: 'flex-end',
      }}>
        <span style={{
          fontSize: '13px',
          fontWeight: 700,
          color: '#4682B4',
          letterSpacing: '1px',
          textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
        }}>
          JACKALOPES
        </span>
        <span style={{
          fontSize: jackalopesFlash ? '32px' : '26px',
          fontWeight: 900,
          color: '#fff',
          textShadow: jackalopesFlash
            ? '0 0 20px #4682B4, 0 0 40px #4682B480'
            : '1px 1px 4px rgba(0,0,0,0.8)',
          transition: 'all 0.3s ease',
          minWidth: '40px',
          textAlign: 'center',
        }}>
          {jackalopesScore}
        </span>
      </div>

      {/* Timer center */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '6px 16px',
        background: isCritical
          ? 'linear-gradient(180deg, rgba(255,50,50,0.5) 0%, rgba(255,50,50,0.15) 100%)'
          : isUrgent
            ? 'linear-gradient(180deg, rgba(255,200,0,0.4) 0%, rgba(255,200,0,0.1) 100%)'
            : 'linear-gradient(180deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.03) 100%)',
        borderBottom: `2px solid ${isCritical ? '#ff3333' : isUrgent ? '#ffcc00' : '#ffffff30'}`,
        transition: 'all 0.3s ease',
        minWidth: '80px',
      }}>
        <span style={{
          fontSize: isCritical ? '28px' : '22px',
          fontWeight: 800,
          fontVariantNumeric: 'tabular-nums',
          color: isCritical ? '#ff3333' : isUrgent ? '#ffcc00' : '#fff',
          textShadow: isCritical
            ? '0 0 15px #ff3333'
            : '1px 1px 4px rgba(0,0,0,0.8)',
          animation: isCritical ? 'timerPulse 0.5s ease-in-out infinite' : 'none',
          transition: 'all 0.3s ease',
        }}>
          {formatTime(timeRemaining)}
        </span>
      </div>

      {/* Mercs side */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 20px',
        background: mercsFlash
          ? 'linear-gradient(180deg, rgba(255,69,0,0.6) 0%, rgba(255,69,0,0.2) 100%)'
          : 'linear-gradient(180deg, rgba(255,69,0,0.35) 0%, rgba(255,69,0,0.1) 100%)',
        borderBottom: `2px solid ${mercsFlash ? '#ff4500' : '#ff450060'}`,
        borderBottomRightRadius: '8px',
        transition: 'all 0.3s ease',
        minWidth: '140px',
        justifyContent: 'flex-start',
      }}>
        <span style={{
          fontSize: mercsFlash ? '32px' : '26px',
          fontWeight: 900,
          color: '#fff',
          textShadow: mercsFlash
            ? '0 0 20px #ff4500, 0 0 40px #ff450080'
            : '1px 1px 4px rgba(0,0,0,0.8)',
          transition: 'all 0.3s ease',
          minWidth: '40px',
          textAlign: 'center',
        }}>
          {mercsScore}
        </span>
        <span style={{
          fontSize: '13px',
          fontWeight: 700,
          color: '#ff4500',
          letterSpacing: '1px',
          textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
        }}>
          MERCS
        </span>
      </div>

      <style>{`
        @keyframes timerPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.05); }
        }
      `}</style>
    </div>

    {playerType === 'jackalope' && (inventory.rainbowEggs > 0 || inventory.greenNightVision) && (
      <div style={{
        position: 'fixed',
        top: '66px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1999,
        pointerEvents: 'none',
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
        display: 'flex',
        gap: '8px',
      }}>
        {inventory.greenNightVision && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 10px',
            borderRadius: '999px',
            background: 'linear-gradient(180deg, rgba(100,255,140,0.18) 0%, rgba(40,120,60,0.10) 100%)',
            backdropFilter: 'blur(12px)',
            color: '#fff',
            boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '999px',
              background: 'linear-gradient(180deg, #d8ffd7 0%, #4dff88 100%)',
              boxShadow: '0 0 12px rgba(77,255,136,0.8)',
              flexShrink: 0,
            }} />
            <span style={{
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.12em',
              color: '#d9ffe0',
            }}>
              NIGHT VISION
            </span>
            <span style={{
              fontSize: '10px',
              color: '#b7f7c1',
              letterSpacing: '0.06em',
            }}>
              ACTIVE
            </span>
          </div>
        )}

        {inventory.rainbowEggs > 0 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 10px',
            borderRadius: '999px',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.04) 100%)',
            backdropFilter: 'blur(12px)',
            color: '#fff',
            boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '999px',
              background: 'linear-gradient(180deg, #ffffff 0%, #a78bfa 100%)',
              boxShadow: '0 0 12px rgba(167,139,250,0.8)',
              flexShrink: 0,
            }} />
            <span style={{
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.12em',
              color: '#cbd5e1',
            }}>
              FLASH
            </span>
            <span style={{
              fontSize: '14px',
              fontWeight: 900,
              color: '#fff',
              minWidth: '14px',
              textAlign: 'center',
            }}>
              {inventory.rainbowEggs}
            </span>
            <span style={{
              fontSize: '10px',
              color: '#94a3b8',
              letterSpacing: '0.06em',
            }}>
              B / CLICK
            </span>
          </div>
        )}
      </div>
    )}
    </>
  );
};

export default GameHUD;
