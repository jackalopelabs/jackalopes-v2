import React, { useState, useEffect, useCallback, useRef } from 'react';

interface ScoreDisplayProps {
  jackalopesScore: number;
  mercsScore: number;
  className?: string;
  onReset?: () => void; // Add callback for when timer reaches zero
  isHost?: boolean; // Add prop to determine if this client is the host
  matchStartTime?: number; // Server-provided match start timestamp
  matchDuration?: number; // Match duration in seconds
  serverTime?: number; // Server time at join for clock sync
}

/**
 * ScoreDisplay component shows the current score for both teams
 */
export const ScoreDisplay: React.FC<ScoreDisplayProps> = ({
  jackalopesScore = 0,
  mercsScore = 0,
  className = '',
  onReset,
  isHost = false, // Default to non-host
  matchStartTime,
  matchDuration = 300,
  serverTime,
}) => {
  // Add state to track score changes for animation
  const [lastJackalopesScore, setLastJackalopesScore] = useState(jackalopesScore);
  const [lastMercsScore, setLastMercsScore] = useState(mercsScore);
  const [jackalopesFlash, setJackalopesFlash] = useState(false);
  const [mercsFlash, setMercsFlash] = useState(false);
  
  // Host state tracking
  const isHostRef = useRef(isHost);
  
  // Update host ref when prop changes
  useEffect(() => {
    isHostRef.current = isHost;
    console.log(`⏱️ ScoreDisplay host status: ${isHost ? 'HOST' : 'CLIENT'}`);
  }, [isHost]);
  
  // Add state for countdown timer - synced to server match start time
  const [timeRemaining, setTimeRemaining] = useState(() => {
    if (matchStartTime && matchDuration) {
      // Calculate remaining time based on server match start
      const clockOffset = serverTime ? (Date.now() - serverTime) : 0;
      const elapsed = Math.floor((Date.now() - matchStartTime - clockOffset) / 1000);
      return Math.max(0, matchDuration - elapsed);
    }
    // Fallback to localStorage
    try {
      const savedTime = localStorage.getItem('timer_remaining');
      const savedTimestamp = localStorage.getItem('timer_timestamp');
      
      if (savedTime && savedTimestamp) {
        const elapsedSeconds = Math.floor((Date.now() - parseInt(savedTimestamp, 10)) / 1000);
        const remainingTime = Math.max(0, parseInt(savedTime, 10) - elapsedSeconds);
        
        if (remainingTime > 0 && remainingTime <= 300) {
          return remainingTime;
        }
      }
    } catch (err) {
      console.error('Error loading timer from localStorage:', err);
    }
    
    // Default to 5 minutes (300 seconds)
    return 300;
  });
  
  // Track last reset time to avoid duplicate resets
  const lastResetTime = useRef(0);
  
  // Maintain a ref to the latest score values to avoid closure issues
  const scoresRef = useRef({ jackalopesScore, mercsScore });
  
  // Track first mount to avoid unnecessary resets
  const isFirstMount = useRef(true);
  
  // Track if timer is currently active
  const timerActiveRef = useRef(true);
  
  // Update ref whenever scores change
  useEffect(() => {
    scoresRef.current = { jackalopesScore, mercsScore };
  }, [jackalopesScore, mercsScore]);
  
  // Format seconds to MM:SS
  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };
  
  // Save timer state to localStorage
  const saveTimerState = (time: number) => {
    try {
      localStorage.setItem('timer_remaining', time.toString());
      localStorage.setItem('timer_timestamp', Date.now().toString());
      localStorage.setItem('timer_host_id', isHostRef.current ? 'host' : 'client');
      
      // Also save whether a recent score happened
      const lastScoreTime = localStorage.getItem('last_score_time');
      if (lastScoreTime) {
        const timeSinceLastScore = Date.now() - parseInt(lastScoreTime, 10);
        localStorage.setItem('timer_should_reset_scores', (timeSinceLastScore > 5000).toString());
      } else {
        localStorage.setItem('timer_should_reset_scores', 'true');
      }
      
      // Broadcast timer update via custom event for other tabs/windows
      if (isHostRef.current) {
        window.dispatchEvent(new CustomEvent('host_timer_update', {
          detail: {
            timeRemaining: time,
            timestamp: Date.now(),
            hostId: 'host'
          }
        }));
      }
    } catch (err) {
      console.error('Error saving timer to localStorage:', err);
    }
  };
  
  // Create a memoized reset function that only resets when timer reaches zero
  const resetTimer = useCallback(() => {
    // Only host should initiate timer resets
    if (!isHostRef.current && localStorage.getItem('timer_host_id') !== 'client') {
      console.log('⏱️ Non-host client not initiating timer reset');
      return;
    }
    
    // Prevent multiple resets within 3 seconds
    const now = Date.now();
    if (now - lastResetTime.current < 3000) {
      console.log('⏱️ Ignoring duplicate timer reset - too soon after previous reset');
      return;
    }
    
    console.log('⏱️ Timer reset: setting to 5 minutes');
    setTimeRemaining(300); // Reset to 5 minutes
    saveTimerState(300);
    lastResetTime.current = now;
    
    // Check if there was a recent score update before resetting scores
    const lastScoreTime = localStorage.getItem('last_score_time');
    const shouldResetScores = !lastScoreTime || (Date.now() - parseInt(lastScoreTime, 10) > 5000);
    
    // Only call onReset if we actually need to reset the scores
    // This ensures we're not constantly resetting scores to zero
    if (onReset && shouldResetScores && (scoresRef.current.jackalopesScore > 0 || scoresRef.current.mercsScore > 0)) {
      console.log('⏱️ Calling onReset to reset scores');
      onReset();
    } else if (onReset && !shouldResetScores) {
      console.log('⏱️ Skipping score reset because a score was updated recently');
    }
    
    // Broadcast reset to other clients with our host status
    window.dispatchEvent(new CustomEvent('timer_reset', {
      detail: {
        timestamp: Date.now(),
        id: `timer-reset-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        fromHost: isHostRef.current,
        shouldResetScores
      }
    }));
  }, [onReset]);
  
  // Timer countdown effect
  useEffect(() => {
    // Create a custom event for broadcasting timer resets
    const broadcastTimerReset = () => {
      try {
        window.dispatchEvent(new CustomEvent('timer_reset', {
          detail: {
            timestamp: Date.now(),
            id: `timer-reset-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            fromHost: isHostRef.current
          }
        }));
      } catch (err) {
        console.error('Error broadcasting timer reset:', err);
      }
    };
    
    // Broadcast full timer update (not just reset)
    const broadcastTimerState = (time: number) => {
      if (isHostRef.current) {
        try {
          window.dispatchEvent(new CustomEvent('host_timer_full_sync', {
            detail: {
              timeRemaining: time,
              timestamp: Date.now(),
              fromHost: true
            }
          }));
        } catch (err) {
          console.error('Error broadcasting timer state:', err);
        }
      }
    };
    
    // Only host should update the timer
    let timerInterval: number | undefined;
    
    if (isHostRef.current) {
      timerInterval = window.setInterval(() => {
        setTimeRemaining(prev => {
          if (!timerActiveRef.current) {
            return prev; // Don't update if timer is paused
          }
          
          const newTime = prev - 1;
          
          // Save timer state more frequently when we're the host
          // On specific intervals to reduce performance impact
          if (newTime % 5 === 0 || newTime <= 10) {
            saveTimerState(newTime);
          }
          
          // Do a full timer sync more often to prevent drift
          if (newTime % 15 === 0 || newTime <= 30) {
            broadcastTimerState(newTime);
          }
          
          // Warn when approaching zero
          if (newTime === 10) {
            console.log('⏱️ Timer approaching zero - 10 seconds remaining');
          }
          
          if (newTime <= 0) {
            // Timer reached zero, reset scores
            console.log('⏱️ Timer reached zero, resetting');
            resetTimer();
            broadcastTimerReset(); // Broadcast reset event
            return 300;
          }
          return newTime;
        });
      }, 1000);
    } else {
      // Non-host clients also run a timer but only for display consistency
      // They will get overridden by host broadcasts
      timerInterval = window.setInterval(() => {
        setTimeRemaining(prev => {
          return Math.max(0, prev - 1);
        });
      }, 1000);
    }
    
    // Listen for timer reset events from other sources
    const handleTimerResetEvent = (e: CustomEvent) => {
      console.log('⏱️ Received timer reset event:', e.detail);
      
      // If the reset came from the host, always process it
      if (e.detail.fromHost && !isHostRef.current) {
        console.log('⏱️ Processing timer reset from host');
        setTimeRemaining(300);
        
        // If the host says to reset scores, do it
        if (e.detail.shouldResetScores && onReset) {
          onReset();
        }
        return;
      }
      
      // Only process if it's been more than 3 seconds since our last reset
      // and we're the host (non-hosts shouldn't reset unless from host)
      const now = Date.now();
      if (isHostRef.current && now - lastResetTime.current > 3000) {
        resetTimer();
      } else if (!isHostRef.current) {
        console.log('⏱️ Non-host ignoring timer reset not from host');
      } else {
        console.log('⏱️ Ignoring timer reset event - too soon after our reset');
      }
    };
    
    // Handle full timer sync events (for fixing clock drift)
    const handleFullTimerSync = (e: CustomEvent) => {
      if (!isHostRef.current && e.detail.fromHost) {
        console.log('⏱️ Received full timer sync from host:', e.detail);
        // Always accept exact time from host to fix desynchronization
        setTimeRemaining(e.detail.timeRemaining);
      }
    };
    
    window.addEventListener('timer_reset', handleTimerResetEvent as EventListener);
    window.addEventListener('host_timer_full_sync', handleFullTimerSync as EventListener);
    
    // Force a full timer sync on component mount and when host state changes
    if (isHostRef.current) {
      broadcastTimerState(timeRemaining);
    }
    
    return () => {
      if (timerInterval) clearInterval(timerInterval);
      window.removeEventListener('timer_reset', handleTimerResetEvent as EventListener);
      window.removeEventListener('host_timer_full_sync', handleFullTimerSync as EventListener);
    };
  }, [resetTimer, isHost]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('jackalopes_timer_tick', {
      detail: {
        timeRemaining,
        timestamp: Date.now(),
        isHost: isHostRef.current,
      }
    }));
  }, [timeRemaining]);
  
  // Add an additional effect to force sync when host status changes
  useEffect(() => {
    console.log(`⏱️ Host status changed to: ${isHost ? 'HOST' : 'CLIENT'}`);
    
    // Force a timer sync whenever host status changes
    if (isHost) {
      // New host should broadcast current time immediately
      window.dispatchEvent(new CustomEvent('host_timer_full_sync', {
        detail: {
          timeRemaining,
          timestamp: Date.now(),
          fromHost: true
        }
      }));
    }
  }, [isHost, timeRemaining]);
  
  // Initialize timer when component mounts
  useEffect(() => {
    if (isFirstMount.current) {
      console.log(`⏱️ ScoreDisplay mounted - initializing timer (${isHost ? 'HOST' : 'CLIENT'})`);
      isFirstMount.current = false;
      
      // Check if scores were just reset recently
      const resetTime = localStorage.getItem('scores_reset_time');
      const now = Date.now();
      
      if (resetTime && now - parseInt(resetTime, 10) < 3000) {
        console.log('⏱️ Scores were just reset recently, not resetting again');
      }
    }
    
    // Listen for timer sync events from other clients
    const handleTimerSync = (e: StorageEvent) => {
      if (e.key === 'timer_timestamp' && e.newValue) {
        // Only accept timer updates from host if we're not the host
        const hostId = localStorage.getItem('timer_host_id');
        if (!isHostRef.current && hostId === 'host') {
          console.log('⏱️ Received timer sync from host via localStorage');
          
          try {
            const savedTime = localStorage.getItem('timer_remaining');
            if (savedTime) {
              const elapsedSeconds = Math.floor((Date.now() - parseInt(e.newValue, 10)) / 1000);
              const remainingTime = Math.max(0, parseInt(savedTime, 10) - elapsedSeconds);
              
              if (remainingTime > 0 && remainingTime <= 300 && Math.abs(remainingTime - timeRemaining) > 2) {
                console.log(`⏱️ Syncing timer from host: ${remainingTime}s remaining`);
                setTimeRemaining(remainingTime);
              }
            }
          } catch (err) {
            console.error('Error syncing timer from localStorage:', err);
          }
        }
      }
    };
    
    // Handle direct host timer updates via custom event
    const handleHostTimerUpdate = (e: CustomEvent) => {
      if (!isHostRef.current) { // Only non-hosts should process these updates
        console.log('⏱️ Received direct timer update from host:', e.detail);
        
        // Check if this update is significantly different from our current time
        // This prevents minor drift corrections from being too jarring
        const diff = Math.abs(timeRemaining - e.detail.timeRemaining);
        
        if (diff >= 2) { // Only update if 2 or more seconds difference
          console.log(`⏱️ Correcting timer drift of ${diff} seconds`);
          setTimeRemaining(e.detail.timeRemaining);
        } else {
          console.log(`⏱️ Ignoring minor drift correction of ${diff} seconds`);
        }
      }
    };
    
    window.addEventListener('storage', handleTimerSync);
    window.addEventListener('host_timer_update', handleHostTimerUpdate as EventListener);
    
    return () => {
      // Save timer state when component unmounts
      saveTimerState(timeRemaining);
      window.removeEventListener('storage', handleTimerSync);
      window.removeEventListener('host_timer_update', handleHostTimerUpdate as EventListener);
    };
  }, [timeRemaining, isHost]);
  
  // Watch for score changes and trigger animation
  useEffect(() => {
    if (jackalopesScore > lastJackalopesScore) {
      setJackalopesFlash(true);
      setTimeout(() => setJackalopesFlash(false), 2000); // 2 second flash
      
      // Update last score time in localStorage
      localStorage.setItem('last_score_time', Date.now().toString());
      
      // Broadcast score update if we're the host
      if (isHostRef.current) {
        window.dispatchEvent(new CustomEvent('host_score_update', {
          detail: {
            jackalopesScore,
            mercsScore,
            timestamp: Date.now()
          }
        }));
      }
    }
    setLastJackalopesScore(jackalopesScore);
  }, [jackalopesScore, lastJackalopesScore, mercsScore]);
  
  useEffect(() => {
    if (mercsScore > lastMercsScore) {
      setMercsFlash(true);
      setTimeout(() => setMercsFlash(false), 2000); // 2 second flash
      
      // Update last score time in localStorage
      localStorage.setItem('last_score_time', Date.now().toString());
      
      // Broadcast score update if we're the host
      if (isHostRef.current) {
        window.dispatchEvent(new CustomEvent('host_score_update', {
          detail: {
            jackalopesScore,
            mercsScore,
            timestamp: Date.now()
          }
        }));
      }
    }
    setLastMercsScore(mercsScore);
  }, [mercsScore, lastMercsScore, jackalopesScore]);

  // Styles for the score display
  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: '30px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: '10px',
    padding: '12px 18px',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
    zIndex: 1000,
    border: 'none',
    color: 'white',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    userSelect: 'none',
    gap: '20px',
    transition: 'all 0.3s ease-in-out',
  };

  const scoreStyle: React.CSSProperties = {
    fontSize: '16px',
    fontWeight: 'bold',
    textShadow: '1px 1px 2px rgba(0, 0, 0, 0.8)',
    transition: 'all 0.3s ease',
    color: '#ffffff',
  };

  const jackalopesStyle: React.CSSProperties = {
    ...scoreStyle,
    color: jackalopesFlash ? '#ffffff' : '#ffffff', // Changed to white
    textShadow: jackalopesFlash ? '0 0 15px #4682B4, 0 0 10px #4682B4, 0 0 5px #4682B4' : '1px 1px 2px rgba(0, 0, 0, 0.8)',
    fontSize: jackalopesFlash ? '20px' : '16px', // Reduced from 22px/18px
  };

  const mercsStyle: React.CSSProperties = {
    ...scoreStyle,
    color: mercsFlash ? '#ffffff' : '#ffffff', // Changed to white
    textShadow: mercsFlash ? '0 0 15px #ff4500, 0 0 10px #ff4500, 0 0 5px #ff4500' : '1px 1px 2px rgba(0, 0, 0, 0.8)',
    fontSize: mercsFlash ? '20px' : '16px', // Reduced from 22px/18px
  };
  
  // Style for timer
  const timerStyle: React.CSSProperties = {
    ...scoreStyle,
    color: timeRemaining <= 60 ? '#ff3333' : '#ffffff', // Red when less than a minute, white otherwise
    fontSize: timeRemaining <= 10 ? '18px' : '14px', // Reduced from 20px/16px
    transition: 'all 0.3s ease',
  };

  // Add host indicator style
  const hostIndicatorStyle: React.CSSProperties = {
    fontSize: '12px',
    color: isHost ? '#7fef7f' : 'transparent',
    marginRight: '5px',
  };

  return (
    <div 
      style={containerStyle} 
      className={`score-display ${className}`}
    >
      {/* Add host indicator */}
      <span style={hostIndicatorStyle}>●</span>
      
      <span 
        style={jackalopesStyle}
        className={jackalopesFlash ? 'score-flash' : ''}
      >
        Jackalopes: {jackalopesScore}
      </span>
      <span style={scoreStyle}>·</span>
      <span 
        style={mercsStyle}
        className={mercsFlash ? 'score-flash' : ''}
      >
        Mercs: {mercsScore}
      </span>
      <span style={scoreStyle}>·</span>
      <span 
        style={timerStyle}
        className={timeRemaining <= 10 ? 'timer-flash' : ''}
      >
        {formatTime(timeRemaining)}
      </span>
      
      {/* Add CSS animation */}
      <style>{`
        @keyframes scoreFlash {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.2); }
        }
        
        .score-flash {
          animation: scoreFlash 0.5s ease-in-out 3;
        }
        
        @keyframes timerFlash {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        
        .timer-flash {
          animation: timerFlash 0.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default ScoreDisplay; 
