import React, { useRef, useState, useEffect, useImperativeHandle, forwardRef, useMemo } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { useFrame, RootState } from '@react-three/fiber';
import { Points, BufferGeometry, NormalBufferAttributes, Material } from 'three';
import { MercModel } from './MercModel'; // Import MercModel for remote players
import { JackalopeModel } from './JackalopeModel'; // Import the new JackalopeModel
import { RemotePlayerAudio } from '../components/RemotePlayerAudio'; // Import RemotePlayerAudio component
import { log, DEBUG_LEVELS } from '../utils/debugUtils'; // Import new debug utilities

// Define the RemotePlayerData interface locally to match MultiplayerManager
interface RemotePlayerData {
  playerId: string;
  position: { x: number, y: number, z: number };
  rotation: number;
  playerType?: 'merc' | 'jackalope';
  isMoving?: boolean;
  isRunning?: boolean;
  isShooting?: boolean;
} 