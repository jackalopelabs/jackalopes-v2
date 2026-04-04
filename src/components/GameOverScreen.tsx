import React, { useEffect, useState } from 'react';

interface GameOverScreenProps {
  visible: boolean;
  jackalopesScore: number;
  mercsScore: number;
  playerType: 'merc' | 'jackalope';
  onPlayAgain: () => void;
  countdown?: number; // auto-restart countdown
}

export const GameOverScreen: React.FC<GameOverScreenProps> = ({
  visible,
  jackalopesScore,
  mercsScore,
  playerType,
  onPlayAgain,
  countdown = 10,
}) => {
  const [autoCountdown, setAutoCountdown] = useState(countdown);

  useEffect(() => {
    if (!visible) {
      setAutoCountdown(countdown);
      return;
    }

    const interval = setInterval(() => {
      setAutoCountdown(prev => {
        if (prev <= 1) {
          onPlayAgain();
          return countdown;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [visible, onPlayAgain, countdown]);

  if (!visible) return null;

  const jackalopesWin = jackalopesScore > mercsScore;
  const tied = jackalopesScore === mercsScore;
  const playerWon = tied ? false : (playerType === 'jackalope' ? jackalopesWin : !jackalopesWin);

  const winnerText = tied
    ? "IT'S A TIE"
    : jackalopesWin
      ? '🐰 JACKALOPES WIN!'
      : '🎯 MERCS WIN!';

  const subText = tied
    ? 'Nobody wins... this time.'
    : playerWon
      ? 'Victory is yours!'
      : 'Better luck next round.';

  const winnerColor = tied ? '#888' : jackalopesWin ? '#4682B4' : '#ff4500';

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.95) 100%)',
      zIndex: 9999,
      fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
      color: 'white',
      userSelect: 'none',
      animation: 'gameOverFadeIn 0.5s ease-out',
    }}>
      {/* Winner announcement */}
      <div style={{
        fontSize: 'clamp(32px, 6vw, 72px)',
        fontWeight: 900,
        color: winnerColor,
        textShadow: `0 0 40px ${winnerColor}80, 0 0 80px ${winnerColor}40`,
        letterSpacing: '2px',
        marginBottom: '16px',
        animation: 'gameOverPulse 2s ease-in-out infinite',
      }}>
        {winnerText}
      </div>

      {/* Sub text */}
      <div style={{
        fontSize: 'clamp(16px, 2.5vw, 24px)',
        color: '#aaa',
        marginBottom: '40px',
        fontStyle: 'italic',
      }}>
        {subText}
      </div>

      {/* Score cards */}
      <div style={{
        display: 'flex',
        gap: '40px',
        marginBottom: '48px',
      }}>
        <ScoreCard
          label="JACKALOPES"
          score={jackalopesScore}
          color="#4682B4"
          emoji="🐰"
          isWinner={jackalopesWin && !tied}
        />
        <div style={{
          display: 'flex',
          alignItems: 'center',
          fontSize: '32px',
          color: '#555',
          fontWeight: 700,
        }}>
          VS
        </div>
        <ScoreCard
          label="MERCS"
          score={mercsScore}
          color="#ff4500"
          emoji="🎯"
          isWinner={!jackalopesWin && !tied}
        />
      </div>

      {/* Play again button */}
      <button
        onClick={onPlayAgain}
        style={{
          background: `linear-gradient(135deg, ${winnerColor}, ${winnerColor}cc)`,
          border: 'none',
          color: 'white',
          padding: '16px 48px',
          fontSize: '20px',
          fontWeight: 700,
          borderRadius: '12px',
          cursor: 'pointer',
          letterSpacing: '1px',
          boxShadow: `0 4px 20px ${winnerColor}60`,
          transition: 'all 0.2s ease',
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.transform = 'scale(1.05)';
          e.currentTarget.style.boxShadow = `0 6px 30px ${winnerColor}80`;
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = `0 4px 20px ${winnerColor}60`;
        }}
      >
        PLAY AGAIN ({autoCountdown}s)
      </button>

      <style>{`
        @keyframes gameOverFadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes gameOverPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
        }
      `}</style>
    </div>
  );
};

const ScoreCard: React.FC<{
  label: string;
  score: number;
  color: string;
  emoji: string;
  isWinner: boolean;
}> = ({ label, score, color, emoji, isWinner }) => (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '24px 32px',
    background: isWinner
      ? `linear-gradient(135deg, ${color}30, ${color}10)`
      : 'rgba(255,255,255,0.05)',
    borderRadius: '16px',
    border: isWinner ? `2px solid ${color}80` : '2px solid transparent',
    minWidth: '140px',
    transition: 'all 0.3s ease',
  }}>
    <div style={{ fontSize: '36px', marginBottom: '8px' }}>{emoji}</div>
    <div style={{
      fontSize: '48px',
      fontWeight: 900,
      color: isWinner ? color : '#888',
      textShadow: isWinner ? `0 0 20px ${color}60` : 'none',
    }}>
      {score}
    </div>
    <div style={{
      fontSize: '14px',
      fontWeight: 700,
      letterSpacing: '2px',
      color: isWinner ? color : '#666',
      marginTop: '4px',
    }}>
      {label}
    </div>
    {isWinner && (
      <div style={{
        marginTop: '8px',
        fontSize: '12px',
        color: color,
        fontWeight: 600,
      }}>
        👑 WINNER
      </div>
    )}
  </div>
);

export default GameOverScreen;
