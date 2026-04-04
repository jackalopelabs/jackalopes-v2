# Jackalopes Multiplayer Implementation Plan

This document outlines the step-by-step plan for implementing multiplayer functionality in the Jackalopes FPS game, with the eventual goal of integrating it with a WordPress plugin in a LEMP stack environment.

> **How to use this checklist**: Mark items as completed by changing `[ ]` to `[x]` as you progress through implementation.

## Current Status

We have completed all three phases of the implementation plan: Frontend Prototype, WordPress Plugin, and Game Integration with WordPress Backend. The multiplayer functionality is now working with the WordPress plugin server.

### 🎉 Working Features
- [x] Real-time player position updates visible to other players
- [x] Remote players rendered with correct position and movement
- [x] Shooting events synchronized across clients (projectiles visible to all players)
- [x] WebSocket communication with server for state synchronization
- [x] Cross-browser communication for testing and fallback

These features are functional but still need optimization for smoothness and performance.

### ✅ Phase 1: Frontend Prototype (Testing Without Backend)
All tasks have been completed in this phase.

### ✅ Phase 2: WordPress Plugin for Multiplayer Server
All tasks have been completed in this phase. The WordPress plugin is functional and deployed to staging.

### ✅ Phase 3: Game Integration with WordPress Backend
This phase is now complete:
- [x] Create a WordPress-specific connection adapter in the game
- [x] Add authentication methods for WordPress users
- [x] Implement automatic server discovery through WP endpoints
- [x] Document standalone game with WP multiplayer backend setup
- [x] Create configuration options for connecting to WP server
- [x] Add environment detection for development vs production

## WordPress Server Integration Guide

The game now successfully connects to the WordPress multiplayer server. Here's how to use and configure it:

### Connection Configuration

The game automatically connects to the appropriate server based on the environment:

```typescript
// For development (local testing)
const serverUrl = 'ws://localhost:8082';

// For staging/production
const serverUrl = 'ws://staging.games.bonsai.so/websocket/';
```

### Message Format Requirements

When sending messages to the WordPress server, the following formats must be used:

#### Player Authentication
```json
{
  "type": "auth",
  "playerName": "player-name"
}
```

#### Joining a Session
```json
{
  "type": "join_session",
  "playerName": "player-id",
  "sessionKey": "JACKALOPES-TEST-SESSION"
}
```

#### Player Position Updates
```json
{
  "type": "player_update",
  "state": {
    "position": [x, y, z],
    "rotation": [x, y, z, w],
    "sequence": 12345
  }
}
```

#### Game Events (Shooting)
```json
{
  "type": "game_event",
  "event": {
    "event_type": "player_shoot",
    "shotId": "unique-shot-id",
    "origin": [x, y, z],
    "direction": [x, y, z],
    "player_id": "player-id",
    "timestamp": 1234567890
  }
}
```

### Troubleshooting Common Issues

#### Session Assignment
- Problem: Players can't see each other despite being connected
- Solution: Ensure all players use the same `sessionKey` value in the `join_session` message

#### Player Updates Not Received
- Problem: Player movement not visible to other players
- Solution: Verify the `player_update` message includes a `state` object with position/rotation

#### Remote Player Jumpiness
- Problem: Remote players appear to jump or teleport
- Solution: Implement client-side interpolation between position updates
- Additional fix: Increase position update frequency for smoother movement
- Optimization: Filter unnecessary updates to reduce network traffic (e.g., only send updates when position changes significantly)

#### Shooting Synchronization Issues
- Problem: Shot events not appearing for all players
- Solution: Ensure shot events include unique IDs and validate processing logic to prevent duplicates
- Optimization: Add shotId tracking with window.__processedShots to deduplicate events

#### Performance Optimization Opportunities
- Problem: Console flooded with multiplayer debug logs
- Solution: Implement different log levels (debug, info, error) and conditionally show logs only when needed
- Recommendation: Add a global DEBUG_LEVEL setting that can be toggled in production vs development

## Hosting the WordPress Server

The WordPress plugin contains the WebSocket server that powers the multiplayer functionality. Some considerations for hosting:

### Server Requirements
- WordPress site running on a LEMP stack
- PHP 7.4+ for the WordPress plugin
- Node.js v16+ (included in the plugin bundle)
- Nginx/Apache configured to proxy WebSocket connections

### Nginx WebSocket Configuration
```nginx
# WebSocket proxy for Jackalopes Server
location /websocket/ {
    proxy_pass http://localhost:8082;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 86400; # 24 hours
    proxy_buffering off;
}
```

