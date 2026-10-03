# Jackalopes

A 3D first-person shooter game built with React Three Fiber, Rapier physics, and TypeScript.

## Adventure Terrain Editor

The Adventure Valley terrain is a versioned Jackalopes level document shared by the editor and the playable Rapier collision mesh.

- Play: `/?mode=adventure`
- Edit: `/?mode=adventure&editor=terrain`
- Left-drag sculpts. Shift + left-drag or middle-button drag pans the view and moves the orbit point. Right-drag or Option/Alt + left-drag orbits around that point; the mouse wheel zooms. Panning never paints or changes the saved map.
- Save publishes the current level as the shared multiplayer map while retaining a browser copy for offline fallback. Export/import JSON keeps portable backups.

The editor supports raise, lower, smooth, flatten, water, and dry brushes with per-stroke undo/redo. Lower a riverbed, choose Water, set its surface height, then paint a river or moat over it. Painted water supports swimming when it is deep enough (at least 2.3 m); shallows remain walkable. In deep water, use WASD / left stick to swim, hold Space / A (Cross) to rise, and C / LT (L2) to dive. Release vertical controls to gently float toward the surface. Holding up stops at the waterline; leaving the painted water restores normal gravity. Swimming has no oxygen timer. Terrain and obstacles still block movement. Adventure mode loads the shared terrain and water at startup and polls for newer revisions while players are online.

## Adventure visual style

Adventure uses stable twilight lighting, cool sky fill and warm highlights, a procedural dusk sky, and a restrained mint/copper survey grid. Distance-faded grid lines, slope contours, faceted terrain shading, and atmospheric haze preserve the simulation look while improving depth and readability. Low quality keeps the core look without post-processing; higher settings add shadowing on scenery and a small number of ambient motes. Hunt retains its timed lighting, and the golden mushroom still reveals its temporary holographic palette.

## Foliage test grove

One optional, 28m-wide grove near the western Adventure starting area adds instanced grass and ferns with gentle wind. **Grove: Lush / Classic** in the Adventure bar (or the G key while exploring) toggles only that patch, remembers the local choice, and does not modify the shared map. The existing trees, visible grid path, pickups, and collisions stay unchanged. Placement follows sculpted terrain and skips water and steep banks. Reduced-motion preferences disable wind. Low quality caps the patch at two draw calls and about 40k triangles, with no foliage shadow casting; it is hidden beyond 90m. This is a bounded visual experiment, not a measured FPS guarantee on player devices.

## Adventure caves

The central rabbit hole becomes a real underground cave entrance in Adventure: walk down its ramp to a hub and three connected crystal chambers. Continue through the northern chamber into a descending passage, a large underground lake, and a dry crystal grotto on the far shore. The lake is up to 9m deep, with room to swim at the surface or dive among submerged crystals. Warm guide lights and amber floor chevrons point back toward the entrance. There are no loading portals or one-way drops. The underground camera moves closer and checks the cave shell to stay inside walls and ceilings.

A winding waterslide starts in the northern upper chamber at approximately (-5, -70). Walk beneath the SLIDE arch and press **F / controller X / touch Use** to board. The guided flume bends down into the underground lake and hands control back to swimming with a splash. Follow the ordinary lit approach back up to ride again; respawning cancels a ride. No new multiplayer message type is required.

Beyond the lake, the back-left corner of the dry grotto is the start of Everly's room: a cozy pink bed with a heart cushion, star duvet, soft oval rug, and warm bedside lamp. The bed and table have solid collisions, follow the cave floor, and leave the route back to the water open.

Daddy's bed sits in the opposite back-right corner, with a dark walnut frame, navy upholstered headboard and pillows, teal quilt, forest-green throw, rectangular rug, and warm bedside lamp. Its solid bed and nightstand fit inside the angled cave wall and keep the middle of the grotto open.

Hunt retains its original central scoring circle. Cave geometry is a runtime Adventure overlay: it opens only the central four terrain cells, restores their surface around the entrance, and leaves the shared editor document unchanged. Existing surface swimming and pickups remain in place. Underground water is a bounded Adventure-only volume, separate from the terrain editor water level. The same keyboard, gamepad, and contextual touch swimming controls work in the lake.

## Features

- First-person character controller with smooth movement and physics
- Kinematic character controller with automatic stepping and sliding
- Physics-based shooting mechanics with colorful sphere projectiles
- Gamepad support with configurable controls
- 3D environment with physics-based collision
- Post-processing effects for visual enhancements
- Multiplayer functionality with real-time shooting across different browsers/devices
- WordPress plugin integration for scalable multiplayer server

