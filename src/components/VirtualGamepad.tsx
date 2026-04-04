import React, { useEffect, useRef, useState } from 'react';
import nipplejs, { JoystickManager, JoystickOutputData } from 'nipplejs';
import './VirtualGamepad.css';

interface VirtualGamepadProps {
  onMove: (x: number, y: number) => void;
  onJump: () => void;
  onShoot: () => void;
  visible: boolean;
}

// SVG Icons as components
const JumpIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="gamepad-icon">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" />
  </svg>
);

const FireIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="gamepad-icon">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 0 0 .495-7.468 5.99 5.99 0 0 0-1.925 3.547 5.975 5.975 0 0 1-2.133-1.001A3.75 3.75 0 0 0 12 18Z" />
  </svg>
);

export const VirtualGamepad: React.FC<VirtualGamepadProps> = ({ 
  onMove, onJump, onShoot, visible 
}) => {
  const joystickRef = useRef<HTMLDivElement>(null);
  const joystickManagerRef = useRef<JoystickManager | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Track whether we're in a simulator
  const [isSimulator, setIsSimulator] = useState(false);
  
  // Track button states to prevent continuous firing
  const jumpButtonActive = useRef(false);
  const shootButtonActive = useRef(false);

  // Detect iOS simulator on component mount
  useEffect(() => {
    // Check for simulator - this isn't perfect but can help
    const userAgent = navigator.userAgent.toLowerCase();
    const isIOSSimulator = (
      userAgent.includes('mac') && 
      userAgent.includes('safari') && 
      window.navigator.maxTouchPoints > 0
    );
    setIsSimulator(isIOSSimulator);
  }, []);

  // Initialize NippleJS
  useEffect(() => {
    if (joystickRef.current && visible) {
      // Clean up existing joystick if any
      if (joystickManagerRef.current) {
        joystickManagerRef.current.destroy();
      }

      // Create new joystick with NippleJS
      joystickManagerRef.current = nipplejs.create({
        zone: joystickRef.current,
        mode: 'static',
        position: { left: '50%', top: '50%' },
        color: 'rgba(255, 255, 255, 0.5)',
        size: 120,
        lockX: false,
        lockY: false,
      });

      // Event handling for joystick movement
      joystickManagerRef.current.on('move', (evt, data: JoystickOutputData) => {
        if (data && data.vector) {
          // NippleJS provides normalized vectors between 0-1
          onMove(data.vector.x, data.vector.y);
        }
      });

      // Reset when joystick is released
      joystickManagerRef.current.on('end', () => {
        onMove(0, 0);
      });
    }

    // Cleanup function
    return () => {
      if (joystickManagerRef.current) {
        joystickManagerRef.current.destroy();
        joystickManagerRef.current = null;
      }
    };
  }, [visible, onMove]);
  
  // Handle jump button press
  const handleJumpStart = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Stop event propagation
    
    if (!jumpButtonActive.current) {
      jumpButtonActive.current = true;
      
      // Add some visual feedback
      const target = e.currentTarget as HTMLElement;
      target.classList.add('active');
      
      // Call the jump callback
      console.log("Jump button pressed - triggering jump callback");
      onJump();
      
      // Reset state after delay
      setTimeout(() => {
        jumpButtonActive.current = false;
        if (target) {
          target.classList.remove('active');
        }
      }, 300);
    }
  };
  
  // Handle shoot button press
  const handleShootStart = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Stop event propagation
    
    if (!shootButtonActive.current) {
      shootButtonActive.current = true;
      
      // Add some visual feedback
      const target = e.currentTarget as HTMLElement;
      target.classList.add('active');
      
      // Call the shoot callback
      console.log("Shoot button pressed - triggering shoot callback");
      onShoot();
      
      // Reset state after delay
      setTimeout(() => {
        shootButtonActive.current = false;
        if (target) {
          target.classList.remove('active');
        }
      }, 300);
    }
  };

  if (!visible) return null;

  return (
    <div className="virtual-gamepad" ref={containerRef}>
      {/* Left side - NippleJS Joystick Zone */}
      <div className="joystick-container">
        <div className="joystick" ref={joystickRef}></div>
      </div>
      
      {/* Right side - Action buttons */}
      <div className="action-buttons">
        <button 
          className="action-button jump" 
          onTouchStart={handleJumpStart} 
          onMouseDown={isSimulator ? undefined : handleJumpStart}
          aria-label="Jump"
        >
          <JumpIcon />
        </button>
        <button 
          className="action-button shoot" 
          onTouchStart={handleShootStart} 
          onMouseDown={isSimulator ? undefined : handleShootStart}
          aria-label="Shoot"
        >
          <FireIcon />
        </button>
      </div>
    </div>
  );
}; 