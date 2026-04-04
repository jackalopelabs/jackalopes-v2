# Model Directory Structure

To ensure your character models and animations work correctly in the game, follow this directory structure:

## Required Structure

Create the following directory structure in your project:

```
/public
  └── /src                      # Mirror of src directory for asset loading
      └── /game
          └── /characters       # Put character model files here
              ├── merc.glb      # Main character model
              └── /animations   # Animation files for characters
                  └── walk.fbx  # Walking animation
```

## Why This Structure

The game is configured to load models and animations from the `/public/src/game/characters/` directory. This structure:

1. Mirrors your source code structure in the public directory
2. Keeps character models organized separately from animations
3. Allows for easy addition of more character types in the future

## Steps to Set Up

1. Create the directories in your `/public` folder:

```bash
mkdir -p public/src/game/characters/animations
```

2. Place your model and animation files:

```bash
# Copy your character model
cp path/to/your/merc.glb public/src/game/characters/

# Copy your walking animation
cp path/to/your/walk.fbx public/src/game/characters/animations/
```

## Common Issues

If you're having trouble loading models:

1. **File not found errors**: Make sure the files are in exactly the right location and have the correct names
2. **CORS issues**: If accessing files in development server, ensure your server allows access to the files
3. **Format problems**: Make sure your merc.glb is a valid GLB file and walk.fbx is a valid FBX file with animations
4. **Path resolution**: If paths don't resolve correctly, try using the model tester to debug

## Adding New Models

When adding new characters or animations:

1. Place character models directly in the `/public/src/game/characters/` directory
2. Place their animations in the `/public/src/game/characters/animations/` directory
3. Update the MercModel component or create a new component for different character types 