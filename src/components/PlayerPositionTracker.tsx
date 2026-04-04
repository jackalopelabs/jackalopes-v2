import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { log, DEBUG_LEVELS, isDebugEnabled } from '../utils/debugUtils';

interface PlayerPositionTrackerProps {
  playerRef: React.RefObject<any>;
  playerPosition: React.RefObject<THREE.Vector3>;
}

// This component tracks the player's position and makes it available globally
export const PlayerPositionTracker: React.FC<PlayerPositionTrackerProps> = ({ 
  playerRef, 
  playerPosition 
}) => {
  const lastReportedPosition = useRef<THREE.Vector3>(new THREE.Vector3());
  const updateInterval = useRef<number | null>(null);
  
  // Set up global position tracker
  useEffect(() => {
    // Initialize the global tracker
    if (!window.playerPositionTracker) {
      window.playerPositionTracker = {
        updatePosition: (newPos: THREE.Vector3) => {
          if (isDebugEnabled(DEBUG_LEVELS.VERBOSE)) {
            log.player(`Player position updated to ${newPos.x.toFixed(2)}, ${newPos.y.toFixed(2)}, ${newPos.z.toFixed(2)}`);
          }
          
          if (playerPosition.current) {
            playerPosition.current.copy(newPos);
          }
        }
      };
    }
    
    // Set up interval to update position
    updateInterval.current = window.setInterval(() => {
      if (playerRef.current && playerPosition.current) {
        // Get current position from player ref - handle different object types
        let currentPos = new THREE.Vector3();
        
        try {
          // Check if playerRef has getWorldPosition method (THREE.Object3D)
          if (typeof playerRef.current.getWorldPosition === 'function') {
            currentPos = playerRef.current.getWorldPosition(new THREE.Vector3());
          } 
          // Check if playerRef has position property (direct Vector3)
          else if (playerRef.current.position instanceof THREE.Vector3) {
            currentPos.copy(playerRef.current.position);
          }
          // Check if playerRef has a position property object with x,y,z
          else if (playerRef.current.position && 
                  typeof playerRef.current.position.x === 'number' &&
                  typeof playerRef.current.position.y === 'number' &&
                  typeof playerRef.current.position.z === 'number') {
            currentPos.set(
              playerRef.current.position.x,
              playerRef.current.position.y,
              playerRef.current.position.z
            );
          }
          // Check if playerRef is a Vector3 directly
          else if (playerRef.current instanceof THREE.Vector3) {
            currentPos.copy(playerRef.current);
          }
          // Check if playerRef is a plain object with x,y,z properties
          else if (typeof playerRef.current.x === 'number' &&
                  typeof playerRef.current.y === 'number' &&
                  typeof playerRef.current.z === 'number') {
            currentPos.set(
              playerRef.current.x,
              playerRef.current.y,
              playerRef.current.z
            );
          }
          
          // Check if position has changed significantly
          if (currentPos.distanceTo(lastReportedPosition.current) > 0.1) {
            // Update the reference
            playerPosition.current.copy(currentPos);
            lastReportedPosition.current.copy(currentPos);
            
            if (isDebugEnabled(DEBUG_LEVELS.ALL)) {
              log.player(`Player position tracked: ${currentPos.x.toFixed(2)}, ${currentPos.y.toFixed(2)}, ${currentPos.z.toFixed(2)}`);
            }
          }
        } catch (error) {
          // Suppress errors to prevent console spam
          if (isDebugEnabled(DEBUG_LEVELS.ERROR)) {
            log.error(`Error accessing player position: ${error}`);
          }
        }
      }
    }, 100); // Update 10 times per second
    
    if (isDebugEnabled(DEBUG_LEVELS.INFO)) {
      log.player('Player position tracker initialized');
    }
    
    // Clean up
    return () => {
      if (updateInterval.current) {
        window.clearInterval(updateInterval.current);
      }
      if (isDebugEnabled(DEBUG_LEVELS.INFO)) {
        log.player('Player position tracker destroyed');
      }
    };
  }, [playerRef, playerPosition]);
  
  // This component doesn't render anything
  return null;
}; 