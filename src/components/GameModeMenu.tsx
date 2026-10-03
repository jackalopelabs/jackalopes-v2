import { useEffect, useRef, useState } from 'react';
import { Compass, Crosshair, Timer, Users, X } from 'lucide-react';
import type { GameMode } from '../game/game-mode';
import { getActiveGamepad } from '../common/hooks/use-gamepad';
import './GameModeMenu.css';

interface GameModeMenuProps {
  currentMode: GameMode | null;
  visible: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSelect: (mode: GameMode) => void;
}

const JackalopeMark = () => (
  <svg aria-hidden="true" viewBox="0 0 30 33" className="game-mode-menu__jackalope-mark">
    <path d="M12.7 14.6c-2 0-3.9.3-5.8 1.2-2.1 1-3.2 3.4-4.2 5.4-.3.8-.5 1.7-.7 2.5-.1.9.1 1.8-.1 2.7-2.4-.4-1.2 5.9.6 4.1-.2 1.5.6 1.6 1.7 1.1 1-.5 1.9-.6 3-.8.8-.1.7-.2 1.1-.8.1-.3.6-1 1.1-.7.6.3-.2 2.1-.1 2.8.1 1.1 1.2.7 2.2.8.9 0 1.8.2 2.7.1.5 0 1.1 0 1.4-.4.3-.5.1-1-.2-1.3-.7-.5-1.9-.3-2.8-.2-1.2.1-1.9-.2-1.4-1.5.4-1 .9-1.9 1.3-2.8.4-1 .3-2.4 1.6-2.1 1.4.4 1.5 1.2 1.7 2.5.3 1.4 1.2 5.6 3.1 5.1.2 0 .2-.7.4-.9.3 0 .6.6 1 .6.8-.2.5-.5.1-1-.9-1.1-.9-1.9-1.1-3.2-.2-1.1-.9-2.4-.8-3.4 0-1 1.3-1.6 2-2.2.9-.8 1.4-1.6 1.7-2.7.1-.5.2-1.2.6-1.5.4-.3.9 0 1.3-.1.9-.1 1.9-.6 2-1.6.1-1.1-.5-1.9-.5-2.8 0-.8.4-.8-.3-1.4-.4-.3-1-.4-.8-1 .1-.5.8-1.3 1.2-1.6.4-.4.7-.8 1.1-1.2.9-1 2-.5 3.1-1.9-.7-.2-1.8 1.4-2.2.5-.2-.5.7-2.5 1.1-3 .5-1 1.4-1.9 0-3.8-.2.9.1 1.1-.1 2.1-.2 1.1-.7 2-1.4 2.9-.6 1-1.2 2-1.7 3.1-.3.5-1.2 2.6-1.9 2.7-1 .1 0-2.3.2-2.9.4-1.1.8-2.1 1-3.2.1-.9.5-2.3 0-3.2-.5-1-2-1.1-2.5 0-.8 1.8 1 4.7-.2 6.3-1 1.4-1-1-.9-1.6.2-1.1-.5-1.7-.7-2.9-.1-.6-.1-1.3-.2-1.9-.4.4-.5 1-.4 1.4-.5.1-.7-.6-1.1-.8-.5-.2-1.1 0-1.4.3-.9.7-.4 2.1-.1 3 .4 1.1.7 2.1 1.1 3.2.5 1.1 1.2 2.1 1.6 3.2.3 1-.6 2.2-1.6 2.3" />
  </svg>
);

