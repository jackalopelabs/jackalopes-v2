import { EventEmitter } from 'events';
import entityStateObserver from './EntityStateObserver';

// Debug level enum
enum LogLevel {
  NONE = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4,
  VERBOSE = 5
}

type GameState = {
  players: Record<string, {
    position: [number, number, number];
    rotation: [number, number, number, number];
    health: number;
    playerType: 'merc' | 'jackalope';
    flashlightOn: boolean;
  }>;
};

// Game snapshot interface for state synchronization
interface GameSnapshot {
  timestamp: number;
  sequence: number;
  players: Record<string, PlayerSnapshot>;
  events: any[];
}

interface PlayerSnapshot {
  id: string;
  position: [number, number, number];
  rotation: [number, number, number, number];
  velocity?: [number, number, number];
  health: number;
  playerType: 'merc' | 'jackalope';
  flashlightOn: boolean;
}

export class ConnectionManager extends EventEmitter {
  private socket: WebSocket | null = null;
  private playerId: string | null = null;
  private isConnected = false;
  private reconnectInterval: number = 1000;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 3;
  private gameState: GameState = { players: {} };
  private reconnectTimeout: number | null = null;
  private keepAliveInterval: number | null = null;

  // Add latency tracking properties
  private pingInterval: number | null = null;
  private pingStartTime: number = 0;
  private latency: number = 100; // Start with a reasonable default
  private useServerPong: boolean = false; // Start with client-side estimation for compatibility
  private pongReceived: boolean = false;
  private offlineMode: boolean = false; // Track if we're in offline mode
  private connectionFailed: boolean = false; // Track if connection failed after attempts

  // Connection storm prevention
  private isConnecting: boolean = false; // Guard against concurrent connect() calls
  private lastConnectTime: number = 0; // For debouncing connect() calls
  private sessionJoined: boolean = false; // Only send player_update after join_success
  
  // Reconciliation metrics for debugging
  private _reconciliationMetrics = {
    totalCorrections: 0,
    averageError: 0,
    lastError: 0,
    lastCorrection: 0,
    active: true
  };

  // Logging level control
  private logLevel: LogLevel = LogLevel.INFO; // Default to INFO level
  
  // Add playerCount to track connection order - initialize to -1 to make first player index 0
  private static playerCount = -1;
  private playerIndex = -1;
  
  // For shot event tracking
  private lastShotEvents: Record<string, number> = {};
  
  // Store player character type
  private playerType: 'merc' | 'jackalope' = 'merc';
  
  // Add player name property for identification
  private playerName: string | null = null;
  
  // Add this property near the other properties at the top of the class
  private lastErrorTime: number = 0; // Track the last time we emitted an error event
  
  constructor(private serverUrl: string = 'ws://147.182.235.54:8082') {
    super();
    
    // Don't reset the static player count here - we'll use localStorage instead
    // for cross-browser coordination
    
    // Set up a storage event listener to detect changes from other tabs
    window.addEventListener('storage', (event) => {
      if (event.key === 'jackalopes_player_count') {
        console.error(`⭐ Detected player count change in another tab: ${event.oldValue} -> ${event.newValue}`);
        
        // Reset our playerIndex so we get a new assignment on next connection
        if (this.playerIndex !== -1) {
          this.playerIndex = -1;
          console.error(`⭐ Reset local player index due to change in another tab`);
        }
      }
    });
    
    // Listen for the custom reset event (fires in this tab)
    window.addEventListener('jackalopes_playercount_reset', (e: any) => {
      console.error('⭐ Detected player count reset in this tab');
      
      // Reset our player index
      this.playerIndex = -1;
      ConnectionManager.playerCount = -1;
      
      // Force refresh to get the new player type
      if (confirm('Player count has been reset. Reload now to get your new character assignment?')) {
        window.location.reload();
      }
    });
    
    // Some early initialization
    this.log(LogLevel.INFO, `Initializing ConnectionManager with server: ${this.serverUrl}`);
    
    // Add optional WebSocket path segment if it's not already there
    if (!this.serverUrl.endsWith('/websocket/') && !this.serverUrl.endsWith('/websocket')) {
      this.log(LogLevel.INFO, 'Server URL is missing websocket path, checking format...');
      
      // Parse URL to rebuild with websocket path
      const urlParts = this.serverUrl.match(/^(ws:\/\/|wss:\/\/)(.*?)(?::(\d+))?$/);
      if (urlParts) {
        const [, protocol, host, port] = urlParts;
        // Rebuild the URL with the /websocket/ path
        this.serverUrl = `${protocol}${host}${port ? `:${port}` : ''}/websocket/`;
        this.log(LogLevel.INFO, 'Updated server URL to include websocket path:', this.serverUrl);
      }
    }
    
    // Initialize the EntityStateObserver with debug level based on global setting
    // Use window.jackalopesGame?.debugLevel if available, otherwise use LogLevel-based logic
    if (typeof window !== 'undefined' && window.jackalopesGame && window.jackalopesGame.debugLevel !== undefined) {
      entityStateObserver.setDebugLevel(window.jackalopesGame.debugLevel);
    } else {
      // Fallback to old behavior
      entityStateObserver.setDebug(this.logLevel >= LogLevel.DEBUG);
    }
    
    // Connect after a short delay to ensure DOM is ready
    setTimeout(() => this.connect(), 500);
  }

  // Helper methods for logging with different levels
  private log(level: LogLevel, ...args: any[]): void {
    // Filter out player_update messages unless we're at VERBOSE level
    if (args.length > 0 && typeof args[0] === 'string') {
      // Check if this is a player_update message
      const isPlayerUpdate = (
        (args[0].includes('Sending data to server (player_update)')) || 
        (args[0].includes('Received message from server (player_update)'))
      );
      
      // Only log player_update messages if we're at VERBOSE level
      if (isPlayerUpdate && level < LogLevel.VERBOSE) {
        return;
      }
    }

    // Log non-player_update messages normally
    if (level <= this.logLevel) {
      switch (level) {
        case LogLevel.ERROR:
          console.error(...args);
          break;
        case LogLevel.WARN:
          console.warn(...args);
          break;
        case LogLevel.INFO:
          console.info(...args);
          break;
        case LogLevel.DEBUG:
        case LogLevel.VERBOSE:
          console.log(...args);
          break;
      }
    }
  }

