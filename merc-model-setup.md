# Troubleshooting Merc Model Setup

If you're experiencing issues with the Merc character model and animations, follow this guide to troubleshoot.

## Current File Structure

The game is looking for these files:

- Character model: `/src/game/characters/merc.glb`
- Walking animation: `/src/game/characters/animations/walk.fbx`

These files should be placed in the `/public` directory to match the paths above:

```
/public
  └── /src                      # Mirror of src directory for asset loading
      └── /game
          └── /characters       # Put character model files here
              ├── merc.glb      # Main character model
              └── /animations   # Animation files for characters
                  └── walk.fbx  # Walking animation
```

## Common Issues and Solutions

### 1. Files Not Found

If you're seeing a red box instead of your character, the model files can't be found. Verify:

- The files exist in the correct locations (see structure above)
- The files have the correct names (`merc.glb` and `walk.fbx`)
- You've created all the necessary directories in your `/public` folder

You can create the required directories with:

```bash
mkdir -p public/src/game/characters/animations
```

### 2. File Path Issues

Check if your files are in a different location than expected:

1. Locate your model and animation files
2. Move them to the correct locations:
   ```bash
   # Copy your character model
   cp path/to/your/merc.glb public/src/game/characters/
   
   # Copy your walking animation
   cp path/to/your/walk.fbx public/src/game/characters/animations/
   ```

### 3. Incorrect File Type

Make sure your model is in GLB format and your animation is in FBX format. If not:

1. For GLB files: Use Blender or another 3D tool to convert your model to GLB format
2. For FBX files: Export animations from Mixamo in FBX format

### 4. Model and Animation Mismatch

If the model loads but animations don't work:

1. The rig in your GLB model might not match the rig in your FBX animation
2. The animation might not have been exported properly
3. Try re-downloading both from Mixamo with consistent settings

## Using the Model Tester

Use the Model Tester (button at bottom right of game) to debug issues:

1. It will show whether the files were found
2. If there's an error loading either file, it will display a message
3. It will show a red box if the model failed to load
4. It will show a yellow cube if the animation failed to load

## Manually Checking Files

You can manually check if your files exist by:

1. Opening the browser's Developer Tools (F12)
2. Going to the Network tab
3. Reloading the page and looking for:
   - `merc.glb` - Should return 200 status
   - `walk.fbx` - Should return 200 status

## Alternative File Locations

If you can't modify the directory structure, you can update the code to point to your files:

1. Find the model path in `src/game/MercModel.tsx`
2. Change `/src/game/characters/merc.glb` to your actual file path
3. Change `/src/game/characters/animations/walk.fbx` to your animation path

## Checking Console for Errors

Look at the browser console for specific error messages:

1. "Failed to load resource" - File not found
2. "CORS policy" - Cross-origin issues, try moving files to `/public`
3. "Unexpected token" - File format issues
4. "No animations found" - Animation might be empty or incompatible 