export const GameModeMenu = ({ currentMode, visible, onOpen, onClose, onSelect }: GameModeMenuProps) => {
  const [selectedMode, setSelectedMode] = useState<GameMode>(currentMode || 'adventure');
  const previousInput = useRef({ navigate: false, accept: false, back: false, menu: false });

  useEffect(() => {
    if (visible) setSelectedMode(currentMode || 'adventure');
  }, [currentMode, visible]);

  useEffect(() => {
    let frameId = 0;

    const pollGamepad = () => {
      const gamepad = getActiveGamepad();

      if (gamepad) {
        const horizontal = gamepad.axes[0] ?? 0;
        const navigate = Math.abs(horizontal) > 0.55
          || !!gamepad.buttons[14]?.pressed
          || !!gamepad.buttons[15]?.pressed;
        const accept = !!gamepad.buttons[0]?.pressed;
        const back = !!gamepad.buttons[1]?.pressed;
        const menu = !!gamepad.buttons[8]?.pressed || !!gamepad.buttons[9]?.pressed;

        if (!visible && menu && !previousInput.current.menu) {
          onOpen();
        }

        if (visible) {
          if (navigate && !previousInput.current.navigate) {
            setSelectedMode(mode => mode === 'adventure' ? 'hunt' : 'adventure');
          }
          if (accept && !previousInput.current.accept) {
            onSelect(selectedMode);
          }
          if (currentMode && back && !previousInput.current.back) {
            onClose();
          }
        }

        previousInput.current = { navigate, accept, back, menu };
      } else {
        previousInput.current = { navigate: false, accept: false, back: false, menu: false };
      }

      frameId = window.requestAnimationFrame(pollGamepad);
    };

    frameId = window.requestAnimationFrame(pollGamepad);
    return () => window.cancelAnimationFrame(frameId);
  }, [currentMode, onClose, onOpen, onSelect, selectedMode, visible]);

  return <>
    {currentMode && !visible && (
      <button className="game-mode-switch" onClick={onOpen} type="button">
        {currentMode === 'adventure' ? <Compass size={15} /> : <Crosshair size={15} />}
        <span>{currentMode === 'adventure' ? 'Adventure' : 'Hunt'}</span>
        <kbd>M / MENU</kbd>
      </button>
    )}

    {visible && (
      <div className="game-mode-menu" role="dialog" aria-modal="true" aria-labelledby="game-mode-title">
        <div className="game-mode-menu__ambient game-mode-menu__ambient--blue" />
        <div className="game-mode-menu__ambient game-mode-menu__ambient--orange" />

        {currentMode && (
          <button className="game-mode-menu__close" onClick={onClose} type="button" aria-label="Close game mode menu">
            <X size={22} />
          </button>
        )}

        <main className="game-mode-menu__content">
          <div className="game-mode-menu__brand">
            <JackalopeMark />
            <span>JACKALOPES</span>
          </div>
          <p className="game-mode-menu__eyebrow">Choose how you want to play</p>
          <h1 id="game-mode-title">Pick a game mode</h1>

          <div className="game-mode-menu__grid">
            <button
              type="button"
              className={`game-mode-card game-mode-card--adventure${currentMode === 'adventure' ? ' is-current' : ''}${selectedMode === 'adventure' ? ' is-selected' : ''}`}
              onClick={() => onSelect('adventure')}
              onPointerEnter={() => setSelectedMode('adventure')}
            >
              <span className="game-mode-card__glow" />
              <span className="game-mode-card__icon"><Compass size={30} /></span>
              <span className="game-mode-card__label">ADVENTURE</span>
              <strong>Explore together</strong>
              <span className="game-mode-card__description">Everyone plays as a jackalope. Roam the world, find eggs and mushrooms, and make your own adventure.</span>
              <span className="game-mode-card__facts">
                <span><Users size={15} /> All jackalopes</span>
                <span><Compass size={15} /> No competition</span>
              </span>
              <span className="game-mode-card__action">Start Adventure</span>
            </button>

            <button
              type="button"
              className={`game-mode-card game-mode-card--hunt${currentMode === 'hunt' ? ' is-current' : ''}${selectedMode === 'hunt' ? ' is-selected' : ''}`}
              onClick={() => onSelect('hunt')}
              onPointerEnter={() => setSelectedMode('hunt')}
            >
              <span className="game-mode-card__glow" />
              <span className="game-mode-card__icon"><Crosshair size={30} /></span>
              <span className="game-mode-card__label">ORIGINAL MODE</span>
              <strong>Jackalopes vs. mercs</strong>
              <span className="game-mode-card__description">Race for the rabbit hole or defend it as a mercenary in the original team hunt.</span>
              <span className="game-mode-card__facts">
                <span><Users size={15} /> Two teams</span>
                <span><Timer size={15} /> Five-minute rounds</span>
              </span>
              <span className="game-mode-card__action">Start Hunt</span>
            </button>
          </div>

          <p className="game-mode-menu__hint"><span>Left stick / D-pad to choose</span><span>A to select</span><span>Menu anytime to change modes</span></p>
        </main>
      </div>
    )}
  </>;
};
