# Jackalopes Multiplayer Debugging Strategy

## Problem Description
Players can't see each other's meshes or fired particles despite successful WebSocket connections. Console logs show clients connecting to `ws://staging.games.bonsai.so/websocket/`, authenticating, and sending `player_update` messages, but no `player_update` or `player_joined` messages are received back.

## Debugging Checklist

### 1. Server Implementation Analysis
- [x] Identify which server implementation is active (`server.js` vs Ratchet)
- [x] Confirm the active server port (likely 8082 based on Nginx configuration)
- [x] Review server logs for errors or warnings
- [x] Check if the WebSocket server is properly broadcasting messages

### 2. Connection Flow Analysis
- [x] Verify client connection sequence (connect → auth → join_session)
- [x] Confirm WebSocket connection is established successfully
- [x] Verify authentication is working (`auth_success` messages received)
- [x] Check if clients are joining a session (`join_session` message sent)

### 3. Message Format Analysis
- [x] Compare message formats client sends vs. server expects
- [x] Examine `player_update` message format discrepancies
- [x] Verify `game_event` (shot) message structure compatibility

### 4. Root Cause Hypothesis
- [x] Missing `join_session` message from client
- [x] Message format incompatibilities
- [x] Server not properly broadcasting to other clients
- [x] Session management issues

### 5. Solutions Implementation
- [x] Fix 1: Add session joining in client after authentication
  - [x] Modify `ConnectionManager.ts` to send `join_session`
  - [x] Update `MultiplayerManager.tsx` to handle `join_success`
  
- [x] Fix 2: Align server message formats with client expectations
  - [x] Update `handlePlayerUpdate` to match client format
  - [x] Adjust `handleGameEvent` for shot broadcasting
  
- [x] Fix 3: Add verbose server-side logging
  - [x] Log session joining attempts
  - [x] Log message broadcasting with recipient details
  - [x] Track rejected messages and reasons

### 6. Verification
- [x] Test with multiple browser windows
- [x] Confirm `join_success` messages in logs ✅
- [x] Verify `player_joined` notifications received ❌
- [x] Check for `player_update` messages from other clients ❌
- [ ] Confirm remote player meshes appear
- [ ] Verify shot visuals across clients

### 7. Server Configuration Clarification
- [x] Document which server implementation is intended for production
- [ ] Update configuration if necessary
- [ ] Consider consolidating to a single server implementation

## Findings
After analyzing the codebase, we've identified the root cause of the multiplayer visibility issue: 

1. The client successfully connects to the WebSocket server and authenticates.
2. The server responds with `auth_success` and assigns a player ID.
3. However, the client never sends a `join_session` message, which is required for:
   - Adding the player to a game session
   - Receiving broadcasts of other players' updates
   - Being included in broadcasts sent to other clients

According to the server implementation in `server.js`, the client must join a session before receiving any player updates or game events. The server's `handlePlayerUpdate` and `handleGameEvent` functions check for `client.sessionId` and return early if not set.

The client has a fallback mechanism in `initializeSession()` that tries to send `join_session` after 1 second if no player ID is received, but since authentication is working and a player ID is assigned, this fallback is never triggered.

## Solution Implemented
We've implemented the following fixes:

1. Updated `ConnectionManager.ts` to send a `join_session` message immediately after receiving `auth_success`.
2. Modified `MultiplayerManager.tsx` to only set `isConnected` after receiving a `join_success` message, ensuring the full connection flow is completed before sending player updates.
3. Enhanced the message format handling in the client to accommodate different variations of message formats from the server:
   - Added support for multiple ways of accessing player IDs (`message.id`, `message.player_id`, or `message.player`)
   - Improved position/rotation extraction from either direct properties or nested inside `state` object
   - Added better handling of shot events with more flexible parsing of event data structure

## Additional Issues Identified
Further analysis revealed two more specific issues:

1. **Game Event Format Error**: The server was returning errors for game events:
   ```
   Received message from server (error): {type: 'error', message: 'Missing event in game_event'}
   ```
   This indicated that our `game_event` message format was incorrect. The server expects an `event` object containing the event data, but we were sending `event_type` and `data` properties at the top level.

2. **Session Joining Format**: The server wasn't correctly handling our session ID format. Despite trying to use a fixed session ID `shared_test_session`, players were being assigned to different sessions.

## Updated Solutions