  // Method to set log level
  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
    this.log(LogLevel.INFO, `Log level set to: ${LogLevel[level]}`);
    
    // Also update EntityStateObserver's debug level for consistent logging
    if (typeof window !== 'undefined' && window.jackalopesGame) {
      // Map LogLevel to debug level (0-3):
      // LogLevel.NONE, ERROR -> 0
      // LogLevel.WARN -> 1 
      // LogLevel.INFO -> 2
      // LogLevel.DEBUG, VERBOSE -> 3
      const debugLevel = level === LogLevel.NONE ? 0 :
                         level === LogLevel.ERROR ? 0 :
                         level === LogLevel.WARN ? 1 :
                         level === LogLevel.INFO ? 2 : 3;
      
      // Update the global debug level
      window.jackalopesGame.debugLevel = debugLevel;
      
      // Also update EntityStateObserver if it exists
      if (window.__entityStateObserver) {
        window.__entityStateObserver.setDebugLevel(debugLevel);
      }
    }
  }
  
  // Public methods to easily change log levels
  enableVerboseLogging(): void {
    this.setLogLevel(LogLevel.VERBOSE);
    this.log(LogLevel.INFO, '📊 Verbose logging enabled - showing all network messages');
  }

  disableVerboseLogging(): void {
    this.setLogLevel(LogLevel.INFO);
    this.log(LogLevel.INFO, '📊 Verbose logging disabled - filtering player_update messages');
  }

  // Method to get the current log level
  getLogLevel(): LogLevel {
    return this.logLevel;
  }
  
  connect(): void {
    try {
      // Connection storm prevention: if already connecting or connected, skip
      if (this.isConnecting) {
        this.log(LogLevel.INFO, 'Already connecting, skipping duplicate connect() call');
        return;
      }
      if (this.isConnected && this.socket?.readyState === WebSocket.OPEN) {
        this.log(LogLevel.INFO, 'Already connected, skipping connect() call');
        return;
      }

      // Connection debounce: ignore connect() calls within 2 seconds of last connect
      const now = Date.now();
      if (now - this.lastConnectTime < 2000) {
        this.log(LogLevel.INFO, `Debouncing connect() call (${now - this.lastConnectTime}ms since last)`);
        return;
      }
      this.lastConnectTime = now;
      this.isConnecting = true;

      this.log(LogLevel.INFO, 'Connecting to WebSocket server at', this.serverUrl);

      // Cleanup any existing socket first
      if (this.socket) {
        this.disconnect();
      }

      // Reset offline mode flag for new connection attempt
      this.offlineMode = false;
      this.connectionFailed = false;
      
      // For DISABLED_CHECK, check if it's even reachable first
      if (this.serverUrl.includes('DISABLED_CHECK')) {
        this.log(LogLevel.INFO, 'Trying to connect to staging server - checking availability first...');
        this.checkServerAvailability();
      } else {
        // For other servers, proceed with normal connection
        this.createWebSocketConnection();
      }
    } catch (error) {
      this.log(LogLevel.ERROR, 'Error connecting to WebSocket server:', error);
      this.isConnecting = false;
      // If we failed to connect, attempt reconnect
      this.handleDisconnect();
    }
  }
  
  private checkServerAvailability(): void {
    // Try a basic fetch to check if the domain is accessible
    // Extract domain from the serverUrl
    const urlMatch = this.serverUrl.match(/^(ws:\/\/|wss:\/\/)([^\/]*)/);
    if (!urlMatch) {
      this.log(LogLevel.ERROR, 'Invalid server URL format');
      this.handleDisconnect();
      return;
    }
    
    const domain = urlMatch[2]; // Extract the domain part
    const protocol = this.serverUrl.startsWith('wss://') ? 'https://' : 'http://';
    
    // Use a controller to abort the fetch after a timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout
    
    fetch(`${protocol}${domain}/health-check`, { 
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal
    })
    .then(() => {
      clearTimeout(timeoutId);
      // If we can reach the domain, try the WebSocket connection
      this.log(LogLevel.INFO, `Domain ${domain} is reachable, attempting WebSocket connection...`);
      this.createWebSocketConnection();
    })
    .catch((error) => {
      clearTimeout(timeoutId);
      
      // Don't log detailed fetch errors - they're noisy and not helpful
      this.log(LogLevel.INFO, `Server ${domain} not available - using offline mode`);
      
      // Throttle server_unreachable events to avoid spamming
      if (!this.lastErrorTime || (Date.now() - this.lastErrorTime) > 10000) {
        this.lastErrorTime = Date.now();
        this.connectionFailed = true;
        this.offlineMode = true;
        this.emit('server_unreachable', { server: this.serverUrl });
        setTimeout(() => this.forceReady(), 500);
      }
    });
    
    // Also set a short timeout in case fetch hangs
    setTimeout(() => {
      if (!this.isConnected && !this.offlineMode) {
        this.log(LogLevel.INFO, 'Server availability check timed out, creating WebSocket connection anyway...');
        this.createWebSocketConnection();
      }
    }, 3000);
  }
  
  private createWebSocketConnection(): void {
    // Try to create the WebSocket with a timeout to handle hanging connections
    this.socket = new WebSocket(this.serverUrl);
    
    // Set a timeout to handle cases where the connection hangs
    const connectionTimeout = setTimeout(() => {
      if (this.socket && this.socket.readyState !== WebSocket.OPEN) {
        this.log(LogLevel.INFO, 'Connection timeout after 5 seconds, closing socket');
        // Force close the socket
        if (this.socket.readyState === WebSocket.CONNECTING) {
          this.socket.close();
          this.handleDisconnect();
        }
      }
    }, 5000);
    
    this.socket.onopen = () => {
      clearTimeout(connectionTimeout);
      this.log(LogLevel.INFO, 'Connected to server');
      this.isConnected = true;
      this.isConnecting = false;
      this.reconnectAttempts = 0; // Reset reconnect counter on successful connection
      this.emit('connected');
      
      // Start keep-alive interval after connection
      this.startKeepAliveInterval();
      
      // Attempt to initialize session after connection
      this.initializeSession();
      
      // Start ping interval after connection
      this.startPingInterval();
    };
    
    this.socket.onclose = (event) => {
      clearTimeout(connectionTimeout);
      this.isConnecting = false;
      // Log close code and reason
      this.log(LogLevel.INFO, `WebSocket closed with code ${event.code}, reason: ${event.reason || 'No reason given'}`);

      // Use our improved handleDisconnect method
      this.handleDisconnect();
    };
    
    this.socket.onerror = (error) => {
      clearTimeout(connectionTimeout);
      this.isConnecting = false;
      this.handleError(error);
    };
    
    this.socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (error) {
        this.log(LogLevel.ERROR, 'Error parsing message:', error);
      }
    };
  }
  
  disconnect(): void {
    // Clear any pending reconnection attempts
    this.clearReconnectTimeout();

    // Stop ping interval
    this.stopPingInterval();

    // Stop keep-alive interval
    this.stopKeepAliveInterval();

    if (this.socket) {
      // Remove event listeners to prevent any callbacks after disconnect
      this.socket.onopen = null;
      this.socket.onclose = null;
      this.socket.onerror = null;
      this.socket.onmessage = null;

      // Only close if socket is not already closing or closed
      if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
        this.socket.close();
      }
      this.socket = null;
    }

    // Reset player index when disconnected - this ensures new character assignment on reconnect
    this.playerIndex = -1;

    // Reset connection state flags
    this.isConnected = false;
    this.isConnecting = false;
    this.sessionJoined = false;
    this.emit('disconnected');
    this.log(LogLevel.INFO, 'Disconnected from server');
  }
  
  // Starts a keep-alive interval to maintain the connection
  private startKeepAliveInterval(): void {
    this.stopKeepAliveInterval();
    
    // Send a small packet every 30 seconds to keep the connection alive
    this.keepAliveInterval = window.setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        // Send a minimal message that won't trigger errors
        this.send({
          type: 'keepalive',
          timestamp: Date.now()
        });
      }
    }, 30000); // 30 seconds
  }
  
  // Stops the keep-alive interval
  private stopKeepAliveInterval(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }
  
  // Start measuring ping every 2 seconds
  private startPingInterval(): void {
    this.stopPingInterval();
    
    this.pingInterval = window.setInterval(() => {
      if (this.isConnected) {
        this.sendPing();
        
        // Check if we've received a pong since the last ping
        if (!this.pongReceived && this.useServerPong) {
          this.log(LogLevel.INFO, 'No pong received from server, switching to client-side latency estimation');
          this.useServerPong = false;
        }
        
        this.pongReceived = false;
      }
    }, 2000); // Ping every 2 seconds
  }
  
  // Stop the ping interval
  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
  
  // Send a ping message to measure latency
  private sendPing(): void {
    this.pingStartTime = Date.now();
    
    if (this.useServerPong) {
      // Use a message that won't cause errors or side effects
      // and that the server definitely can handle
      this.send({
        type: 'game_event',
        event: 'ping',
        timestamp: this.pingStartTime,
        data: { type: 'ping' } // Include in a data field to avoid affecting game state
      });
    } else {
      // For client-side estimation, just measure time to next server message
      if (this.logLevel >= LogLevel.VERBOSE) {
        this.log(LogLevel.INFO, 'Using client-side latency estimation');
      }
      
      // Simulate a pong response after a brief delay
      setTimeout(() => {
        if (this.isConnected) {
          // We don't have a real measurement but we can estimate
          // based on connection stability
          this.latency = 100; // Assume 100ms if we're connected
          this.emit('latency_update', this.latency);
          this.pongReceived = true;
        }
      }, 50);
    }
  }
  
  // Handle a pong message from server
  private handlePong(message: any): void {
    const now = Date.now();
    const roundTripTime = now - message.timestamp;
    
    // Calculate latency (half of round trip)
    this.latency = Math.round(roundTripTime / 2);
    this.pongReceived = true;
    
    // Only emit an update if we have a reasonable value
    if (this.latency > 0 && this.latency < 10000) { // Ignore unreasonable values
      this.emit('latency_update', this.latency);
    } else {
      // If we got an unreasonable value, use a fallback
      this.latency = 100; // Default reasonable value
      this.emit('latency_update', this.latency);
    }
  }
  
  // Get the current latency estimate
  getLatency(): number {
    return this.latency;
  }
  
  // Check if ready to send messages
  isReadyToSend(): boolean {
    // Can send if we're in offline mode or connected
    return this.offlineMode || 
      (this.isConnected && this.playerId !== null && 
       this.socket?.readyState === WebSocket.OPEN);
  }

  // Add a method to force the connection ready state (for testing)
  forceReady(): void {
    this.log(LogLevel.INFO, '⚠️ Forcing offline mode for cross-browser communication');
    this.offlineMode = true;
    
    // Generate a player index if not already assigned
    if (this.playerIndex === -1) {
      try {
        // Check if we need to reset the player count
        const shouldReset = this.shouldResetPlayerCount();
        
        if (shouldReset) {
          localStorage.setItem('jackalopes_player_count', '-1');
          console.error('⭐ Reset player count due to inactivity');
        }
        
        // Get the current highest player index from localStorage
        let globalPlayerCount = parseInt(localStorage.getItem('jackalopes_player_count') || '-1');
        
        // Increment the count for this player
        globalPlayerCount++;
        
        // Store the updated count back in localStorage
        localStorage.setItem('jackalopes_player_count', globalPlayerCount.toString());
        localStorage.setItem('jackalopes_last_activity', Date.now().toString());
        
        // Assign this player's index
        this.playerIndex = globalPlayerCount;
        
        // Also update the static count to match (for in-tab consistency)
        ConnectionManager.playerCount = globalPlayerCount;
        
        console.error(`⭐ FORCE READY: Assigned player index ${this.playerIndex} using localStorage coordination (assigned as ${this.playerIndex % 2 === 0 ? 'JACKALOPE' : 'MERC'})`);
      } catch (e) {
        // Fallback to static count if localStorage fails
        ConnectionManager.playerCount++;
        this.playerIndex = ConnectionManager.playerCount - 1;
        console.error(`⭐ FORCE READY: Assigned player index ${this.playerIndex} using static count (localStorage failed)`);
      }
    }
    
    if (!this.playerId) {
      // Generate a temporary player ID to allow sending
      this.playerId = `offline-player-${Date.now()}`;
      this.log(LogLevel.INFO, '⚠️ Forcing ready state with temporary player ID:', this.playerId);
    }
    
    if (!this.isConnected) {
      this.isConnected = true;
      this.log(LogLevel.INFO, '⚠️ Forcing connection state to connected');
      this.emit('connected');
    }
    
    // Emit initialized event to set up the game state
    this.emit('initialized', { 
      id: this.playerId, 
      gameState: this.gameState 
    });
  }
  
  // Method to set player type
  setPlayerType(type: 'merc' | 'jackalope'): void {
    this.log(LogLevel.INFO, `Setting player type to ${type}`);
    this.playerType = type;
  }
  
  // Update the sendPlayerUpdate method to include flashlight state
  sendPlayerUpdate(updateData: {
    position: [number, number, number],
    rotation: [number, number, number, number],
    velocity?: [number, number, number],
    sequence?: number,
    playerType?: 'merc' | 'jackalope',
    flashlightOn?: boolean,
    cameraPitch?: number
  }): void {
    if (!this.isReadyToSend()) {
      this.log(LogLevel.WARN, 'Cannot send player update, WebSocket not ready');
      return;
    }

    // Don't send player_update before joining session
    if (!this.sessionJoined && !this.offlineMode) {
      this.log(LogLevel.WARN, 'Cannot send player update, session not joined yet');
      return;
    }
    
    // Determine which playerType to send
    const typeToSend = updateData.playerType || this.playerType || 'merc';
    
    // Get flashlight state from global state if not provided
    const flashlightState = updateData.flashlightOn !== undefined ? 
      updateData.flashlightOn : 
      (window.jackalopesGame?.flashlightOn || false);
    
    // Only log position updates at verbose level to reduce noise
    if (this.logLevel >= LogLevel.VERBOSE) {
      this.log(LogLevel.VERBOSE, `Sending player update: pos=${updateData.position.join(',')}, rot=${updateData.rotation.join(',')}, type=${typeToSend}, flashlight=${flashlightState}`);
    }
    
    if (!this.offlineMode) { 
      // For online mode, send to server
      this.send({
        type: 'player_update',
        state: {
          position: updateData.position,
          rotation: updateData.rotation,
          velocity: updateData.velocity || [0, 0, 0],
          sequence: updateData.sequence || Date.now(),
          playerType: typeToSend,
          flashlightOn: flashlightState,
          cameraPitch: updateData.cameraPitch || 0
        }
      });
    } else {
      // In offline mode, immediately update local game state and emit event
      if (this.playerId) {
        // Update our own player in the game state
        if (!this.gameState.players[this.playerId]) {
          this.gameState.players[this.playerId] = {
            position: updateData.position,
            rotation: updateData.rotation,
            health: 100,
            playerType: typeToSend, // Use explicit or default playerType
            flashlightOn: flashlightState // Include flashlight state
          };
        } else {
          this.gameState.players[this.playerId].position = updateData.position;
          this.gameState.players[this.playerId].rotation = updateData.rotation;
          this.gameState.players[this.playerId].playerType = typeToSend; // Use explicit or default playerType
          this.gameState.players[this.playerId].flashlightOn = flashlightState; // Include flashlight state
        }
      }
    }
  }
  
  // Update sendShootEvent to use a compatible message format with the staging server
  sendShootEvent(origin: [number, number, number], direction: [number, number, number]): void {
    if (!this.isReadyToSend()) {
      this.log(LogLevel.WARN, 'Cannot send shoot event, WebSocket not ready');
      return;
    }
    
    // Generate a unique ID for this shot based on timestamp and random number
    const shotId = `shot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create shot data
    const shotData = {
      type: 'game_event',
      event: {
        event_type: 'player_shoot',
        shotId,
        origin,
        direction,
        player_id: this.playerId,
        timestamp: Date.now(),
        playerType: this.playerType // Include player type with shot
      }
    };
    
    // Save this shot ID to our tracking
    this.lastShotEvents[shotId] = Date.now();
    
    // Log the shot for debugging
    this.log(LogLevel.DEBUG, 'Sending shot event:', shotId);
    
    // Broadcast the shot data to server
    this.send(shotData);
    
    // Also broadcast via localStorage for cross-browser testing
    // Only if we're in a testing/demo environment (localhost)
    if (window.location.hostname === 'localhost') {
      this.broadcastViaLocalStorage(shotData);
    }
  }

  // Send a respawn request for a player (usually a jackalope hit by a projectile)
  sendRespawnRequest(playerId: string, spawnPosition?: [number, number, number]): void {
    if (!this.isReadyToSend()) {
      this.log(LogLevel.WARN, 'Cannot send respawn request, WebSocket not ready');
      return;
    }
    
    // Generate a unique ID for this respawn based on timestamp and random number
    const respawnId = `respawn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Set default position if not provided
    const defaultPosition: [number, number, number] = [-100, 3, 10];
    
    // Create respawn event data
    const respawnData = {
      type: 'game_event',
      event: {
        event_type: 'player_respawn',
        respawnId,
        player_id: playerId, // The player who needs to respawn
        requestedBy: this.playerId, // Who requested the respawn
        timestamp: Date.now(),
        // Include spawn position if provided, otherwise use default
        spawnPosition: spawnPosition || defaultPosition
      }
    };
    
    this.log(LogLevel.INFO, `Sending respawn request for player ${playerId}, ID: ${respawnId}, position: ${respawnData.event.spawnPosition.join(',')}`);
    
    // Send to server
    this.send(respawnData);
    
    // Also broadcast via localStorage for cross-browser testing
    if (window.location.hostname === 'localhost') {
      this.broadcastViaLocalStorage(respawnData);
    }
  }

  private send(data: any): void {
    // Check if we're in offline mode
    if (this.offlineMode) {
      this.log(LogLevel.INFO, 'In offline mode, using localStorage broadcast for', data.type);
      
      if (data.type === 'game_event' && data.event.event_type === 'player_shoot') {
        // Handle shot events through the global handler if available
        if (window.__shotBroadcast) {
          window.__shotBroadcast({
            id: this.playerId || 'unknown-player',
            origin: data.event.origin,
            direction: data.event.direction,
            color: this.playerType === 'merc' ? '#ff0000' : '#4682B4', // Red for Merc, Blue for Jackalope
            timestamp: data.event.timestamp,
            shotId: data.event.shotId
          });
        }
      }
      
      return;
    }
    
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.log(LogLevel.WARN, 'Cannot send data: WebSocket is not open', this.getSocketState());
      return;
    }
    
    try {
      if (data.type !== 'player_update' || this.logLevel >= LogLevel.VERBOSE) {
        this.log(LogLevel.DEBUG, `Sending data to server (${data.type})`);
      }
      this.socket.send(JSON.stringify(data));
    } catch (e) {
      this.log(LogLevel.ERROR, 'Failed to send data:', e);
    }
  }
  
  // Utility to broadcast messages via localStorage for cross-browser testing
  private broadcastViaLocalStorage(data: any): void {
    try {
      // Create a storage-friendly version of the data
      const storageData = {
        ...data,
        timestamp: Date.now(),
        sender: this.playerId
      };
      
      // Use a unique key each time to ensure the storage event triggers
      const key = `jackalopes_broadcast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Stringify and store
      localStorage.setItem(key, JSON.stringify(storageData));
      
      // Clean up after a delay (to ensure other tabs have time to process)
      setTimeout(() => {
        localStorage.removeItem(key);
      }, 1000);
      
      this.log(LogLevel.DEBUG, `Broadcasted via localStorage: ${data.type}`, key);
    } catch (error) {
      this.log(LogLevel.ERROR, 'Failed to broadcast via localStorage:', error);
    }
  }

  private handleMessage(message: any): void {
    this.log(LogLevel.INFO, `Received message from server (${message.type}):`, message);
    this.emit('message_received', message);
    
    // Any message from the server is a sign that the connection is active,
    // even if it's an error message
    if (!this.isConnected) {
      this.log(LogLevel.INFO, 'Received message while disconnected - reconnecting state');
      this.isConnected = true;
      this.emit('connected');
    }
    
    // Use any server response for latency calculation if we're waiting for one
    // and we haven't already processed a pong recently
    if (this.pingStartTime > 0 && !this.pongReceived) {
      this.handlePong({ timestamp: this.pingStartTime });
      this.pingStartTime = 0;
    }
    
    switch (message.type) {
      case 'connection':
        this.playerId = message.id;
        this.gameState = message.gameState;
        this.log(LogLevel.INFO, '📣 CONNECTION: Set player ID to', this.playerId);
        this.emit('initialized', { id: this.playerId, gameState: this.gameState });
        break;
        
      case 'welcome':
        this.log(LogLevel.INFO, 'Received welcome message from server');
        // Server is up, but we still need to authenticate
        if (!this.playerId) {
          this.initializeSession();
        }
        break;
        
      case 'game_event':
        // Critical handler for game events from server
        this.log(LogLevel.INFO, '🎮 Game event received:', message);
        
        // Forward the event to listeners
        if (message.event) {
          // Add extra debugging for respawn events
          if (message.event.event_type === 'player_respawn') {
            this.log(LogLevel.INFO, '🔄 RESPAWN EVENT RECEIVED:', {
              respawnPlayerId: message.event.player_id,
              requestedBy: message.event.requestedBy,
              spawnPosition: message.event.spawnPosition,
              localPlayerId: this.playerId
            });
          }
          
          // Forward the event to game_event listeners
          this.emit('game_event', message.event);
          
          // Also emit 'shot' event for useRemoteShots hook
          if (message.event.event_type === 'player_shoot' && message.event.player !== this.playerId) {
            this.emit('shot', {
              id: message.event.player,
              origin: message.event.origin,
              direction: message.event.direction,
              shotId: message.event.shotId,
              playerType: message.event.playerType,
              timestamp: message.event.timestamp
            });
          }
        }
        break;
        
      case 'auth_success':
      case 'join_success':
        this.log(LogLevel.INFO, 'Authentication/join successful');
        // Mark session as joined when we get join_success
        if (message.type === 'join_success') {
          this.sessionJoined = true;
          this.log(LogLevel.INFO, '📣 Session joined, player_update now allowed');
        }
        if (message.player && message.player.id) {
          this.playerId = message.player.id;
          this.log(LogLevel.INFO, '📣 AUTH_SUCCESS: Set player ID to', this.playerId);
          
          // Server-authoritative player type assignment
          if (message.playerType) {
            this.playerType = message.playerType;
            this.playerIndex = message.playerIndex ?? 0;
            console.log(`🎮 Server assigned: ${message.playerType} (index ${this.playerIndex})`);
            this.emit('player_type_assigned', { type: message.playerType, index: this.playerIndex });
          }
          
          // Store match timer info from server
          if (message.matchStartTime) {
            (this as any).matchStartTime = message.matchStartTime;
            (this as any).matchDuration = message.matchDuration;
            (this as any).serverTime = message.serverTime;
            this.emit('match_timer', {
              matchStartTime: message.matchStartTime,
              matchDuration: message.matchDuration,
              serverTime: message.serverTime
            });
          }
          
          if (message.session) {
            this.log(LogLevel.INFO, 'Joined session:', message.session.id);
            this.log(LogLevel.INFO, '📊 Session diagnostics:', {
              requestedSession: 'JACKALOPES-TEST-SESSION',
              assignedSession: message.session.id,
              sessionKey: message.session.key,
              playerType: message.playerType,
              playerIndex: message.playerIndex
            });
          }
          // Explicitly set connected state to true on successful auth
          this.isConnected = true;
          this.emit('initialized', { id: this.playerId, gameState: this.gameState });
          
          // After initialization, immediately log connection state for debugging
          this.log(LogLevel.INFO, '📣 Connection state after auth success:', this.isReadyToSend(), {
            isConnected: this.isConnected,
            playerId: this.playerId,
            socketReady: this.socket?.readyState === WebSocket.OPEN
          });
          
          // If we received auth_success but not join_success, send join_session
          if (message.type === 'auth_success') {
            this.log(LogLevel.INFO, 'Auth successful, joining session...');
            // Check URL for preferred role
            const urlParams = new URLSearchParams(window.location.search);
            const preferredRole = urlParams.get('role');
            this.send({
              type: 'join_session',
              playerName: message.player.id,
              sessionKey: 'JACKALOPES-TEST-SESSION',
              preferredRole: preferredRole || undefined
            });
          }
        }
        
        // Use any message response for latency measurement
        if (this.pingStartTime > 0) {
          this.handlePong({ timestamp: this.pingStartTime });
        }
        break;
        
      case 'player_joined':
        this.log(LogLevel.INFO, '👤 Player joined event received:', message);
        // Handle all formats the server might send
        const playerId = message.id || message.player_id || message.player?.id;
        const playerType = (message.playerType || message.state?.playerType || 'merc') as 'merc' | 'jackalope';
        const playerState = message.initialState || {
          position: message.position || [0, 1, 0],
          rotation: message.rotation || [0, 0, 0, 1],
          health: 100,
          playerType
        };
        
        // Skip if this is our own player ID
        if (playerId === this.playerId) {
          this.log(LogLevel.INFO, 'Ignoring player_joined for our own player ID');
          break;
        }
        
        // Add to the game state
        this.gameState.players[playerId] = playerState;
        
        // Emit the event so the UI can update
        this.emit('player_joined', { id: playerId, playerType: message.playerType || playerType, state: playerState });
        this.log(LogLevel.INFO, '🎮 Updated player list - current players:', Object.keys(this.gameState.players));
        break;
        
      case 'player_list':
        // Some servers might send a complete player list instead of individual join/leave events
        this.log(LogLevel.INFO, 'Received player list from server:', message.players);
        if (message.players && typeof message.players === 'object') {
          // Update our game state with all players
          Object.entries(message.players).forEach(([id, playerData]: [string, any]) => {
            // Skip if this is our own player
            if (id === this.playerId) return;
            
            // Add or update this player in our game state
            this.gameState.players[id] = playerData;
            
            // Emit player_joined for any new players we didn't know about
            this.emit('player_joined', { id, state: playerData });
          });
          
          this.log(LogLevel.INFO, '🎮 Updated player list from server - current players:', Object.keys(this.gameState.players));
        }
        break;
        
      case 'player_left':
        delete this.gameState.players[message.id];
        this.emit('player_left', { id: message.id });
        break;
        
      case 'player_update':
        this.handlePlayerUpdate(message);
        break;
        
      default:
        this.log(LogLevel.WARN, 'Unknown message type:', message.type);
        break;
    }
  }
  
  // Initialize session with the server
  private initializeSession(): void {
    this.log(LogLevel.INFO, 'Initializing session...');
    
    // Create a unique player name if not already set
    const playerName = this.playerName || `player-${Math.random().toString(36).substring(2, 9)}`;
    
    // Set player name for this session
    this.playerName = playerName;
    
    // Get or assign a player index for character type determination
    try {
      // Try to use localStorage for consistent player index across tabs
      let playerCount = 0;
      try {
        const storedCount = localStorage.getItem('jackalopes_player_count');
        if (storedCount) {
          playerCount = parseInt(storedCount);
        }
        
        // Check if we already have a player index from localStorage
        const storedIndex = localStorage.getItem('jackalopes_player_index');
        if (storedIndex) {
          this.playerIndex = parseInt(storedIndex);
          console.error(`⭐ Found stored player index ${this.playerIndex}`);
        } else {
          // Increment and store player count
          playerCount++;
          localStorage.setItem('jackalopes_player_count', playerCount.toString());
          
          // Assign a new player index
          this.playerIndex = playerCount - 1;
          localStorage.setItem('jackalopes_player_index', this.playerIndex.toString());
          console.error(`⭐ Assigned player index ${this.playerIndex} based on player count ${playerCount}`);
        }
      } catch (e) {
        // Fallback to static count if localStorage fails
        if (this.playerIndex === -1) {
          ConnectionManager.playerCount++;
          this.playerIndex = ConnectionManager.playerCount - 1;
          console.error(`⭐ Assigned player index ${this.playerIndex} using static count (localStorage failed)`);
        }
      }
      
      // Set the player type based on character assignment
      const characterInfo = this.getPlayerCharacterType();
      this.playerType = characterInfo.type;
      
      // Initialize the player in the EntityStateObserver
      // This is important to do here so other components can check the player type
      const generatedId = `player-${this.playerIndex}-${Date.now().toString(36)}`;
      this.playerId = this.playerId || generatedId;
      
      // Register the player with EntityStateObserver
      entityStateObserver.setLocalPlayerId(this.playerId);
      entityStateObserver.updateEntity({
        id: this.playerId,
        type: characterInfo.type,
        position: [0, 1, 0], // Default position
        rotation: 0,
        isMoving: false,
        isRunning: false,
        isShooting: false,
        health: 100
      });
      
      this.log(LogLevel.INFO, `Player joining as index #${this.playerIndex} (${this.getPlayerCharacterType().type})`);
      
      // Get or create persistent player ID (unique per tab/role)
      const urlRole = new URLSearchParams(window.location.search).get('role') || 'default';
      const storageKey = `jackalopes-player-id-${urlRole}`;
      let persistentId = localStorage.getItem(storageKey);
      if (!persistentId) {
        persistentId = 'player_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem(storageKey, persistentId);
      }
      
      // Try auth first (most common WebSocket server pattern)
      this.send({
        type: 'auth',
        playerName: playerName,
        persistentId: persistentId
      });
      
      // ... continue with existing implementation ...
    } catch (e) {
      console.error('⭐ Failed to initialize session:', e);
      this.handleDisconnect();
    }
  }

  // Add a public method to get player character type based on connection order
  getPlayerCharacterType(): { type: 'merc' | 'jackalope', thirdPerson: boolean } {
    // If server already assigned a type, use it directly
    if (this.playerType && this.playerIndex >= 0) {
      console.log(`🎮 Using server-assigned type: ${this.playerType} (index ${this.playerIndex})`);
      return {
        type: this.playerType as 'merc' | 'jackalope',
        thirdPerson: this.playerType === 'jackalope'
      };
    }
    
    // Fallback to a valid index if somehow playerIndex is still -1
    const index = this.playerIndex >= 0 ? this.playerIndex : 0;
    
    // First force the local storage to be set for cross-tab coordination
    // This will ensure player assignments are consistent across tabs/browsers
    try {
      const storedCount = localStorage.getItem('jackalopes_player_count');
      if (!storedCount || parseInt(storedCount) < index) {
        localStorage.setItem('jackalopes_player_count', index.toString());
      }
      
      // Check if we've reached the player limit (4 players)
      if (index >= 4) {
        console.error(`⭐ Maximum player count reached (${index + 1}/4). New connections will not be assigned unique roles.`);
        // Store a flag indicating the lobby is full
        localStorage.setItem('jackalopes_lobby_full', 'true');
      }
    } catch (e) {
      // Ignore localStorage errors
    }
    
    // IMPROVEMENT: Check for any override in localStorage
    try {
      const forcedType = localStorage.getItem('jackalopes_force_character');
      if (forcedType && (forcedType === 'merc' || forcedType === 'jackalope')) {
        console.error(`⭐ Using forced character type from localStorage: ${forcedType}`);
        const isJackalope = forcedType === 'jackalope';
        return { 
          type: forcedType, 
          thirdPerson: isJackalope 
        };
      }
    } catch (e) {
      // Ignore localStorage errors
    }
    
    // Check if we've reached the player limit (4 players)
    if (index >= 4) {
      console.error(`⭐ Player #${index} (player ${index + 1}) exceeds the 4 player limit. Assigning as spectator.`);
      // For players beyond the 4-player limit, we could implement a spectator mode
      // For now, just assign them as a jackalope (could be changed later)
      return { type: 'jackalope', thirdPerson: true };
    }
    
    // Implement 2v2 assignment strategy:
    // Players 1 & 3 (index 0 & 2) = Jackalope in third-person
    // Players 2 & 4 (index 1 & 3) = Merc in first-person
    if (index % 2 === 0) {
      console.error(`⭐ Player #${index} (player ${index + 1}/4) assigned as JACKALOPE in 3rd-person view`);
      
      // IMPROVEMENT: Persist this type to the instance
      this.playerType = 'jackalope';
      
      return { type: 'jackalope' as const, thirdPerson: true };
    } else {
      console.error(`⭐ Player #${index} (player ${index + 1}/4) assigned as MERC in 1st-person view`);
      
      // IMPROVEMENT: Persist this type to the instance
      this.playerType = 'merc';
      
      return { type: 'merc' as const, thirdPerson: false };
    }
  }

  // Add a method to force character type assignment for testing/debugging
  forceCharacterType(type: 'merc' | 'jackalope'): { type: 'merc' | 'jackalope', thirdPerson: boolean } {
    // Force the player index to match the desired type
    if (type === 'merc') {
      // Force an odd player index for merc
      this.playerIndex = this.playerIndex % 2 === 0 ? this.playerIndex + 1 : this.playerIndex;
      console.error(`⭐ Forced player index to ${this.playerIndex} for MERC character type`);
      return { type: 'merc', thirdPerson: false };
    } else {
      // Force an even player index for jackalope
      this.playerIndex = this.playerIndex % 2 === 0 ? this.playerIndex : this.playerIndex + 1;
      console.error(`⭐ Forced player index to ${this.playerIndex} for JACKALOPE character type`);
      return { type: 'jackalope', thirdPerson: true };
    }
  }

  // Add a method to get just the player type (for MultiplayerManager)
  getAssignedPlayerType(): 'merc' | 'jackalope' {
    const index = this.playerIndex >= 0 ? this.playerIndex : 0;
    return index % 2 === 0 ? 'jackalope' : 'merc';
  }

  // Add a method to reset the localStorage player count (for testing)
  resetPlayerCount(): void {
    try {
      // Save the old value for logging
      const oldValue = localStorage.getItem('jackalopes_player_count');
      
      // Clear all localStorage keys related to player counts
      localStorage.removeItem('jackalopes_player_count');
      localStorage.removeItem('jackalopes_last_activity');
      
      // Force active sessions to use index 0 next time
      localStorage.setItem('jackalopes_player_count', '-1');
      
      // Reset internal counters
      ConnectionManager.playerCount = -1;
      this.playerIndex = -1;
      
      console.error('⭐ Reset player count in localStorage and static variable');
      console.error('⭐ Next player to join will be index 0 (JACKALOPE)');
      
      // Dispatch a custom event to trigger listeners in this tab
      // The 'storage' event only fires in other tabs, not the current one
      try {
        window.dispatchEvent(new CustomEvent('jackalopes_playercount_reset', {
          detail: { oldValue, newValue: '-1' }
        }));
      } catch (e) {
        console.error('Failed to dispatch custom event:', e);
      }
    } catch (e) {
      console.error('⭐ Failed to reset player count in localStorage:', e);
    }
  }

  // Add a method to check if we need to reset the player count
  private shouldResetPlayerCount(): boolean {
    const now = Date.now();
    const lastActivity = parseInt(localStorage.getItem('jackalopes_last_activity') || '0');
    const inactivityDuration = now - lastActivity;
    const resetDuration = 5 * 60 * 1000; // 5 minutes in milliseconds
    return inactivityDuration > resetDuration;
  }

  // Add after the getLatency method
  isOfflineMode(): boolean {
    return this.offlineMode;
  }

  // Add the missing methods

  private handleDisconnect(): void {
    this.isConnected = false;
    this.emit('disconnected');
    this.log(LogLevel.INFO, 'Disconnected from server');
    
    // Stop ping interval
    this.stopPingInterval();
    
    // Stop keep-alive interval
    this.stopKeepAliveInterval();
    
    // Clear any existing reconnect timeout
    this.clearReconnectTimeout();
    
    // Try to reconnect
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => this.connect(), this.reconnectInterval);
    }
  }

  private handleError(error: Event): void {
    this.log(LogLevel.ERROR, 'WebSocket error:', error);
    // Don't emit error if we're not connected yet - this is expected if server isn't running
    if (this.isConnected) {
      this.emit('error', error);
    } else {
      this.log(LogLevel.INFO, 'WebSocket connection failed - server might not be running');
    }
  }

  private clearReconnectTimeout(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout as any);
      this.reconnectTimeout = null;
    }
  }

  // Get the server URL
  getServerUrl(): string {
    return this.serverUrl;
  }

  // Get the player ID
  getPlayerId(): string | null {
    return this.playerId;
  }

  // Check if the player is connected
  isPlayerConnected(): boolean {
    return this.isConnected;
  }

  // Get socket state string
  getSocketState(): string {
    if (!this.socket) return 'NO_SOCKET';
    const stateMap = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
    return stateMap[this.socket.readyState] || 'UNKNOWN';
  }

  // Public wrapper for send method
  sendMessage(data: any): void {
    this.send(data);
  }

  // Send a game snapshot
  sendGameSnapshot(snapshot: GameSnapshot): void {
    if (!this.isReadyToSend()) {
      this.log(LogLevel.INFO, 'Cannot send game snapshot: not connected to server');
      return;
    }
    
    this.send({
      type: 'game_snapshot',
      snapshot
    });
  }

  // Get snapshot at time (stub for compatibility)
  getSnapshotAtTime(timestamp: number): GameSnapshot | null {
    return null;
  }

  // Get player index for client-side logic
  getPlayerIndex(): number {
    return this.playerIndex;
  }

  // Add a method to forcibly reset and correct the character type assignment
  resetAndCorrectCharacterType(): { type: 'merc' | 'jackalope', thirdPerson: boolean } {
    console.error('🔄 Forcing character type correction based on player index');
    
    // Get the player index (should be assigned already)
    const index = this.playerIndex >= 0 ? this.playerIndex : 0;
    
    // Determine the correct character type based on the index
    const isEven = index % 2 === 0;
    const type = isEven ? 'jackalope' : 'merc';
    const thirdPerson = isEven;
    
    // Set the player type
    this.playerType = type;
    
    // Log the correction
    console.error(`🔄 Reset character to ${type.toUpperCase()} (index: ${index}, third-person: ${thirdPerson})`);
    
    // Return the corrected character info
    return { type, thirdPerson };
  }

  // When a message has type 'player_update' and is for another player
  private handlePlayerUpdate(data: any): void {
    // Handle both our own updates and updates from other players
    const updatePlayerId = data.id || data.player_id || data.player;
    
    // Skip processing updates from ourselves
    if (updatePlayerId !== this.playerId) {
      // Extract position and rotation, handling different server formats
      const position = data.position || (data.state && data.state.position);
      const rotation = data.rotation || (data.state && data.state.rotation);
      
      // Extract player type for consistent character rendering
      const playerType = data.playerType || (data.state && data.state.playerType);
      
      // Only proceed if we have valid position data
      if (position) {
        // Update entity state in EntityStateObserver
        entityStateObserver.updateEntity({
          id: updatePlayerId,
          type: playerType || 'merc',
          position,
          rotation,
          // Calculate movement state from velocity if available
          isMoving: data.state?.velocity ? (
            Math.abs(data.state.velocity[0]) > 0.01 || 
            Math.abs(data.state.velocity[2]) > 0.01
          ) : undefined,
          isRunning: data.state?.velocity ? (
            Math.sqrt(
              data.state.velocity[0] * data.state.velocity[0] + 
              data.state.velocity[2] * data.state.velocity[2]
            ) > 0.3 // Higher threshold to properly detect running
          ) : undefined
        });
        
        // Emit player_update event for legacy compatibility
        this.emit('player_update', { 
          id: updatePlayerId, 
          position, 
          rotation,
          playerType,
          // Include full state for advanced features
          state: data.state || {}
        });
      }
    } else {
      // If message is for local player, emit server_state_update for reconciliation
      this.emit('server_state_update', {
        position: data.position || (data.state && data.state.position),
        rotation: data.rotation || (data.state && data.state.rotation),
        timestamp: data.timestamp || Date.now(),
        sequence: data.sequence || (data.state && data.state.sequence),
        positionError: data.positionError,
        serverCorrection: data.serverCorrection
      });
    }
  }

  // Get the client's ID
  getClientId(): string {
    return this.playerId || 'unknown';
  }
  
  // Check if this is the first client to connect
  isFirstClient(): boolean {
    return this.playerIndex === 0;
  }
  
  // Public accessor for connection status
  getConnectionStatus(): boolean {
    return this.isConnected;
  }
  
  // Add a method to check if the lobby is full (4 players maximum)
  isLobbyFull(): boolean {
    // Check localStorage first as it's more reliable across multiple tabs/browsers
    try {
      const lobbyFullFlag = localStorage.getItem('jackalopes_lobby_full');
      if (lobbyFullFlag === 'true') {
        return true;
      }
      
      const storedCount = localStorage.getItem('jackalopes_player_count');
      if (storedCount && parseInt(storedCount) >= 3) { // Index is 0-based, so 3 = 4 players
        return true;
      }
    } catch (e) {
      // Ignore localStorage errors
    }
    
    // Also check the static player count as fallback
    return ConnectionManager.playerCount >= 3; // 0-based, so 3 = 4 players
  }
} 