## Technology Stack

- React & React Three Fiber for 3D rendering
- Rapier physics engine for realistic physics simulation
- Three.js for 3D graphics
- TypeScript for type safety
- Vite for fast development and building
- WebSockets for multiplayer communication
- WordPress plugin (PHP/Ratchet) for production multiplayer server
- LocalStorage for cross-browser communication during development

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- For multiplayer: Either the test server or a WordPress installation (local or remote)

### Installation

1. Clone the repository
   ```
   git clone https://github.com/jackalopelabs/jackalopes-v2.git
   cd jackalopes-v2
   ```

2. Install dependencies
   ```
   npm install
   ```

3. Choose a multiplayer server option:

   **Option A: Development Test Server**
   ```
   cd jackalopes-server
   node server.js --network
   ```

   **Option B: WordPress Plugin Server (Recommended for Production)**
   - Install the WordPress plugin (see "WordPress Plugin Installation" section below)
   - Start the server from WordPress admin or using the standalone script

4. Start the development server
   ```
   npm run dev
   ```

5. Open your browser at the URL shown in the terminal output. Vite will automatically find an available port, typically starting with `http://localhost:5173/` and incrementing if ports are already in use.

### WordPress Plugin Installation

The multiplayer functionality is powered by a WordPress plugin that can be installed in several ways:

#### Via Composer (Recommended)

1. Add the repository to your WordPress site's `composer.json`:
   ```json
   "repositories": [
       {
           "type": "vcs",
           "url": "https://github.com/yourusername/jackalopes-server"
       }
   ]
   ```

2. Require the package:
   ```bash
   composer require jackalopes/jackalopes-server
   ```

3. Activate the plugin in WordPress admin.

#### Manual Installation

1. Copy the `jackalopes-server` directory to your WordPress plugins directory
2. Run `composer install` within the plugin directory to install dependencies
3. Activate the plugin in WordPress admin

#### Configuration

1. Navigate to "Jackalopes" in the WordPress admin menu
2. Configure the server port, max connections, and other settings
3. Start the server from the dashboard

### Testing Multiplayer Functionality

To test multiplayer features:

1. Open multiple browser windows pointing to the same URL
2. Enable multiplayer in the settings menu in each window
3. Use the test buttons (UNIVERSAL BROADCAST, TEST SHOT) to verify cross-browser communication
4. Shots fired in one window should appear in all connected windows

## Controls

- WASD: Movement
- Space: Jump
- Shift: Sprint
- Mouse: Look around
- Left Mouse Button: Shoot projectiles
- Escape: Release pointer lock

### Gamepad Support

- Left Stick: Movement
- Right Stick: Look around
- A/Cross Button: Jump
- L3/Left Stick Press: Sprint
- R2/Right Trigger: Shoot

## Multiplayer Architecture

The multiplayer system consists of:

1. **Client Components**:
   - ConnectionManager - WebSocket client for server communication
   - MultiplayerManager - React components for multiplayer state management
   - Client-side prediction and reconciliation systems
   - Network state synchronization

2. **Server Components** (WordPress Plugin):
   - WebSocket server built on Ratchet
   - Session management and player authentication
   - Game state persistence with WordPress database
   - REST API endpoints for game/server statistics

3. **Communication Protocol**:
   - JSON-based messaging protocol
   - Support for game snapshots and state synchronization
   - Hybrid localStorage/WebSocket approach for cross-browser testing

## Multiplayer Development Process

The multiplayer functionality was developed through an iterative process that addressed several technical challenges:

### Development Challenges and Solutions

#### Challenge 1: Event Propagation Across Clients
Initially, shooting events from one client weren't being properly received by other clients.

**Solution:**
- Added unique identifiers (shotId) to each shooting event
- Implemented logging throughout the event chain to track message flow
- Enhanced the server's broadcast system to ensure all clients receive events

#### Challenge 2: Duplicate Shot Handling
Shots were sometimes processed multiple times, creating duplicate visual effects.

**Solution:**
- Created a global tracking mechanism using `window.__processedShots` to store already-processed shots
- Implemented shot deduplication based on unique IDs at multiple levels
- Added validation to ensure messages contain all required fields before processing

#### Challenge 3: Cross-Browser Communication
Different browser instances weren't reliably communicating through WebSockets alone.

**Solution:**
- Implemented a hybrid approach using both WebSockets and localStorage
- Created a universal broadcasting system that works across different browsers
- Added multiple test buttons for troubleshooting different communication methods

#### Challenge 4: Synchronization and State Management
Keeping track of remote shots state consistently across clients.

