// SoundManager.ts
// Central sound management system for consistent audio across all entities

import * as THREE from 'three';
import { AudioListener } from 'three';
import entityStateObserver, { EntityState } from '../network/EntityStateObserver';
import { log, DEBUG_LEVELS, isDebugEnabled } from '../utils/debugUtils';

// Import the sounds
import { Sounds } from '../assets';

export interface SoundSettings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  footstepsEnabled: boolean;
  spatialAudioEnabled: boolean;
  remoteSoundsEnabled: boolean;
}

// Add type declaration for global audio methods
declare global {
  interface Window {
    __soundManager?: SoundManager;
    __playSound?: (soundId: string, options?: any) => boolean;
    __muteAllSounds?: () => void;
    __unmuteAllSounds?: () => void;
  }
}

// Sound types for better organization
export type SoundType = 'footstep' | 'weapon' | 'ambient' | 'ui' | 'voice';

// Sound details including metadata
export interface SoundDef {
  id: string;
  path: string;
  type: SoundType;
  volume: number;
  loop?: boolean;
  spatialize?: boolean;
  maxDistance?: number;
  rolloffFactor?: number;
  refDistance?: number;
}

export class SoundManager {
  private listener: AudioListener | null = null;
  private camera: THREE.Camera | null = null;
  private sounds: Map<string, THREE.Audio | THREE.PositionalAudio> = new Map();
  private entities: Map<string, Map<string, THREE.PositionalAudio>> = new Map();
  private loadedBuffers: Map<string, AudioBuffer> = new Map();
  private audioLoader = new THREE.AudioLoader();
  private soundsEnabled = true;
  private globalVolume = 1.0;
  private initialized = false;
  
  // Default sound settings
  private settings: SoundSettings = {
    masterVolume: 0.8,
    musicVolume: 0.5,
    sfxVolume: 1.0,
    footstepsEnabled: true,
    spatialAudioEnabled: true,
    remoteSoundsEnabled: true
  };
  
  constructor() {
    // Create a global reference for debugging
    if (typeof window !== 'undefined') {
      window.__soundManager = this;
      window.__playSound = this.playSound.bind(this);
      window.__muteAllSounds = this.muteAll.bind(this);
      window.__unmuteAllSounds = this.unmuteAll.bind(this);
    }
    
    // Listen for entity events from the observer
    this.setupEntityListeners();
    
    // Auto-initialize after a short delay
    setTimeout(() => {
      if (!this.initialized) {
        this.init();
      }
    }, 1000);
  }
  
  /**
   * Initialize the sound manager with the camera's audio listener
   */
  init(camera?: THREE.Camera): void {
    try {
      // If a camera is provided, use it
      this.camera = camera || this.camera;
      
      // If we still don't have a camera, try to find the default camera
      if (!this.camera && typeof window !== 'undefined') {
        const scene = document.querySelector('canvas')?.['__r3f']?.scene;
        if (scene) {
          this.camera = scene.children.find(child => child instanceof THREE.PerspectiveCamera);
        }
      }
      
      if (!this.camera) {
        log.warn('No camera available for SoundManager, will retry later');
        return;
      }
      
      // Check if camera already has a listener
      const existingListener = this.camera.children.find(
        child => child instanceof THREE.AudioListener
      ) as THREE.AudioListener | undefined;
      
      if (existingListener) {
        this.listener = existingListener;
      } else {
        // Create a new listener
        this.listener = new THREE.AudioListener();
        this.camera.add(this.listener);
      }
      
      // Pre-load common sounds
      this.preloadSounds([
        {
          id: 'merc_footstep_walk',
          path: Sounds.Footsteps.MercWalking.path,
          type: 'footstep',
          volume: 0.3,
          spatialize: true,
          maxDistance: 40,
          rolloffFactor: 1.5,
          refDistance: 5
        },
        {
          id: 'merc_footstep_run',
          path: Sounds.Footsteps.MercRunning.path,
          type: 'footstep',
          volume: 0.4,
          spatialize: true,
          maxDistance: 60,
          rolloffFactor: 1.2,
          refDistance: 10
        },
        {
          id: 'merc_shot',
          path: Sounds.Weapons.MercShot.path,
          type: 'weapon',
          volume: 0.8,
          spatialize: true,
          maxDistance: 150,
          rolloffFactor: 1.0,
          refDistance: 20
        },
        {
          id: 'jackalope_footstep_walk',
          path: Sounds.Footsteps.JackalopeWalking.path,
          type: 'footstep',
          volume: 0.15, // Lower volume for jackalope
          spatialize: true,
          maxDistance: 20,
          rolloffFactor: 1.8,
          refDistance: 3
        },
        {
          id: 'jackalope_footstep_run',
          path: Sounds.Footsteps.JackalopeRunning.path,
          type: 'footstep',
          volume: 0.2, // Lower volume for jackalope
          spatialize: true,
          maxDistance: 30,
          rolloffFactor: 1.5,
          refDistance: 5
        }
      ]);
      
      this.initialized = true;
      log.info('SoundManager initialized');
    } catch (error) {
      log.error('Error initializing SoundManager:', error);
    }
  }
  
