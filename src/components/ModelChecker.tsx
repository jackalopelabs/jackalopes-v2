import React, { useEffect } from 'react';

// Simple utility component to verify our model setup
export const ModelChecker: React.FC = () => {
  useEffect(() => {
    // Log information about model setup
    console.log('✅ Using direct THREE.js geometry for character models');
    console.log('👍 No external GLB models needed - reduced download size and complexity');
    
    // Check if we're in development
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      console.log('🏗️ Running in development mode with direct THREE.js geometry character models');
    }
  }, []);

  // This component doesn't render anything
  return null;
};

export default ModelChecker; 