**Solution:**
- Used React's useRef to prevent closure issues in event handlers
- Implemented polling mechanisms to regularly check for updates from other sources
- Added reference tracking to ensure state updates properly reflect the latest data

## Building for Production

```
npm run build
```

The built files will be in the `dist` directory.

## Physics System

The game uses Rapier's kinematic character controller for player movement with:
- Auto-stepping for navigating small obstacles
- Sliding along walls
- Ground snapping
- Jump mechanics with variable height based on button press duration

## Project Structure

- `src/` - Source code
  - `game/` - Game-specific components
    - `player.tsx` - Player controller and movement
    - `ball.tsx` - Physics-based ball object
    - `sphere-tool.tsx` - Projectile shooting mechanics
    - `platforms.tsx` - Level platforms
  - `common/` - Shared components and hooks
  - `network/` - Multiplayer networking components
    - `ConnectionManager.ts` - WebSocket client for server communication
    - `MultiplayerManager.tsx` - React components for multiplayer state management
  - `App.tsx` - Main application component
- `jackalopes-server/` - WordPress plugin for multiplayer server
  - `includes/` - Core WordPress plugin functions
  - `admin/` - Admin interface components
  - `src/` - Autoloaded server classes (PSR-4)
  - `bin/` - Command-line utilities

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Asset Management

We've implemented a new approach to asset management for better organization and build optimization:

- Assets are now stored in the `src/assets` directory, organized by type
- A centralized asset index at `src/assets/index.ts` manages all asset references
- This allows Vite to properly optimize and bundle assets during builds

For complete details on the new asset management system, see [ASSET_MANAGEMENT.md](./ASSET_MANAGEMENT.md).

### Quick Migration Guide

To move existing assets from the public directory to the new assets structure:

```
node move-assets.js
```

Then, update your imports to use the asset index:

```diff
- // Old way - hardcoded paths
- const modelPath = '/src/game/characters/merc.glb';
- 
+ // New way - centralized asset management
+ import { MercModelPath } from '../assets';
```

## Golden mushroom / Holographic Sense

Adventure mode hides a golden mushroom in the western forest. Walk close and press F or controller X (Square) to eat it. For 60 seconds, the simulation grid shifts through cyan, violet, and gold while slow sonar pulses reveal faint outlines of nearby scenery through obstacles (70 m range). The ordinary look returns when the effect expires or you respawn; collisions never change. Each player can discover it independently, and it regrows locally after 90 seconds. The pickup follows the saved terrain height and prefers a dry hiding spot.

### Touch controls (iPad, phones, and touch-enabled handhelds)

Touch devices show one compact movement stick. Push it fully to run; swipe on the right side of the game view to look. Hold **Jump ↑** to jump or swim upward and **Use** to interact/eat nearby items. **Dive** appears only while swimming. Secondary actions are tucked under **…**, with **Shoot** always available for mercs. Moving, looking and holding an action work simultaneously. Menu/editor navigation remains ordinary touch input; touch play does not need pointer lock.

Touch feeds the existing controller path directly, including cameras and held swimming actions. An idle on-screen stick does not mask a connected physical controller, such as the ROG Ally. Releasing/canceling touches, switching away from the page, opening the mode menu, or changing orientation clears held input. No additional multiplayer messages are sent by the UI.

## Working from a fresh checkout

```bash
npm ci
npm test
npm run build
npm run dev
```

The Pod's currently running multiplayer server is versioned separately in
[jackalopelabs/jackalopes-server](https://github.com/jackalopelabs/jackalopes-server).
Its `server.js` differs from the copy bundled in this repository. Use the separate
repository when working on the running server. The client currently connects to
the BonsaiPod's WebSocket endpoint; `SERVER_PORT` configures a local server's port.

The tests include a snapshot of the saved Adventure Valley terrain at
`tests/fixtures/adventure-valley.json`; they do not require the Pod's live
`level-data/` directory. The fixture is a source-controlled snapshot, and
runtime map saves stay in the ignored `level-data/` directory. To restore this
snapshot for a local `serve-prod.cjs` session:

```bash
mkdir -p level-data
cp tests/fixtures/adventure-valley.json level-data/adventure-valley.json
node serve-prod.cjs
```

Generated `dist-*/` directories and the original large drone download/HDR
are excluded from Git. The drone meshes, material files, textures, and Blender
source remain tracked. A verified pre-sync archive containing the original
assets, saved terrain, source, and Git history is preserved on the BonsaiPod at
`/mnt/bonsai_data_sfo3/archive/jackalopes-sync-20261003T183342Z/source-and-git.tar.gz`.
