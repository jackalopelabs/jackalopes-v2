import React, { useState, useEffect } from 'react';
import { WeaponSoundSettings } from './WeaponSoundEffects';

interface AudioToggleButtonProps {
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  initialState?: boolean;
  showRemoteToggle?: boolean; // This prop will be ignored but kept for backward compatibility
}

/**
 * AudioToggleButton - A floating button to toggle audio mute/unmute
 * 
 * This component provides a simple UI to quickly mute/unmute all sounds
 */
export const AudioToggleButton: React.FC<AudioToggleButtonProps> = ({
  position = 'bottom-right',
  initialState = true,
}) => {
  // State for master audio (all sounds)
  const [audioEnabled, setAudioEnabled] = useState(initialState);
  
  // Load saved preferences on mount
  useEffect(() => {
    try {
      const savedSettings = localStorage.getItem('audioSettings');
      if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        // If we have saved settings, use those instead of initialState
        if (settings.muteAll !== undefined) {
          console.log('[AudioToggleButton] Initializing from localStorage, muteAll:', settings.muteAll);
          setAudioEnabled(!settings.muteAll);
          // Also update WeaponSoundSettings directly
          WeaponSoundSettings.setMuted(settings.muteAll);
        }
      }
    } catch (error) {
      console.error('Error loading audio preferences:', error);
    }
  }, []);

  // Listen for changes from the AudioController
  useEffect(() => {
    const handleAudioSettingsChanged = (event: CustomEvent<{masterVolume: number, muteAll?: boolean}>) => {
      console.log('[AudioToggleButton] Received audioSettingsChanged event:', event.detail);
      const isMuted = event.detail.muteAll === true;
      setAudioEnabled(!isMuted);
      // Also ensure WeaponSoundSettings is updated
      WeaponSoundSettings.setMuted(isMuted);
    };
    
    window.addEventListener('audioSettingsChanged', handleAudioSettingsChanged as EventListener);
    
    return () => {
      window.removeEventListener('audioSettingsChanged', handleAudioSettingsChanged as EventListener);
    };
  }, []);
  
  // Position styles based on the position prop
  const getPositionStyle = () => {
    switch (position) {
      case 'top-left':
        return { top: '20px', left: '20px' };
      case 'top-right':
        return { top: '20px', right: '20px' };
      case 'bottom-left':
        return { bottom: '20px', left: '20px' };
      case 'bottom-right':
      default:
        return { bottom: '20px', right: '20px' };
    }
  };
  
  // Toggle master audio
  const toggleAudio = () => {
    const newState = !audioEnabled;
    console.log(`[AudioToggleButton] Toggling audio to ${newState ? 'enabled' : 'disabled'}`);
    setAudioEnabled(newState);
    
    // Always update localStorage
    try {
      const savedSettings = localStorage.getItem('audioSettings');
      const settings = savedSettings ? JSON.parse(savedSettings) : {};
      
      // Update with new state
      settings.muteAll = !newState;
      localStorage.setItem('audioSettings', JSON.stringify(settings));
      console.log('[AudioToggleButton] Saved to localStorage, muteAll:', settings.muteAll);
    } catch (error) {
      console.error('Error saving audio preferences:', error);
    }
    
    // Update WeaponSoundSettings directly
    WeaponSoundSettings.setMuted(!newState);
    console.log(`[AudioToggleButton] Updated WeaponSoundSettings.masterMuted: ${!newState}`);
    
    // Dispatch event that AudioController listens for
    const eventDetail = {
      masterVolume: newState ? 1.0 : 0.0,
      muteAll: !newState, // Add the muteAll property explicitly
      footstepsEnabled: true,
      walkingVolume: 0.3,
      runningVolume: 0.4,
      spatialAudioEnabled: true,
      remoteSoundsEnabled: true
    };
    
    window.dispatchEvent(new CustomEvent('audioSettingsChanged', { detail: eventDetail }));
    console.log('[AudioToggleButton] Dispatched audioSettingsChanged event:', eventDetail);
    
    // Force update to all audio context-based components
    if (typeof window !== 'undefined' && window.AudioContext) {
      // Create a silent audio context to force browsers to wake up the audio system
      try {
        const tempContext = new AudioContext();
        const oscillator = tempContext.createOscillator();
        const gainNode = tempContext.createGain();
        gainNode.gain.value = 0; // Completely silent
        oscillator.connect(gainNode);
        gainNode.connect(tempContext.destination);
        oscillator.start();
        oscillator.stop(tempContext.currentTime + 0.001); // Stop after 1ms
        console.log('[AudioToggleButton] Created silent audio context to wake up audio system');
      } catch (e) {
        console.error('[AudioToggleButton] Failed to create silent audio context:', e);
      }
    }
    
    // Log the action for debugging
    console.log(`[AudioToggleButton] Audio ${newState ? 'unmuted' : 'muted'} from toggle button`);
  };
  
  // SVG icons for the audio button
  const MutedIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" width="24" height="24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
    </svg>
  );
  
  const UnmutedIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" width="24" height="24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
    </svg>
  );
  
  return (
    <div style={{
      position: 'fixed',
      ...getPositionStyle(),
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      zIndex: 1000
    }}>
      {/* Simplified audio toggle button with SVG icons */}
      <button 
        onClick={toggleAudio}
        style={{
          width: '50px',
          height: '50px',
          borderRadius: '50%',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          border: 'none',
          color: 'white',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 5px rgba(0,0,0,0.3)'
        }}
        title={audioEnabled ? 'Mute Sound' : 'Unmute Sound'}
      >
        {audioEnabled ? <UnmutedIcon /> : <MutedIcon />}
      </button>
    </div>
  );
}; 