# Jackalopes V2 — Multiplayer Session Handover

**Date:** 2026-04-04 06:00 UTC
**Goal:** Two-player multiplayer FPS — merc vs jackalope — working end-to-end

## Current State

The game WORKS in single-player for both roles. Connection layer is solid. The bugs are all in how **remote players render on the other client**.

### What's Working
- WebSocket server at `ws://147.182.235.54:8082` — connects, authenticates, relays updates
- 60hz position/rotation updates from each client (was 30hz, doubled in this session)
- Connection storm fix — no more infinite reconnect loops
- `window.__livePlayerData[playerId]` live store — bypasses React state, updates every frame
- Single-player gameplay: merc movement, jackalope movement, shooting, flashlight, etc.

### What's Broken (3 bugs, all in remote player rendering)

#### Bug 1: Wrong Model Type
Remote jackalope renders as merc model on the merc's screen. Root cause: the server's `player_joined` event doesn't include `playerType`. The client falls back to guessing based on player count, and guesses wrong.

**Server file:** `jackalopes-server/server.js` (also at `~/clawd/jackalopes-server/server.js` — running copy)
**Fix needed:** The `player_joined` broadcast (around line 410) needs to include `playerType: client.playerType`. BUT — `client.playerType` may not be set. Need to check if the client sends playerType during auth/join and if the server stores it.

Check the auth flow:
- `handleAuthentication()` in server.js — does client send playerType?
- `handleJoinSession()` — does it store playerType on the client object?
- If not, the client needs to send it, and the server needs to store + relay it.

#### Bug 2: Remote Player Position Not Updating (Merc branch)
The merc branch in `RemotePlayer.tsx` (around line 620) renders a `<RigidBody type="fixed">` with position from initial props. It NEVER updates. The jackalope branch correctly uses kinematic positioning + live store reads. The merc branch needs the same treatment.

**File:** `src/game/RemotePlayer.tsx`
**The merc branch** (starts `if (playerType === 'merc')` around line 620) returns a RigidBody with hardcoded initial position. Needs:
1. Change `type="fixed"` to `type="kinematicPosition"`
2. Add a `ref` to the RigidBody
3. In the existing useFrame (or a new top-level one), read from live store and call `setNextKinematicTranslation()` — same pattern as the jackalope branch

**CRITICAL: React hooks rules.** The jackalope branch (starts around line 730) has `useState`, `useRef`, `useFrame` INSIDE the `if (playerType === 'jackalope')` conditional. This works as long as playerType never changes at runtime. Do NOT attempt to change playerType dynamically or you'll get "Rendered fewer hooks than expected" crash.

#### Bug 3: Rotation Glitching
Remote player rotates sporadically. The `quaternionToAngle()` function (line ~1100) returns values in [-π, π]. When interpolating across the ±π boundary, the lerp goes the long way around (270° instead of 90°). Need angle-wrap aware interpolation:
```
let diff = target - current;
while (diff > Math.PI) diff -= 2 * Math.PI;
while (diff < -Math.PI) diff += 2 * Math.PI;
current += diff * speed;
```

## Architecture (read this before touching anything)

### Key Files
- `src/game/RemotePlayer.tsx` (1,267 lines) — renders remote players. Has separate branches for merc and jackalope types. Each branch returns different JSX with different RigidBody setups.
- `src/network/MultiplayerManager.tsx` (2,160 lines) — manages remote player state. HOT PATH writes to `window.__livePlayerData` (every frame). COLD PATH triggers React `setRemotePlayers` (only for structural changes like new player).
- `src/network/ConnectionManager.ts` (1,470 lines) — WebSocket connection, auth, message handling. Emits `player_joined`, `player_update`, `player_left`.
- `src/game/player.tsx` — local player controller. Sends position updates via `sendPlayerUpdate()`.
- `jackalopes-server/server.js` — WebSocket server. Relays updates between clients.

### Data Flow
1. Local player moves → `player.tsx` calls `connectionManager.sendPlayerUpdate()` at 60hz
2. Server receives `player_update`, broadcasts to other clients in session
3. `ConnectionManager.ts` receives update, emits `player_update` event
4. `MultiplayerManager.tsx` handles event:
   - HOT PATH: writes position/rotation to `window.__livePlayerData[playerId]` (no React render)
   - COLD PATH: if new player, calls `setRemotePlayers()` to add to React state (triggers render)
5. `RemotePlayer.tsx` reads from `window.__livePlayerData[playerId]` in useFrame, updates RigidBody transform

### Important: Running Server
The RUNNING server is at `~/clawd/jackalopes-server/server.js`. The SOURCE is at `~/clawd/jackalopes-v2/jackalopes-server/server.js`. After editing source, copy to running location and restart:
```bash
cp ~/clawd/jackalopes-v2/jackalopes-server/server.js ~/clawd/jackalopes-server/server.js
pkill -f "node server.js"
cd ~/clawd/jackalopes-server && node server.js &
```

### Build & Test
```bash
cd ~/clawd/jackalopes-v2 && npx vite build   # ~18 seconds
```
Test by opening two tabs:
- `http://147.182.235.54:5173/?role=merc`
- `http://147.182.235.54:5173/?role=jackalope`

## Approach
1. Read RemotePlayer.tsx IN FULL before making any changes
2. Read the merc branch and jackalope branch side by side — understand the difference
3. Fix the merc branch positioning (Bug 2) — add kinematic body + live store reads
4. Fix the server playerType relay (Bug 1) — trace the full auth→join→broadcast flow
5. Fix rotation interpolation (Bug 3) — angle wrapping
6. ALL hooks must be at the top level, NONE inside if(playerType) conditionals
7. Build, test, commit

## Git State
Current HEAD: `e089c93` — clean baseline with connection fixes only.
Safe to reset to: `dbf825d` if needed (last state before tonight's remote player changes, but also before connection fixes).