  /**
   * Set up listeners for entity events from EntityStateObserver
   */
  private setupEntityListeners(): void {
    // When an entity shoots, play the appropriate sound
    entityStateObserver.on('entityShot', (entity: EntityState) => {
      if (!this.soundsEnabled || !this.settings.remoteSoundsEnabled) return;
      
      const soundId = entity.type === 'merc' ? 'merc_shot' : 'jackalope_footstep_run';
      this.playSoundForEntity(entity.id, soundId);
      
      if (isDebugEnabled(DEBUG_LEVELS.INFO)) {
        log.info(`Playing shot sound for ${entity.id} (${entity.type})`);
      }
    });
    
    // When an entity moves, play the appropriate footstep sound
    entityStateObserver.on('entityMoved', (entity: EntityState) => {
      if (!this.soundsEnabled || !this.settings.footstepsEnabled || !this.settings.remoteSoundsEnabled) return;
      
      // Only play sounds for remote entities
      if (entity.id === entityStateObserver.getLocalEntity()?.id) return;
      
      if (entity.isRunning) {
        const soundId = entity.type === 'merc' ? 'merc_footstep_run' : 'jackalope_footstep_run';
        this.playSoundForEntity(entity.id, soundId, { loop: true });
      } else if (entity.isMoving) {
        const soundId = entity.type === 'merc' ? 'merc_footstep_walk' : 'jackalope_footstep_walk';
        this.playSoundForEntity(entity.id, soundId, { loop: true });
      } else {
        // Stop all movement sounds
        this.stopEntitySound(entity.id, 'merc_footstep_walk');
        this.stopEntitySound(entity.id, 'merc_footstep_run');
        this.stopEntitySound(entity.id, 'jackalope_footstep_walk');
        this.stopEntitySound(entity.id, 'jackalope_footstep_run');
      }
    });
    
    // Clean up entity sounds when they're removed
    entityStateObserver.on('entityRemoved', (entity: EntityState) => {
      this.cleanupEntitySounds(entity.id);
    });
  }
  
  /**
   * Update the position of all entity sounds based on current entity positions
   */
  update(): void {
    if (!this.soundsEnabled || !this.initialized) return;
    
    // Get all entities from the observer
    const entities = entityStateObserver.getAllEntities();
    
    // Update the position of each entity's sounds
    for (const [entityId, entity] of Object.entries(entities)) {
      const entitySounds = this.entities.get(entityId);
      if (!entitySounds) continue;
      
      // Update position for each sound
      for (const sound of entitySounds.values()) {
        if (sound && sound.isPositionalAudio) {
          sound.position.set(entity.position[0], entity.position[1], entity.position[2]);
        }
      }
    }
  }
  
  /**
   * Pre-load multiple sounds at once
   */
  private preloadSounds(soundDefs: SoundDef[]): void {
    soundDefs.forEach(def => {
      this.preloadSound(def);
    });
  }
  
  /**
   * Pre-load a sound for later use
   */
  private preloadSound(soundDef: SoundDef): void {
    // Skip if already loaded
    if (this.loadedBuffers.has(soundDef.id)) return;
    
    this.audioLoader.load(
      soundDef.path,
      (buffer) => {
        this.loadedBuffers.set(soundDef.id, buffer);
        if (isDebugEnabled(DEBUG_LEVELS.INFO)) {
          log.info(`Preloaded sound: ${soundDef.id}`);
        }
      },
      undefined,
      (error) => {
        log.error(`Error loading sound ${soundDef.id}:`, error);
      }
    );
  }
  
