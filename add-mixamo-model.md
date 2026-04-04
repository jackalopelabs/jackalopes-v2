# Adding Mixamo Animation to the Merc Character

Follow these steps to add your Mixamo animation to the merc character in the game:

## Step 1: Prepare Your Mixamo Model

1. If you have an FBX file from Mixamo:
   - Convert it to GLB format for better compatibility with Three.js
   - You can use tools like [gltf.io](https://gltf.io/) or Blender to convert FBX to GLB

## Step 2: Add the Model to the Project

1. Place your GLB file in the `public` directory of the project
2. Rename it to `merc_animation.glb` to match the code we've implemented

```bash
# From the project root directory:
cp /path/to/your/mixamo-animation.glb public/merc_animation.glb
```

## Step 3: Verify Animation Names

The animations in your Mixamo model should have the following names to work properly with our implementation:
- `idle` - Default standing pose
- `walk` - Walking animation
- `run` - Running animation 
- `jump` - Jumping animation
- `shoot` - Shooting animation

If your animations have different names, you'll need to either:
1. Rename them in the model file (using a tool like Blender)
2. Update the animation name mappings in `src/game/player.tsx` to match your model's animation names

## Step 4: Adjust Model Positioning if Needed

If the model doesn't appear correctly positioned, you may need to adjust the following values in `src/game/player.tsx`:

```jsx
<MercModel 
    animation={currentAnimation} 
    visible={visible}
    position={[0, -0.85, 0]} // Adjust these values to position the model correctly
    rotation={[0, Math.PI, 0]} // Adjust rotation if needed
/>
```

## Step 5: Testing

1. Make sure "Merc" character is selected in the game
2. Enable third-person view
3. Verify that animations work properly when:
   - Standing still (idle)
   - Walking
   - Running
   - Jumping
   - Shooting 