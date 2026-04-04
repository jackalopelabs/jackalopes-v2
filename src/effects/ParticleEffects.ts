import * as THREE from 'three';

/**
 * Creates an explosion effect at the specified position
 */
export function createExplosionEffect(position: THREE.Vector3, color: string, particleCount: number, radius: number) {
  // Create a new scene element for the particles
  const particles = new THREE.Group();
  particles.position.copy(position);
  
  // Create material for particles
  const particleMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    transparent: true,
    opacity: 0.7
  });
  
  // Create small spheres for each particle
  for (let i = 0; i < particleCount; i++) {
    const size = Math.random() * 0.1 + 0.05;
    const geometry = new THREE.SphereGeometry(size, 6, 6);
    const particle = new THREE.Mesh(geometry, particleMaterial);
    
    // Set random position within radius
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    const r = Math.random() * radius;
    
    particle.position.x = r * Math.sin(phi) * Math.cos(theta);
    particle.position.y = r * Math.sin(phi) * Math.sin(theta);
    particle.position.z = r * Math.cos(phi);
    
    // Add velocity for animation
    (particle as any).velocity = new THREE.Vector3(
      particle.position.x * 5,
      particle.position.y * 5,
      particle.position.z * 5
    );
    
    particles.add(particle);
  }
  
  // Add to scene
  const scene = window.THREE_ROOT?.scene;
  if (scene) {
    scene.add(particles);
    
    // Animate particles
    let elapsed = 0;
    const animate = (delta: number) => {
      elapsed += delta;
      
      // Move particles outward and fade
      particles.children.forEach((child: any) => {
        child.position.x += child.velocity.x * delta;
        child.position.y += child.velocity.y * delta;
        child.position.z += child.velocity.z * delta;
        child.material.opacity = Math.max(0, 0.7 - elapsed * 2);
        child.scale.multiplyScalar(0.98); // Shrink
      });
      
      // Remove when done
      if (elapsed > 0.5) {
        scene.remove(particles);
        particles.children.forEach((child: any) => {
          child.geometry.dispose();
          child.material.dispose();
        });
        return;
      }
      
      requestAnimationFrame(() => animate(0.016));
    };
    
    animate(0);
  }
}

/**
 * Creates a spawn effect at the specified position
 */
export function createSpawnEffect(position: THREE.Vector3, color: string, particleCount: number, radius: number) {
  // Create a new scene element for the particles
  const particles = new THREE.Group();
  particles.position.copy(position);
  
  // Create material for particles
  const particleMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    transparent: true,
    opacity: 0
  });
  
  // Create small spheres for each particle
  for (let i = 0; i < particleCount; i++) {
    const size = Math.random() * 0.1 + 0.05;
    const geometry = new THREE.SphereGeometry(size, 6, 6);
    const particle = new THREE.Mesh(geometry, particleMaterial);
    
    // Set random position within radius
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    const r = radius;
    
    particle.position.x = r * Math.sin(phi) * Math.cos(theta);
    particle.position.y = r * Math.sin(phi) * Math.sin(theta);
    particle.position.z = r * Math.cos(phi);
    
    // Add velocity for animation
    (particle as any).velocity = new THREE.Vector3(
      -particle.position.x * 5,
      -particle.position.y * 5,
      -particle.position.z * 5
    );
    
    particles.add(particle);
  }
  
  // Add to scene
  const scene = window.THREE_ROOT?.scene;
  if (scene) {
    scene.add(particles);
    
    // Animate particles
    let elapsed = 0;
    const animate = (delta: number) => {
      elapsed += delta;
      
      // Move particles inward and fade in, then out
      particles.children.forEach((child: any) => {
        child.position.x += child.velocity.x * delta;
        child.position.y += child.velocity.y * delta;
        child.position.z += child.velocity.z * delta;
        
        // First fade in, then fade out
        if (elapsed < 0.25) {
          child.material.opacity = elapsed * 4; // Fade in
        } else {
          child.material.opacity = Math.max(0, 1 - (elapsed - 0.25) * 4); // Fade out
        }
      });
      
      // Remove when done
      if (elapsed > 0.5) {
        scene.remove(particles);
        particles.children.forEach((child: any) => {
          child.geometry.dispose();
          child.material.dispose();
        });
        return;
      }
      
      requestAnimationFrame(() => animate(0.016));
    };
    
    animate(0);
  }
}

// Register global functions for these effects
if (typeof window !== 'undefined') {
  window.__createExplosionEffect = createExplosionEffect;
  window.__createSpawnEffect = createSpawnEffect;
}

// Add THREE_ROOT declaration to window
declare global {
  interface Window {
    THREE_ROOT?: {
      scene: THREE.Scene;
    };
    __createExplosionEffect?: typeof createExplosionEffect;
    __createSpawnEffect?: typeof createSpawnEffect;
  }
} 