  /**
   * Play a specific sound, creating it if needed
   */
  playSound(soundId: string, options: any = {}): boolean {
    if (!this.soundsEnabled || !this.initialized || !this.listener) return false;
    
    try {
      // Get buffer or load it
      let buffer = this.loadedBuffers.get(soundId);
      if (!buffer) {
        if (isDebugEnabled(DEBUG_LEVELS.INFO)) {
          log.info(`Sound ${soundId} not preloaded, trying to load on demand`);
        }
        // Return false but start loading for next time
        if (options.path) {
          this.preloadSound({
            id: soundId,
            path: options.path,
            type: options.type || 'sfx',
            volume: options.volume || 1.0
          });
        }
        return false;
      }
      
      // Get existing sound or create new one
      let sound = this.sounds.get(soundId);
      if (!sound) {
        // Create a new sound
        if (options.spatialize) {
          sound = new THREE.PositionalAudio(this.listener);
          this.configureSpatialAudio(
            sound as THREE.PositionalAudio, 
            options.refDistance, 
            options.maxDistance, 
            options.rolloffFactor
          );
        } else {
          sound = new THREE.Audio(this.listener);
        }
        
        // Set up the sound
        sound.setBuffer(buffer);
        sound.setLoop(options.loop || false);
        sound.setVolume(options.volume * this.settings.masterVolume * this.globalVolume);
        
        // Save the sound for reuse
        this.sounds.set(soundId, sound);
      }
      
      // If already playing, don't restart
      if (sound.isPlaying) {
        return true;
      }
      
      // Stop previous playback if any
      if (sound.source) {
        sound.stop();
      }
      
      // Update settings in case they changed
      sound.setVolume(options.volume * this.settings.masterVolume * this.globalVolume);
      sound.setLoop(options.loop || false);
      
      // Play the sound
      sound.play();
      return true;
    } catch (error) {
      log.error(`Error playing sound ${soundId}:`, error);
      return false;
    }
  }
  
  /**
   * Play a sound attached to a specific entity
   */
  playSoundForEntity(entityId: string, soundId: string, options: any = {}): boolean {
    if (!this.soundsEnabled || !this.initialized || !this.listener) return false;
    
    try {
      // Get the entity position
      const entity = entityStateObserver.getEntity(entityId);
      if (!entity) {
        if (isDebugEnabled(DEBUG_LEVELS.INFO)) {
          log.info(`Cannot play sound for entity ${entityId}: entity not found`);
        }
        return false;
      }
      
      // Get entity sounds map or create it
      let entitySounds = this.entities.get(entityId);
      if (!entitySounds) {
        entitySounds = new Map();
        this.entities.set(entityId, entitySounds);
      }
      
      // Get buffer
      let buffer = this.loadedBuffers.get(soundId);
      if (!buffer) {
        if (isDebugEnabled(DEBUG_LEVELS.INFO)) {
          log.info(`Sound ${soundId} not preloaded for entity ${entityId}`);
        }
        return false;
      }
      
      // Get existing sound or create new one
      let sound = entitySounds.get(soundId);
      if (!sound) {
        // Create a new positional audio source
        sound = new THREE.PositionalAudio(this.listener);
        
        // Configure the spatial audio
        this.configureSpatialAudio(
          sound,
          options.refDistance || 10,
          options.maxDistance || 100,
          options.rolloffFactor || 1.5
        );
        
        // Set up the sound
        sound.setBuffer(buffer);
        sound.setLoop(options.loop || false);
        
        // Adjust volume based on entity type (e.g., jackalobes quieter than mercs)
        const volumeScale = entity.type === 'jackalope' ? 0.3 : 1.0;
        sound.setVolume(
          (options.volume || 1.0) * 
          this.settings.masterVolume * 
          this.globalVolume *
          volumeScale
        );
        
        // Set initial position
        sound.position.set(entity.position[0], entity.position[1], entity.position[2]);
        
        // Save the sound
        entitySounds.set(soundId, sound);
      }
      
      // Handle conflicts with running/walking sounds
      if (soundId === 'merc_footstep_walk' || soundId === 'jackalope_footstep_walk') {
        // Stop running sound if playing walk sound
        this.stopEntitySound(entityId, entity.type === 'merc' ? 'merc_footstep_run' : 'jackalope_footstep_run');
      } else if (soundId === 'merc_footstep_run' || soundId === 'jackalope_footstep_run') {
        // Stop walking sound if playing run sound
        this.stopEntitySound(entityId, entity.type === 'merc' ? 'merc_footstep_walk' : 'jackalope_footstep_walk');
      }
      
      // If the sound is already playing and it's a looping sound, we don't need to restart
      if (sound.isPlaying && options.loop) {
        return true;
      }
      
      // Update volume in case settings changed
      const volumeScale = entity.type === 'jackalope' ? 0.3 : 1.0;
      sound.setVolume(
        (options.volume || 1.0) * 
        this.settings.masterVolume * 
        this.globalVolume *
        volumeScale
      );
      
      // Update loop setting
      sound.setLoop(options.loop || false);
      
      // Stop the sound if it's already playing
      if (sound.isPlaying) {
        sound.stop();
      }
      
      // Update position before playing
      sound.position.set(entity.position[0], entity.position[1], entity.position[2]);
      
      // Play the sound
      sound.play();
      
      return true;
    } catch (error) {
      log.error(`Error playing sound for entity ${entityId}:`, error);
      return false;
    }
  }
  