1. **Fixed Game Event Format**:
   - Changed from:
     ```javascript
     {
       type: 'game_event',
       event_type: 'player_shoot',
       data: { ... }
     }
     ```
   - To:
     ```javascript
     {
       type: 'game_event',
       event: {
         event_type: 'player_shoot',
         player_id: this.playerId,
         shotId: shotId,
         origin: origin,
         direction: direction,
         timestamp: Date.now()
       }
     }
     ```

2. **Improved Session Joining**:
   - Now trying multiple session ID formats to match what the server expects:
     ```javascript
     // Try with session_id (snake_case)
     {
       type: 'join_session',
       session_id: 'shared_test_session'
     }
     
     // Try with sessionId (camelCase)
     {
       type: 'join_session',
       sessionId: 'shared_test_session'
     }
     
     // Try with session property
     {
       type: 'join_session',
       playerName: playerId,
       session: 'shared_test_session'
     }
     ```

3. **Removed keepalive Message**:
   - The server was returning errors for `keepalive` message types, suggesting this message type isn't supported.
   - We can consider disabling this message type or modifying it to use a supported format in a future update.

## Final Findings - Server Session Issue

After extensive testing, we discovered that the server ignores the session ID provided by the client and always generates a random session ID for each connection. This makes it impossible for players to join the same session through the normal flow.

Examples of server-generated session IDs from our tests:
- `session_io53o6pjo`
- `session_dp6ns9m8g`
- `session_mwez9ovll`
- `session_upsyg1d3r`

Even when explicitly specifying the same session ID ("JACKALOPES-TEST-SESSION") in the `join_session` message, the server assigns a completely different, random session ID to each client. This means players will never be able to see each other because they're in different "rooms" on the server.

## Implemented Workaround

Since the server session issue requires changes to the server-side code, we've implemented a client-side workaround for testing that the player rendering works correctly:

1. **Test Player Feature**: Added an `addTestPlayer()` method to `ConnectionManager` that:
   - Creates a simulated remote player with a random position
   - Moves the simulated player in a circular pattern
   - Emits local events to make the simulated player visible in the client
   - Allows testing the player mesh rendering without server cooperation

2. **Debug Controls**: Added a "ADD TEST PLAYER" button to the debug controls that creates a local test player when clicked.

### How to Test Player Rendering:

