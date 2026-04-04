# Asset Management Guide

This guide explains how to properly manage assets in the Jackalopes project.

## Asset Structure

Assets are now stored in the `src/assets` directory, which is organized by asset type:

```
src/assets/
├── characters/
│   ├── merc.glb
│   └── animations/
│       ├── walk.fbx
│       ├── idle.fbx
│       └── ...
├── environment/
├── textures/
└── sounds/
```

## Asset Index

Assets are managed through a centralized asset index at `src/assets/index.ts`. This approach:

1. Keeps asset references organized in one place
2. Makes it easy to see what assets are available
3. Allows for proper error handling
4. Lets Vite optimize assets during builds

### Usage Example

```typescript
// Import assets from centralized asset index
import { MercModelPath, Animations } from '../assets';

// Load model
const { scene } = useGLTF(MercModelPath);

// Load animation
fbxLoader.load(Animations.Merc.Walk, (fbx) => {
  // Animation loaded successfully
});
```

## Moving Assets from Public to Assets Directory

To help move assets from the old `public` directory structure to the new `src/assets` structure, use the included helper script:

```bash
node move-assets.js
```

This script will:
1. Copy files from `public/src/game/characters` to `src/assets/characters`
2. Preserve subdirectory structure
3. Report progress and any errors

## Asset Types and Formats

### 3D Models
- **Preferred format:** GLB
- **Alternative formats:** GLTF, FBX

### Animations
- **Preferred format:** FBX for individual animations
- **Note:** Animations can also be embedded in GLB/GLTF models

### Textures
- **Preferred formats:** PNG, JPEG
- **Use PNG for:** Textures with transparency, UI elements
- **Use JPEG for:** Photographic textures, backgrounds

### Audio
- **Preferred formats:** MP3, WAV
- **Use MP3 for:** Music, longer sounds
- **Use WAV for:** Short sound effects

## Converting FBX to GLB

For better compatibility with Three.js and React Three Fiber, we recommend converting FBX models to GLB format using Blender:

1. Open Blender
2. Import FBX file: **File > Import > FBX (.fbx)**
3. Check animations in the Animation workspace
4. Export as GLB: **File > Export > glTF 2.0 (.glb/.gltf)**
   - Enable "Animation" and "Include Animations"
   - Set Format to "GLB"

## Add New Assets

To add new assets:

1. Add the asset files to the appropriate subdirectory in `src/assets/`
2. Update the asset index in `src/assets/index.ts` to include the new assets
3. Import and use the assets in your components

## Testing Assets

Use the `ModelTester` component to verify that models and animations are loading correctly:

```tsx
import { ModelTester } from './game/ModelTester';

// In your component
return <ModelTester />;
```

## Troubleshooting

If assets fail to load, check:

1. The file path is correct in the asset index
2. The file exists in the correct location
3. The file format is supported by the loader you're using
4. Console errors for more specific issues

For more complex asset issues, check the Three.js documentation or the React Three Fiber documentation. 