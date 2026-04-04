import React from 'react';

interface CrosshairProps {
  visible?: boolean;
  color?: string;
  size?: number;
  hitMarker?: boolean; // Flash red when hitting a target
}

export const Crosshair: React.FC<CrosshairProps> = ({
  visible = true,
  color = 'rgba(255, 255, 255, 0.8)',
  size = 24,
  hitMarker = false,
}) => {
  if (!visible) return null;

  const activeColor = hitMarker ? '#ff4500' : color;
  const thickness = hitMarker ? 3 : 2;
  const gap = size * 0.25;
  const armLen = size * 0.35;

  return (
    <div style={{
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: `${size}px`,
      height: `${size}px`,
      zIndex: 2000,
      pointerEvents: 'none',
      transition: hitMarker ? 'none' : 'all 0.1s ease',
    }}>
      {/* Top */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: `${thickness}px`,
        height: `${armLen}px`,
        background: activeColor,
        boxShadow: `0 0 4px ${activeColor}`,
        borderRadius: '1px',
      }} />
      {/* Bottom */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: `${thickness}px`,
        height: `${armLen}px`,
        background: activeColor,
        boxShadow: `0 0 4px ${activeColor}`,
        borderRadius: '1px',
      }} />
      {/* Left */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: 0,
        transform: 'translateY(-50%)',
        width: `${armLen}px`,
        height: `${thickness}px`,
        background: activeColor,
        boxShadow: `0 0 4px ${activeColor}`,
        borderRadius: '1px',
      }} />
      {/* Right */}
      <div style={{
        position: 'absolute',
        top: '50%',
        right: 0,
        transform: 'translateY(-50%)',
        width: `${armLen}px`,
        height: `${thickness}px`,
        background: activeColor,
        boxShadow: `0 0 4px ${activeColor}`,
        borderRadius: '1px',
      }} />
      {/* Center dot */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: `${hitMarker ? 4 : 2}px`,
        height: `${hitMarker ? 4 : 2}px`,
        background: activeColor,
        borderRadius: '50%',
        boxShadow: hitMarker ? `0 0 8px ${activeColor}, 0 0 16px ${activeColor}` : 'none',
        transition: 'all 0.1s ease',
      }} />

      {/* Hit marker X lines */}
      {hitMarker && (
        <>
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%) rotate(45deg)',
            width: `${size * 0.6}px`,
            height: `${thickness}px`,
            background: '#ff4500',
            boxShadow: '0 0 8px #ff4500',
            animation: 'hitMarkerFlash 0.2s ease-out',
          }} />
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%) rotate(-45deg)',
            width: `${size * 0.6}px`,
            height: `${thickness}px`,
            background: '#ff4500',
            boxShadow: '0 0 8px #ff4500',
            animation: 'hitMarkerFlash 0.2s ease-out',
          }} />
        </>
      )}

      <style>{`
        @keyframes hitMarkerFlash {
          from { opacity: 1; transform: translate(-50%, -50%) rotate(45deg) scale(1.5); }
          to { opacity: 1; transform: translate(-50%, -50%) rotate(45deg) scale(1); }
        }
      `}</style>
    </div>
  );
};

export default Crosshair;