### Health Check Endpoint
A `/health-check` endpoint is planned for server monitoring. Currently, the server can be checked by establishing a WebSocket connection.

## Performance Considerations

For optimal multiplayer performance:

1. **Update Frequency**: The game sends position updates every 50ms (20 updates per second)
2. **Message Size**: Position/rotation updates are compact to minimize bandwidth usage
3. **Interpolation**: Client-side interpolation is recommended for smooth visuals
4. **Connection Quality**: The game adapts to varying connection speeds using ping measurements
5. **Fallback Mode**: Test player mode provides an offline fallback for development

## Future Development

Next steps for multiplayer enhancements:

1. **Enhanced Remote Player Rendering**: Improve the smoothness of remote player movements
2. **Advanced Session Management**: Implement better session discovery and joining
3. **Player Authentication**: Integrate with WordPress user accounts
4. **Admin Dashboard**: Create tools for monitoring and managing game sessions
5. **Scalability Testing**: Test with larger numbers of simultaneous players

## Phase 4: Advanced Features (Future)

After basic multiplayer is working with WordPress, we'll add more sophisticated features.

### Enhanced Gameplay
- [ ] Implement voice chat using WebRTC
- [ ] Add text chat functionality
- [ ] Create spectator mode
- [ ] Implement match replay system

### Performance Optimization
- [ ] Switch to binary protocol for production
- [ ] Implement area of interest management
- [ ] Add bandwidth usage optimization
- [ ] Create adaptive quality based on connection

### Deployment in Different Environments
- [ ] Standard WordPress setup guide
- [ ] Specialized configuration for Roots LEMP stack
- [ ] Docker-based deployment option
- [ ] Serverless deployment option (where possible)

## Server Implementation Strategies

There are two main approaches for the WordPress server implementation:

### Option 1: Embedded WebSocket Server (Current Implementation)
The WebSocket server runs within the WordPress process:
- Easier to implement initially
- Uses WordPress hooks for access to WP functionality
- Limited scalability (tied to PHP execution)
- Requires special hosting setup for persistent connections

### Option 2: Separate WebSocket Service (Future Upgrade Path)
The WebSocket server runs as a separate service and communicates with WordPress:
- More complex initial setup
- Better performance and scalability
- Independent lifecycle from WordPress
- Requires additional server configuration

Our implementation allows for starting with Option 1 and migrating to Option 2 as needed for scaling.

## Current WordPress Plugin Structure

```
jackalopes-server/
├── admin/                       # Admin UI components
├── includes/                    # WordPress integration classes
├── src/                         # PSR-4 autoloaded classes
│   ├── Server.php               # Main WebSocket server implementation
│   └── Logger.php               # Logging utility
├── bin/                         # Command-line utilities
│   └── server.php               # Standalone server script
├── vendor/                      # Composer dependencies
├── .env.example                 # Environment configuration template
├── composer.json                # Composer package definition
├── jackalopes-server.php        # Main plugin file
├── wordpress-loader.php         # WordPress bootstrap for standalone mode
└── uninstall.php                # Cleanup on uninstall
```

## Frontend Testing Strategies

To test multiplayer functionality before backend integration:

### Option 1: Mock WebSocket Server
Use a simple Node.js WebSocket server for development:

```javascript
// server.js
const WebSocket = require('ws');
const server = new WebSocket.Server({ port: 8080 });

// Server implementation details...
```

### Option 2: WebRTC Peer-to-Peer
For testing without any server, use WebRTC peer connections:

```bash
npm install simple-peer
```

### Option 3: Mocked Network Module
Create a network module that can switch between real and simulated connections:

```typescript
// src/network/NetworkManager.ts
export class NetworkManager {
  private useSimulation: boolean;
  
  constructor(useSimulation = false) {
    this.useSimulation = useSimulation;
  }
  
  // Implementation details...
}
```

### Option 4: In-Memory Multiplayer Simulation
For single-device testing, create fake clients in multiple browser tabs with localStorage for communication:

```typescript
window.addEventListener('storage', (e) => {
  if (e.key === 'game_state') {
    // React to state changes from other tabs
    const state = JSON.parse(e.newValue);
    applyRemoteState(state);
  }
});

function broadcastState(state) {
  localStorage.setItem('game_state', JSON.stringify(state));
}
```

## Moving Forward: Integration Strategy

1. Implement the WordPress-specific connection adapter
2. Add authentication using WordPress user accounts
3. Create environment detection for switching between development and production servers
4. Test with larger numbers of simultaneous players
5. Optimize performance for production use

This approach allows for incremental integration while maintaining a working system at each step.
