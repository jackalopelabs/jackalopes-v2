# Converting Mixamo FBX to GLB Format

If your Mixamo animation is in FBX format, you need to convert it to GLB format for better compatibility with Three.js and React Three Fiber. Here's how to do it using Blender:

## Using Blender

1. **Download and Install Blender** (if you don't have it):
   - Download from [blender.org](https://www.blender.org/download/)
   - Follow the installation instructions

2. **Open Blender and Import Your FBX File**:
   - Go to **File > Import > FBX (.fbx)**
   - Navigate to your Mixamo FBX file and import it

3. **Check Animations**:
   - Go to the **Animation** workspace tab at the top
   - Verify that your animations are imported correctly
   - You can play the animation using the playback controls at the bottom

4. **Rename Animations if Needed**:
   - In the **Dope Sheet Editor** (usually at the bottom of the screen), switch to **Action Editor** mode
   - Rename your animations to match the names used in our code:
     - `idle` for the idle standing pose
     - `walk` for walking
     - `run` for running
     - `jump` for jumping
     - `shoot` for shooting

5. **Export as GLB**:
   - Go to **File > Export > glTF 2.0 (.glb/.gltf)**
   - In the export options (right side panel):
     - Format: **GLB**
     - Check "**Include Animations**"
     - Check "**Include All Bone Influences**"
     - Check "**Include Shape Keys**" if your model has facial animations
   - Name your file `merc_animation.glb`
   - Click **Export**

6. **Copy to Your Project**:
   - Copy the exported `merc_animation.glb` file to your project's `public` directory

## Using Online Converters (Alternative)

If you don't want to use Blender, you can try these online converters:

1. [Aspose 3D Conversion Tool](https://products.aspose.app/3d/conversion/fbx-to-glb)
2. [Online 3D Converter](https://www.online-convert.com/3d-model-converter)

Note: Online converters may not preserve animations correctly, so Blender is recommended.

## Testing Your Model

After converting, use the ModelTester component to verify that your model and animations work correctly:

1. Place the `merc_animation.glb` file in the `public` directory
2. Create a temporary route to test your model:

```jsx
// In src/App.tsx, add temporarily:
import ModelTester from './game/ModelTester'

// Then in the App component, add:
{showModelTester && <ModelTester />}

// And add a state variable:
const [showModelTester, setShowModelTester] = useState(false)

// Add a button somewhere to show the tester:
<button onClick={() => setShowModelTester(!showModelTester)}>
  Test Model
</button>
```

3. After verifying the model works, you can remove the test code. 