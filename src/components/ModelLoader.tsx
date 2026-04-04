import React, { useEffect } from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ModelLoader preloads character models to have them ready when needed
export const ModelLoader = () => {
  useEffect(() => {
    console.log('ModelLoader: Preloading character models');
    
    // Preload both character models
    const loader = new GLTFLoader();
    
    // Preload merc model
    loader.load(
      '/merc.glb',
      (gltf) => {
        console.log('Successfully preloaded merc.glb');
      },
      (xhr) => {
        console.log(`Preloading merc.glb: ${(xhr.loaded / xhr.total) * 100}% loaded`);
      },
      (error) => {
        console.error('Error preloading merc.glb', error);
      }
    );
    
    // Preload jackalope model
    loader.load(
      '/jackalope.glb',
      (gltf) => {
        console.log('Successfully preloaded jackalope.glb');
      },
      (xhr) => {
        console.log(`Preloading jackalope.glb: ${(xhr.loaded / xhr.total) * 100}% loaded`);
      },
      (error) => {
        console.error('Error preloading jackalope.glb', error);
      }
    );
  }, []);
  
  // This is an invisible component
  return null;
} 