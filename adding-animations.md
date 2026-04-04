# Adding More Animations to the Merc Character

Currently, your Merc character is set up with a walking animation. Here's how to add more animations to make your character more dynamic:

## Current Setup

- Character model: `/src/game/characters/merc.glb`
- Walking animation: `/src/game/characters/animations/walk.fbx`

## How to Add More Animations

### Step 1: Export Animations from Mixamo

1. Go to [Mixamo](https://www.mixamo.com/)
2. Find animations that match the following actions:
   - `idle` - A standing idle pose
   - `run` - Running animation
   - `jump` - Jumping animation
   - `shoot` - Shooting animation
3. Download each animation as an FBX file
4. Make sure to download with the same settings you used for your walk animation

### Step 2: Add Files to Your Project

1. Place each animation FBX file in the `/src/game/characters/animations/` directory
2. Name them appropriately (e.g., `idle.fbx`, `run.fbx`, `jump.fbx`, `shoot.fbx`)

### Step 3: Update the MercModel Component

1. Open `src/game/MercModel.tsx`
2. Add each new animation to the loading logic. Find the section where `walk.fbx` is loaded:

```jsx
// Load walking animation
const fbxLoader = new FBXLoader();
fbxLoader.load('/src/game/characters/animations/walk.fbx', (fbx: THREE.Group) => {
  const walkAnimation = fbx.animations?.[0];
  
  // Rename animation for easier access
  if (walkAnimation) {
    walkAnimation.name = 'walk';
    console.log('Loaded walk animation:', walkAnimation);
    
    // Store animation in state
    setAnimationClips(prev => ({
      ...prev,
      walk: walkAnimation
    }));
  }
});
```

3. Add similar code blocks for each new animation:

```jsx
// Load idle animation
fbxLoader.load('/src/game/characters/animations/idle.fbx', (fbx: THREE.Group) => {
  const idleAnimation = fbx.animations?.[0];
  if (idleAnimation) {
    idleAnimation.name = 'idle';
    setAnimationClips(prev => ({ ...prev, idle: idleAnimation }));
  }
});

// Load run animation
fbxLoader.load('/src/game/characters/animations/run.fbx', (fbx: THREE.Group) => {
  const runAnimation = fbx.animations?.[0];
  if (runAnimation) {
    runAnimation.name = 'run';
    setAnimationClips(prev => ({ ...prev, run: runAnimation }));
  }
});

// Load jump animation
fbxLoader.load('/src/game/characters/animations/jump.fbx', (fbx: THREE.Group) => {
  const jumpAnimation = fbx.animations?.[0];
  if (jumpAnimation) {
    jumpAnimation.name = 'jump';
    setAnimationClips(prev => ({ ...prev, jump: jumpAnimation }));
  }
});

// Load shoot animation
fbxLoader.load('/src/game/characters/animations/shoot.fbx', (fbx: THREE.Group) => {
  const shootAnimation = fbx.animations?.[0];
  if (shootAnimation) {
    shootAnimation.name = 'shoot';
    setAnimationClips(prev => ({ ...prev, shoot: shootAnimation }));
  }
});
```

### Step 4: Update the Player Component

1. Open `src/game/player.tsx`
2. Find the useEffect for animation state:

```jsx
// Set the current animation based on movement state
useEffect(() => {
  // We only have walk animation from your fbx, so let's use it for all movement states
  // and adjust this when you add more animations
  if (isRunning || isWalking) {
    setCurrentAnimation('walk') // Use walk animation for both walking and running
  } else {
    setCurrentAnimation('walk') // Use walk animation for idle too until we have more animations
  }
}, [isWalking, isRunning, jumping.current])
```

3. Update it to use the correct animations:

```jsx
// Set the current animation based on movement state
useEffect(() => {
  if (isRunning) {
    setCurrentAnimation('run')
  } else if (isWalking) {
    setCurrentAnimation('walk')
  } else if (jumping.current) {
    setCurrentAnimation('jump')
  } else {
    setCurrentAnimation('idle')
  }
}, [isWalking, isRunning, jumping.current])
```

4. Also update the shoot handler:

```jsx
// Handle shooting animation
useEffect(() => {
  const handleShoot = () => {
    if (document.pointerLockElement) {
      // Handle first-person view shooting
      const fireAction = actions['Rig|Saiga_Fire']
      if (fireAction) {
        fireAction.setLoop(THREE.LoopOnce, 1)
        fireAction.reset().play()
      }
      
      // Set shooting animation for third-person view
      setCurrentAnimation('shoot')
      
      // Reset animation back to previous state after a short delay
      setTimeout(() => {
        if (isRunning) {
          setCurrentAnimation('run')
        } else if (isWalking) {
          setCurrentAnimation('walk')
        } else {
          setCurrentAnimation('idle')
        }
      }, 500)
    }
  }

  window.addEventListener('pointerdown', handleShoot)
  return () => window.removeEventListener('pointerdown', handleShoot)
}, [actions, isRunning, isWalking])
```

### Step 5: Test the Animations

1. Use the Model Tester (accessible from the button at the bottom right of the game) to verify that each animation loads correctly.
2. Play the game in third-person view to see the animations during gameplay.
3. Adjust the timing and transitions as needed for smooth animation blending.

## Tips for Animation Blending

- When switching between animations, use fadeIn/fadeOut with appropriate duration for smooth transitions
- For actions like shooting that interrupt other animations, use a timeout to return to the previous animation
- Make sure animations loop correctly for continuous actions (walking, running, idle)
- For one-time actions (jumping, shooting), set the appropriate loop mode (THREE.LoopOnce)

## Troubleshooting

- If animations don't play, check the console for errors about missing animations
- Verify that the animation names in your code match the filenames
- Ensure that all animations are for the same character rig/skeleton
- If animations look strange, the model and animations might need to be retargeted in Blender 