  /**
   * Stop a sound for a specific entity
   */
  stopEntitySound(entityId: string, soundId: string): void {
    const entitySounds = this.entities.get(entityId);
    if (!entitySounds) return;
    
    const sound = entitySounds.get(soundId);
    if (sound && sound.isPlaying) {
      sound.stop();
    }
  }
  
  /**
   * Configure spatial audio parameters
   */
  private configureSpatialAudio(
    audio: THREE.PositionalAudio,
    refDistance: number = 10,
    maxDistance: number = 100,
    rolloffFactor: number = 1.5
  ): void {
    audio.setDistanceModel('exponential');
    audio.setRefDistance(refDistance);
    audio.setMaxDistance(maxDistance);
    audio.setRolloffFactor(rolloffFactor);
  }
  
  /**
   * Clean up all sounds for an entity
   */
  private cleanupEntitySounds(entityId: string): void {
    const entitySounds = this.entities.get(entityId);
    if (!entitySounds) return;
    
    // Stop and cleanup all sounds
    for (const [soundId, sound] of entitySounds.entries()) {
      if (sound.isPlaying) {
        sound.stop();
      }
    }
    
    // Remove the entity from our tracking
    this.entities.delete(entityId);
    
    if (isDebugEnabled(DEBUG_LEVELS.INFO)) {
      log.info(`Cleaned up all sounds for entity ${entityId}`);
    }
  }
  
  /**
   * Mute all sounds
   */
  muteAll(): void {
    this.soundsEnabled = false;
    
    // Stop all non-entity sounds
    for (const sound of this.sounds.values()) {
      if (sound.isPlaying) {
        sound.stop();
      }
    }
    
    // Stop all entity sounds
    for (const entitySounds of this.entities.values()) {
      for (const sound of entitySounds.values()) {
        if (sound.isPlaying) {
          sound.stop();
        }
      }
    }
    
    if (isDebugEnabled(DEBUG_LEVELS.INFO)) {
      log.info('All sounds muted');
    }
  }
  
  /**
   * Unmute all sounds
   */
  unmuteAll(): void {
    this.soundsEnabled = true;
    if (isDebugEnabled(DEBUG_LEVELS.INFO)) {
      log.info('Sounds enabled');
    }
  }
  
  /**
   * Update sound settings
   */
  updateSettings(settings: Partial<SoundSettings>): void {
    this.settings = { ...this.settings, ...settings };
    
    // Broadcast settings change event for other components
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('audioSettingsChanged', { 
        detail: this.settings 
      }));
    }
    
    if (isDebugEnabled(DEBUG_LEVELS.INFO)) {
      log.info('Sound settings updated:', this.settings);
    }
  }
  
  /**
   * Get current sound settings
   */
  getSettings(): SoundSettings {
    return { ...this.settings };
  }
}

// Create a singleton instance
export const soundManager = new SoundManager();

// Export the singleton instance
export default soundManager; 