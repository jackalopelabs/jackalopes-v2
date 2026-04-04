import React, { useState, useEffect } from 'react';

interface HealthBarProps {
  health?: number; // Current health value (0-100)
  maxHealth?: number; // Maximum health value
  showText?: boolean; // Whether to show health text
  width?: string; // Width of the health bar
  height?: string; // Height of the health bar
  className?: string; // Additional CSS classes
}

/**
 * HealthBar component displays a health bar in the bottom left corner
 */
export const HealthBar: React.FC<HealthBarProps> = ({
  health = 100,
  maxHealth = 100,
  showText = true,
  width = '200px',
  height = '25px',
  className = '',
}) => {
  // Calculate health percentage
  const healthPercentage = Math.min(100, Math.max(0, (health / maxHealth) * 100));
  
  // Add different color based on health level
  const getHealthColor = () => {
    if (healthPercentage > 60) return 'white'; // Full health is white
    if (healthPercentage > 30) return '#ffcc00'; // Medium health is yellow
    return '#ff3333'; // Low health is red
  };

  // Health bar styles
  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: '30px',
    left: '30px',
    width,
    height,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: '8px',
    overflow: 'hidden',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
    zIndex: 1000,
    border: '1px solid rgba(255, 255, 255, 0.2)'
  };

  const progressStyle: React.CSSProperties = {
    width: `${healthPercentage}%`,
    height: '100%',
    backgroundColor: getHealthColor(),
    borderRadius: '6px', // Slightly smaller to stay within container
    transition: 'width 0.3s ease, background-color 0.3s ease',
  };

  const textStyle: React.CSSProperties = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    color: 'white',
    fontSize: '14px',
    fontWeight: 'bold',
    textShadow: '1px 1px 2px rgba(0, 0, 0, 0.8)',
    fontFamily: 'monospace',
    userSelect: 'none',
  };

  // Health decrease animation
  const [displayedHealth, setDisplayedHealth] = useState(health);
  
  useEffect(() => {
    if (health < displayedHealth) {
      // Animate health decrease
      const timer = setTimeout(() => {
        setDisplayedHealth(prev => Math.max(health, prev - 1));
      }, 20);
      return () => clearTimeout(timer);
    } else if (health > displayedHealth) {
      // Immediately increase health (no animation)
      setDisplayedHealth(health);
    }
  }, [health, displayedHealth]);

  return (
    <div style={containerStyle} className={`health-bar ${className}`}>
      <div style={progressStyle} />
      {showText && (
        <div style={textStyle}>
          {Math.round(displayedHealth)}/{maxHealth}
        </div>
      )}
    </div>
  );
};

export default HealthBar; 