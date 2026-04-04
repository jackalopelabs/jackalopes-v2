// Type definitions for NippleJS
// Provides TypeScript support for the nipplejs library

declare module 'nipplejs' {
  export interface JoystickOptions {
    zone: HTMLElement;
    mode?: 'static' | 'semi' | 'dynamic';
    position?: { top?: string | number; left?: string | number; bottom?: string | number; right?: string | number };
    size?: number;
    color?: string;
    lockX?: boolean;
    lockY?: boolean;
    shape?: 'circle' | 'square';
    dynamicPage?: boolean;
    identifier?: number;
    restJoystick?: boolean;
    restOpacity?: number;
    fadeTime?: number;
    multitouch?: boolean;
    maxNumberOfNipples?: number;
    threshold?: number;
    dataOnly?: boolean;
  }

  export interface JoystickOutputData {
    identifier: number;
    position: { x: number; y: number };
    force: number;
    distance: number;
    pressure: number;
    angle: {
      radian: number;
      degree: number;
    };
    instance: JoystickInstance;
    vector: { x: number; y: number };
    raw: { x: number; y: number };
    direction: {
      x: 'left' | 'right' | null;
      y: 'up' | 'down' | null;
      angle: string;
    };
  }

  export interface JoystickInstance {
    on(event: string, handler: (evt: any, data: JoystickOutputData) => void): void;
    off(event: string, handler: (evt: any, data: JoystickOutputData) => void): void;
    destroy(): void;
    identifier: number;
    options: JoystickOptions;
    position: { x: number; y: number };
  }

  export interface JoystickManager {
    on(event: string, handler: (evt: any, data: JoystickOutputData) => void): void;
    off(event: string, handler: (evt: any, data: JoystickOutputData) => void): void;
    destroy(): void;
    get(identifier: number): JoystickInstance;
    create(options: JoystickOptions): JoystickManager;
  }

  export function create(options: JoystickOptions): JoystickManager;
  export const factory: (options: JoystickOptions) => JoystickManager;
  export const manager: (options: JoystickOptions) => JoystickManager;
}

export default 'nipplejs'; 