import React from 'react';
import { X } from 'lucide-react';
import type { GameMode } from '../../game/game-mode';

interface IntroScreenProps {
  playerType: 'merc' | 'jackalope';
  gameMode?: GameMode;
  onClose: () => void;
  visible: boolean;
}

/**
 * IntroScreen component displays game instructions based on player type
 */
export const IntroScreen: React.FC<IntroScreenProps> = ({
  playerType,
  gameMode = 'hunt',
  onClose,
  visible
}) => {
  if (!visible) return null;

  // Background color matches the ScoreDisplay component
  const backgroundColor = 'rgba(30, 41, 59, 0.9)'; // Tailwind's slate-800 with opacity
  const buttonColor = 'rgb(99, 102, 241)'; // Tailwind's indigo-500

  if (gameMode === 'adventure') {
    return (
      <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50">
        <div className="relative w-full max-w-md rounded-2xl shadow-xl p-6 mx-4 bg-slate-900/90 backdrop-blur-xl">
          <button onClick={onClose} className="absolute top-3 right-3 text-gray-300 hover:text-white" aria-label="Close adventure instructions">
            <X size={24} />
          </button>
          <p className="text-[10px] font-bold tracking-[0.2em] text-blue-300 mb-2">ADVENTURE MODE</p>
          <h2 className="text-2xl font-bold mb-3 text-white">You are a jackalope</h2>
          <p className="text-gray-200 leading-relaxed">Explore together, find hidden eggs and mushrooms, and make your own adventure. There are no teams, guns, scores, or time limit.</p>
          <div className="mt-5 text-xs text-gray-300 grid grid-cols-2 gap-1">
            <div>WASD</div><div>Movement</div>
            <div>Space</div><div>Jump</div>
            <div>Shift</div><div>Sprint</div>
            <div>Mouse</div><div>Look around</div>
          </div>
          <button onClick={onClose} className="mt-6 w-full px-6 py-3 rounded-xl text-white font-bold bg-blue-500 hover:bg-blue-400 transition-colors">
            Start exploring
          </button>
        </div>
      </div>
    );
  }

  // Content based on player type
  const content = {
    merc: {
      title: 'You are a MERCENARY',
      goal: 'Stop the Jackalopes from jumping into the void by shooting them. This will respawn them further away from the void. 1 pt per kill. 5 min rounds.',
      color: 'text-red-500'
    },
    jackalope: {
      title: 'You are a JACKALOPE',
      goal: 'Sneak past the mercenaries and jump into the black void in the middle of the map. Don\'t get shot. 1 pt per rabbit hole. 5 min rounds.',
      color: 'text-blue-500'
    }
  };

  // Common controls section for both player types
  const controlsSection = (
    <div className="mt-4 text-xs text-gray-300">
      <h3 className="font-semibold mb-1">Controls:</h3>
      <div className="grid grid-cols-2 gap-1">
        <div>WASD</div><div>Movement</div>
        <div>Space</div><div>Jump</div>
        <div>Shift</div><div>Sprint</div>
        <div>Mouse</div><div>Look around</div>
        <div>Left Mouse</div><div>Shoot (Merc only)</div>
        <div>Escape</div><div>Release pointer</div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50">
      <div 
        className="relative w-full max-w-md rounded-lg shadow-xl p-6 mx-4" 
        style={{ backgroundColor }}
      >
        {/* Close button */}
        <button 
          onClick={onClose}
          className="absolute top-2 right-2 text-gray-300 hover:text-white"
        >
          <X size={24} />
        </button>
        
        {/* Header */}
        <h2 className={`text-xl font-bold mb-2 ${content[playerType].color}`}>
          {content[playerType].title}
        </h2>
        
        {/* Goal */}
        <div className="mb-4">
          <h3 className="text-white font-semibold mb-1">Goal:</h3>
          <p className="text-gray-200">{content[playerType].goal}</p>
        </div>
        
        {/* Controls */}
        {controlsSection}
        
        {/* Got it button */}
        <div className="mt-6 flex justify-center">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-md text-white font-medium"
            style={{ backgroundColor: buttonColor }}
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
};
