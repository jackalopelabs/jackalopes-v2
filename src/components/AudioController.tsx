import { useEffect, useState } from 'react';
import { useControls } from 'leva';
import { WeaponSoundSettings } from './WeaponSoundEffects';

/**
 * AudioController component allows for controlling and debugging audio settings
 * This component doesn't render anything visible but provides UI controls
 * for adjusting audio parameters
 */
export const AudioController = () => {
  const [audioInitialized, setAudioInitialized] = useState(false);
  
  // Load saved preferences from localStorage
  const loadSavedPreferences = () => {
    try {
      const savedSettings = localStorage.getItem('audioSettings');
      if (savedSettings) {
        return JSON.parse(savedSettings);
      }
    } catch (error) {
      console.error('Error loading saved audio preferences:', error);
    }
    return null;
  };
  
  // Get saved preferences or defaults
  const savedPreferences = loadSavedPreferences() || {};
  
  // Set up standard audio settings controls
  const { 
    masterVolume,
    footstepsEnabled,
    walkingVolume, 
    runningVolume,
    spatialAudioEnabled,
    remoteSoundsEnabled, // Add new control for remote player sounds
    muteAll // Add global mute control
  } = useControls('Audio Settings', {
    masterVolume: {
      value: savedPreferences.masterVolume ?? 1.0, 
      min: 0, 
      max: 1,
      step: 0.05,
    },
    muteAll: {
      value: savedPreferences.muteAll ?? false,
      label: '🔇 Mute All Audio'
    },
    footstepsEnabled: {
      value: savedPreferences.footstepsEnabled ?? true,
      label: 'Footsteps Enabled'
    },
    remoteSoundsEnabled: {
      value: savedPreferences.remoteSoundsEnabled ?? true,
      label: '👥 Remote Player Sounds'
    },
    spatialAudioEnabled: {
      value: savedPreferences.spatialAudioEnabled ?? true,
      label: 'Spatial Audio'
    },
    walkingVolume: {
      value: savedPreferences.walkingVolume ?? 0.3, 
      min: 0, 
      max: 1,
      step: 0.05,
      label: 'Walking Volume'
    },
    runningVolume: {
      value: savedPreferences.runningVolume ?? 0.4, 
      min: 0, 
      max: 1,
      step: 0.05,
      label: 'Running Volume'
    }
  });
  
  // Add weapon volume control separately to avoid TypeScript issues
  useControls('Weapon Sounds', {
    weaponVolume: {
      value: savedPreferences.weaponVolume ?? WeaponSoundSettings.volume,
      min: 0,
      max: 1,
      step: 0.05,
      label: 'Weapon Volume',
      onChange: (value) => {
        if (window.__setWeaponVolume) {
          window.__setWeaponVolume(value);
        }
      }
    }
  });
  
  // Save preferences to localStorage when settings change
  useEffect(() => {
    if (!audioInitialized) {
      setAudioInitialized(true);
      return;
    }
    
    // Save preferences to localStorage
    try {
      const settingsToSave = {
        masterVolume,
        muteAll,
        footstepsEnabled,
        walkingVolume,
        runningVolume,
        spatialAudioEnabled,
        remoteSoundsEnabled,
        weaponVolume: window.__getWeaponVolume?.() ?? WeaponSoundSettings.volume
      };
      
      localStorage.setItem('audioSettings', JSON.stringify(settingsToSave));
      console.log('[AudioController] Saved audio settings to localStorage:', settingsToSave);
    } catch (error) {
      console.error('Error saving audio preferences:', error);
    }
    
    // Apply mute all setting if enabled
    const effectiveMasterVolume = muteAll ? 0 : masterVolume;
    
    // Apply mute setting directly to WeaponSoundSettings
    WeaponSoundSettings.setMuted(muteAll);
    console.log(`[AudioController] Updated WeaponSoundSettings.masterMuted: ${muteAll}`);
    
    // Create the event detail object
    const eventDetail = {
      masterVolume: effectiveMasterVolume,
      footstepsEnabled,
      walkingVolume,
      runningVolume,
      spatialAudioEnabled,
      remoteSoundsEnabled,
      muteAll
    };
    
    // Dispatch event with the current audio settings
    window.dispatchEvent(new CustomEvent('audioSettingsChanged', {
      detail: eventDetail
    }));
    console.log('[AudioController] Dispatched audioSettingsChanged event:', eventDetail);
    
    // Also dispatch a specific event for remote sounds toggle
    window.dispatchEvent(new CustomEvent('remoteSoundsToggled', {
      detail: {
        enabled: remoteSoundsEnabled && !muteAll
      }
    }));
    
    // Apply mute to any active AudioContext if available
    if (typeof window !== 'undefined') {
      // Test if we need to force update audio contexts
      if (muteAll && window.AudioContext) {
        try {
          // Create a silent context to ensure all contexts get the message
          const silentCtx = new AudioContext();
          silentCtx.suspend();
          console.log('[AudioController] Created and suspended a silent AudioContext for mute state');
        } catch (e) {
          console.error('[AudioController] Error managing audio contexts:', e);
        }
      }
    }
    
    console.log('[AudioController] Audio settings updated:', {
      masterVolume: effectiveMasterVolume,
      muteAll,
      footstepsEnabled,
      walkingVolume,
      runningVolume,
      spatialAudioEnabled,
      remoteSoundsEnabled
    });
  }, [
    masterVolume, 
    muteAll,
    footstepsEnabled, 
    walkingVolume, 
    runningVolume, 
    spatialAudioEnabled,
    remoteSoundsEnabled,
    audioInitialized
  ]);
  
  // This component doesn't render anything visible
  return null;
};

// Update TypeScript declaration for window.__getWeaponVolume
declare global {
  interface Window {
    __getWeaponVolume?: () => number;
  }
} 