1. Connect to the server (the connection will succeed but you'll be alone in your randomly-assigned session)
2. Click the "ADD TEST PLAYER" button in the debug controls
3. A simulated player should appear and move in a circular pattern
4. The "STOP TEST PLAYER" button can be used to remove the test player

This workaround confirms that the client-side rendering of remote players works properly and that the issue is specifically with the server's session management.

## Next Steps

To fix the multiplayer functionality properly, the server needs to be modified to either:

1. Honor the session ID provided by the client in the `join_session` message
2. Provide a way for clients to discover and join existing sessions
3. Create a fixed set of named sessions (e.g., "lobby", "game1", "game2") that clients can join by name

Until one of these server-side changes is made, players will not be able to see each other in the real multiplayer environment.

## Temporary Workarounds

For development and testing purposes, you can:

1. Use the "ADD TEST PLAYER" button to test player rendering
2. Use "UNIVERSAL BROADCAST" and "TEST SHOT" to test shot events
3. Implement a completely client-side multiplayer mode using localStorage for communication between browser tabs

## Server Deployment Issues

### WebSocket Server Runtime Environment

During deployment to the staging server, we encountered an issue with the Node.js runtime:

1. **Platform Compatibility**: The bundled Node.js binary (`./bin/node`) in the repository was compiled for macOS and couldn't run on the Linux-based staging server.

2. **Missing Node.js**: The staging server didn't have Node.js installed globally, meaning the restart script couldn't find a suitable runtime.

### Solution Implemented

We resolved these issues by:

1. **Downloading Linux-Compatible Node.js**: We fetched and extracted a Linux-compatible Node.js binary to a `linux-bin` directory in the plugin:
   ```bash
   curl -sL https://nodejs.org/dist/v18.18.0/node-v18.18.0-linux-x64.tar.gz -o node-linux.tar.gz
   mkdir -p linux-bin
   tar -xzf node-linux.tar.gz -C linux-bin --strip-components=1
   rm node-linux.tar.gz
   ```

2. **Updating Restart Script**: We modified the `restart-server.sh` script to use the Linux-compatible Node.js binary:
   ```bash
   # Changed this line:
   ./bin/node server.js > server.log 2>&1 &
   
   # To this:
   ./linux-bin/bin/node server.js > server.log 2>&1 &
   ```

3. **Process Detection**: Updated the process discovery logic to identify running Node.js processes using either the global `node` command or the Linux-specific binary.

These changes ensure the WebSocket server can run on the staging server without requiring global Node.js installation. The server is now properly starting and accepting connections.

### Deployment Checklist

For future deployments, ensure:

1. The appropriate Node.js binary is included for the target server's OS and architecture
2. The restart script points to the correct binary path
3. Executable permissions are set on both the script and binary:
   ```bash
   chmod +x restart-server.sh
   chmod +x linux-bin/bin/node
   ```

This approach allows the server to run in isolation without requiring system-wide dependencies or configuration.

## New Debugging Session - Player Visibility Issue (March 26)

### Problem Summary
Players can connect to the WebSocket server, authenticate successfully, and join sessions, but cannot see each other despite being connected. Console logs show successful connections and session joining, but display errors about "Missing state in player_update" messages.

### Root Cause Analysis
After analyzing server.js and client code, we've identified several critical issues:

1. **Mismatched message format for `player_update`**:
   - Server expects: `{type: 'player_update', state: {position: [...], rotation: [...]}, ...}`
   - Client sends: `{type: 'player_update', position: [...], rotation: [...], sequence: ...}`

2. **Random session assignment**:
   - Server assigns random session IDs regardless of client's requested session ID
   - This prevents players from joining the same session even when they explicitly try to

3. **Incorrect event handling for broadcast messages**:
   - Server broadcasts player updates with a different format than what the client expects
   - Client receives broadcasts but can't process them correctly

### Action Plan

#### 1. Fix Player Update Message Format
- [x] Modify `ConnectionManager.sendPlayerUpdate()` to include the required `state` object:
  ```js
  this.send({
    type: 'player_update',
    state: {
      position,
      rotation
    },
    sequence: sequence || 0
  });
  ```

#### 2. Fix Session Management
- [x] Add debug logging to track session IDs assigned by server
- [x] Modify `handleJoinSession()` to use the same session for all connections:
  - Option A: Modify server to honor the session ID provided by clients
  - Option B: Use a hardcoded session ID in server for testing purposes
  ```js
  // In ConnectionManager.ts
  this.send({
    type: 'join_session',
    sessionKey: 'JACKALOPES-TEST-SESSION' // Fixed session key for testing
  });
  ```

#### 3. Improve Error Handling and Diagnostics
- [x] Add detailed logging for all message processing on both client and server
- [ ] Implement session status display in UI for debugging
- [ ] Add server-side logging of active sessions and their players

#### 4. Temporary Test Mode
- [x] Implement a client-side workaround that creates simulated players locally
- [x] Add debug UI to test player rendering without server cooperation

#### 5. Testing Strategy
- [x] Test locally with modified server code to confirm format issues
- [ ] Implement monitoring tools to track message flow in real-time
- [ ] Create a session dashboard showing all active sessions and players

### Implementation Order
1. First fix the `player_update` message format as it's the most critical issue ✅
2. Next, address session management to ensure players join the same session ✅
3. Finally, improve error handling and add diagnostics to help with future issues ✅
4. Implement test player mode as fallback for server issues ✅

### Expected Outcome
After implementing these changes, players should be able to:
1. Connect to the server and authenticate successfully
2. Join the same game session consistently
3. See other players' movements in real-time
4. Have a successful multiplayer experience

### Fallback Options
If server-side issues cannot be resolved quickly:
1. Consider reverting to the local Node.js server temporarily
2. Implement a "hybrid" mode where some functionality uses the WordPress plugin and critical features use direct connections
3. Create a client-side simulation mode for testing core gameplay without server dependencies

## Current Implementation Summary (March 27)

### Fixed Issues
We've addressed the critical issues preventing multiplayer functionality:

1. ✅ **Fixed Player Update Format**: 
   - Modified `sendPlayerUpdate()` to include the required `state` object
   - This resolves the "Missing state in player_update" errors

2. ✅ **Fixed Session Management**:
   - Added consistent session key "JACKALOPES-TEST-SESSION" for all players
   - Added detailed session logging to track assigned session IDs

3. ✅ **Fixed Game Event Format**:
   - Updated `sendShootEvent()` to use the correct `event` field structure
   - This should allow shot events to be properly broadcast to other players

4. ✅ **Added Test Player Mode**:
   - Implemented a fallback solution that simulates other players
   - Added UI controls to add/remove test players
   - Test players move in predictable circular patterns for testing rendering

### Implementation Success (March 27)
✅ **Multiplayer Now Working**: The fixes have been successfully implemented and tested.

Key observations:
- Players can now see each other's meshes in real-time
- Position updates are being sent and received correctly
- Shot events are being correctly broadcast between players
- Both Chrome and Safari clients can interact in the same session

The server is correctly:
- Accepting our fixed message format with the `state` property
- Assigning players to the requested "JACKALOPES-TEST-SESSION" session key
- Broadcasting player position updates between connected clients

### Known Issues
1. **Remote Player Remounting**: 
   - Remote players occasionally "remount" (are destroyed and recreated)
   - This causes visual jumpiness in the game
   - Visible in logs: `RemotePlayer.tsx:48 Remote player player_pm6rn9ay6 unmounted`
   - Followed by: `RemotePlayer.tsx:45 Remote player player_pm6rn9ay6 mounted at position: [...]`

2. **Session Management**:
   - The server now honors our "JACKALOPES-TEST-SESSION" session key
   - However, it still creates a formatted session ID "session_jackalopes-test-session"
   - This approach works but isn't fully robust for production use

### Next Steps
1. **Improve Remote Player Stability**:
   - Modify `RemotePlayer` component to avoid unnecessary remounting
   - Implement position interpolation to smooth player movement
   - Add a buffer for position updates to reduce visual jitter

2. **Further Server Improvements**:
   - Continue monitoring server performance with multiple simultaneous players
   - Consider adding server-side logging to debug any remaining issues
   - Create admin tools for managing active sessions

3. **Production Readiness**:
   - Implement reconnection handling for network interruptions
   - Add error recovery for malformed messages
   - Create monitoring and diagnostic tools for server health

4. **Documentation**:
   - Update integration guide for connecting to the WordPress multiplayer server
   - Document message format requirements for any future client implementations
   - Provide setup instructions for local development and testing

This implementation is now sufficient for gameplay testing and further development. The core multiplayer functionality is working, with remaining issues being primarily related to visual smoothness rather than fundamental connectivity or messaging problems.

## Remote Player Remounting Fix - Implementation (March 28)

We've implemented the fix for the remote player remounting issue using the approach outlined earlier. The implementation includes:

1. **React.memo for Preventing Re-renders**:
   - Applied to both `RemotePlayer` and `RemotePlayers` components
   - Prevents unnecessary re-renders when only position data changes

2. **Position Interpolation**:
   - Added smooth interpolation between position updates using `useFrame`
   - Frame-by-frame updates create smooth motion without React state updates
   - Large position changes (teleportation) are still applied immediately

3. **Reference-Based Updates**:
   - Position updates are passed through refs instead of props
   - Uses `requestAnimationFrame` to batch position updates
   - Requires fewer React render cycles, improving performance

4. **Optimization of Component Mounting**:
   - Players are only mounted/unmounted when actually joining/leaving
   - Position changes don't trigger remounting or re-rendering
   - Component dependencies were adjusted to reduce render frequency

### Expected Benefits

1. **Smoother Visual Experience**:
   - Remote players move smoothly between network updates
   - No more visual "jumping" caused by player remounting
   - Interpolated motion looks more natural

2. **Better Performance**:
   - Fewer React render cycles for position updates
   - More efficient GPU utilization by avoiding unnecessary scene changes
   - Lower CPU usage during gameplay

3. **Cleaner Console Output**:
   - Console no longer flooded with "player unmounted"/"player mounted" messages
   - Easier to identify actual player join/leave events
   - Better insight into what's really happening with player connections

### Code Changes Summary

1. **Added in RemotePlayer.tsx**:
   - React.memo wrapper
   - Target position/rotation refs
   - useFrame interpolation
   - Optimized updateTransform method

2. **Added in MultiplayerManager.tsx**:
   - React.memo for RemotePlayers
   - requestAnimationFrame batching
   - useMemo for stable player ID list
   - Optimized ref creation/cleanup

These changes significantly improve the multiplayer experience while maintaining compatibility with the existing server implementation.
