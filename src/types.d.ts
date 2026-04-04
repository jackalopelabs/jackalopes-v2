// Global type declarations for window properties
interface Window {
  __setGraphicsQuality?: (quality: 'auto' | 'high' | 'medium' | 'low') => void;
  __shotBroadcast?: ((shot: any) => any) | undefined;
  __setDebugLevel?: (level: number) => void;
  __playMercShot?: () => void;
  __playerShots?: Record<string, () => boolean>;
  __triggerShot?: (id?: string) => string;
  __toggleNetworkLogs?: (verbose: boolean) => string;
  connectionManager?: any;
  __networkManager?: {
    sendRespawnRequest: (playerId: string, spawnPosition?: [number, number, number]) => void;
  };
  
  jackalopesGame?: {
    playerType?: 'merc' | 'jackalope';
    levaPanelState?: 'open' | 'closed';
    flashlightOn?: boolean;
    debugLevel?: number;
    spawnManager?: {
      baseSpawnX: number;
      currentSpawnX: number;
      stepSize: number;
      minX: number;
      getNextSpawnPoint: () => [number, number, number];
      resetSpawnPoints: () => [number, number, number];
      getSpawnPoint: () => [number, number, number];
    };
  };
  
  playerPositionTracker?: {
    updatePosition: (newPos: THREE.Vector3) => void;
  };
  
  __lastHitJackalope?: string;
}

// Add colored console functionality
interface Console {
  debug: (message?: any, ...optionalParams: any[]) => void;
  warn: (message?: any, ...optionalParams: any[]) => void;
  error: (message?: any, ...optionalParams: any[]) => void;
  info: (message?: any, ...optionalParams: any[]) => void;
} 