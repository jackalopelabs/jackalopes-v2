import React, { useState, useEffect } from 'react';
import { IntroScreen } from './IntroScreen';

interface IntroScreenManagerProps {
  playerType: 'merc' | 'jackalope';
  visible?: boolean;
  onClose?: () => void;
}

/**
 * IntroScreenManager handles displaying the intro screen at the appropriate time
 * and remembering when it has been shown for each player type
 */
export const IntroScreenManager: React.FC<IntroScreenManagerProps> = ({ 
  playerType,
  visible: externalVisible,
  onClose: externalOnClose
}) => {
  const [internalVisible, setInternalVisible] = useState(false);
  
  // Combine internal and external visibility
  const isVisible = externalVisible !== undefined ? externalVisible : internalVisible;
  
  // Check if we should show the intro screen when player type changes
  useEffect(() => {
    if (!playerType) return;
    
    // Only auto-show if external visibility control is not provided
    if (externalVisible !== undefined) return;
    
    // Check if we've already shown the intro for this player type
    const introKey = `intro_shown_${playerType}`;
    const introShown = localStorage.getItem(introKey) === 'true';
    
    if (!introShown) {
      console.log(`Showing intro screen for ${playerType}`);
      // Show intro after a short delay to let the game initialize
      const timerId = window.setTimeout(() => {
        setInternalVisible(true);
      }, 1000);
      
      return () => window.clearTimeout(timerId);
    }
  }, [playerType, externalVisible]);
  
  // Function to handle closing the intro screen
  const handleCloseIntro = () => {
    // Update internal state
    setInternalVisible(false);
    
    // Call external onClose if provided
    if (externalOnClose) {
      externalOnClose();
    } else {
      // Remember that we've shown this intro (only if handling internally)
      if (playerType) {
        const introKey = `intro_shown_${playerType}`;
        localStorage.setItem(introKey, 'true');
      }
    }
  };
  
  return (
    <IntroScreen 
      playerType={playerType}
      visible={isVisible}
      onClose={handleCloseIntro}
    />
  );
}; 