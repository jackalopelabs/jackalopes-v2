import * as THREE from 'three'
import { cutRabbitHoleWorld, RABBIT_HOLE_POSITION, RABBIT_HOLE_RADIUS } from './rabbit-hole-opening'

export type MountainOptions = {
  position: [number, number, number]; scale: number; height: number; width: number; depth: number;
  color: string; roughness: number; seed: number
}
export type MountainRangeOptions = {
  position: [number, number, number]; count?: number; spread?: number; baseScale?: number;
  scaleVariation?: number; heightVariation?: number
}

export function mountainRangeLayout({ position, count = 5, spread = 20, baseScale = 1,
  scaleVariation = .3, heightVariation = .4 }: MountainRangeOptions): MountainOptions[] {
    const result = [];
    
    for (let i = 0; i < count; i++) {
      // Create mountain parameters
      const offset = (i / (count - 1) - 0.5) * spread;
      const seed = position[0] * 1000 + position[2] * 100 + i;
      const random = (x: number) => Math.sin(seed * x) * 10000 % 1;
      
      // Calculate random variations
      const scale = baseScale * (1 - scaleVariation / 2 + random(0.1) * scaleVariation);
      const height = 30 * (1 - heightVariation / 2 + random(0.2) * heightVariation);
      
      // Calculate position and ensure mountains face outward from the center
      let posX = position[0] + offset + (random(0.4) - 0.5) * (spread / count);
      let posZ = position[2] + (random(0.5) - 0.5) * (spread / 4);
      
      // Adjust position to ensure mountains face outward from map center
      const distanceFromCenter = Math.sqrt(position[0]**2 + position[2]**2);
      if (distanceFromCenter > 0) {
        // Calculate unit vector pointing away from center
        const dirX = position[0] / distanceFromCenter;
        const dirZ = position[2] / distanceFromCenter;
        
        // Add outward bias to position (push mountains away from center)
        const outwardBias = 5 + random(0.6) * 10;
        posX += dirX * outwardBias;
        posZ += dirZ * outwardBias;
      }
      
      // Generate different mountain colors based on index - use darker shades
      const colorBase = {
        r: 78 + random(0.8) * 15, // Lowered base red
        g: 54 + random(0.9) * 10, // Lowered base green
        b: 45 + random(1.0) * 8  // Lowered base blue
      };
      
      result.push({
        position: [posX, position[1], posZ] as [number, number, number], scale, height,
        width: 20 + random(0.6) * 10, depth: 20 + random(0.7) * 10,
        color: `rgb(${Math.floor(colorBase.r)}, ${Math.floor(colorBase.g)}, ${Math.floor(colorBase.b)})`,
        roughness: 0.8 + random(1.1) * 0.15, seed,
      });
    }
    
    return result;
}

export function createMountainGeometry({ position, scale, height, width, depth, seed }: MountainOptions,
  adventureStyle = false) {
  const random = (i: number) => {
    const x = Math.sin(seed + i) * 10000
    return x - Math.floor(x)
  }
  const geometry = (() => {
      const baseGeometry = new THREE.BufferGeometry();
      
      // Generate mountain shape with peaks and valleys
      const vertices = [];
      const indices = [];
      
      // Parameters for the mountain generation
      const segmentsWidth = 5;
      const segmentsDepth = 5;
      
      // Create vertices grid with randomized heights
      for (let z = 0; z <= segmentsDepth; z++) {
        for (let x = 0; x <= segmentsWidth; x++) {
          // Calculate normalized position (0 to 1)
          const nx = x / segmentsWidth;
          const nz = z / segmentsDepth;
          
          // Calculate radial distance from center (0 to 1)
          const dx = nx - 0.5;
          const dz = nz - 0.5;
          const distFromCenter = Math.sqrt(dx * dx + dz * dz) * 2;
          
          // Create height falloff from center to edge (mountain shape)
          let h = Math.max(0, 1 - distFromCenter);
          
          // Add noise to the height
          const noiseAmount = 0.4;
          h += (random(x * 100 + z) - 0.5) * noiseAmount * h;
          
          // Apply height
          const y = h * height;
          
          // Position the vertex in 3D space
          vertices.push(
            (nx - 0.5) * width,  // X
            y,                   // Y
            (nz - 0.5) * depth   // Z
          );
        }
      }
      
      // Create triangles
      for (let z = 0; z < segmentsDepth; z++) {
        for (let x = 0; x < segmentsWidth; x++) {
          const a = x + z * (segmentsWidth + 1);
          const b = x + 1 + z * (segmentsWidth + 1);
          const c = x + (z + 1) * (segmentsWidth + 1);
          const d = x + 1 + (z + 1) * (segmentsWidth + 1);
          
          // Add two triangles to make a quad
          indices.push(a, c, b);
          indices.push(b, c, d);
        }
      }
      
      // Add attributes to geometry
      baseGeometry.setIndex(indices);
      baseGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      baseGeometry.computeVertexNormals();
      
      return baseGeometry;
  })()
  // A bounding-box collider would seal this cut. Only intersecting scenery uses
  // its actual concave surface for both rendering and collision.
  geometry.computeBoundingBox()
  const transform = new THREE.Matrix4().makeScale(scale, scale, scale).setPosition(...position)
  const bounds = geometry.boundingBox!.clone().applyMatrix4(transform)
  const { x, z } = RABBIT_HOLE_POSITION
  // The actual terrain opening stays small; nearby scenery also clears the landing
  // so a bunny can step off the last stone onto the surface instead of into a cliff.
  const clearance = 2.5, radius = RABBIT_HOLE_RADIUS + clearance
  const rabbitHoleCut = adventureStyle && bounds.max.x >= x - radius &&
    bounds.min.x <= x + radius && bounds.max.z >= z - radius &&
    bounds.min.z <= z + radius
  if (rabbitHoleCut) {
    geometry.applyMatrix4(transform)
    cutRabbitHoleWorld(geometry, clearance)
    geometry.applyMatrix4(transform.clone().invert())
  }
  return { geometry, rabbitHoleCut }
}
