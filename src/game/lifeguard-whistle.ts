import * as THREE from 'three'

export const whistleGain = (distance: number, master: number, sfx: number, muted: boolean) =>
  muted ? 0 : .12 * Math.max(0, 1 - distance / 72) ** 2 * Math.max(0, Math.min(1, master)) * Math.max(0, Math.min(1, sfx))

/** Shares Three's existing AudioContext. No context creation/resume until a player gesture. */
export function createLifeguardWhistle(readPreferences = true) {
  let context: AudioContext | undefined, output: GainNode | undefined, disposed = false
  let settings = { masterVolume: 1, sfxVolume: 1, muteAll: false }
  if (readPreferences) {
    try {
      const manager = (window as unknown as { __soundManager?: { getSettings(): Partial<typeof settings> } }).__soundManager
      settings = { ...settings, ...manager?.getSettings(), ...JSON.parse(localStorage.getItem('audioSettings') || '{}') }
    } catch { /* defaults */ }
  }
  const playing = new Set<OscillatorNode>()
  const apply = () => { if (output && context) output.gain.setValueAtTime(whistleGain(0, settings.masterVolume, settings.sfxVolume, settings.muteAll) / .12, context.currentTime) }
  const changed = (e: Event) => { settings = { ...settings, ...(e as CustomEvent).detail }; apply() }
  const unlock = () => {
    if (disposed || !navigator.userActivation?.hasBeenActive) return
    try {
      context ??= THREE.AudioContext.getContext()
      if (!output) { output = context.createGain(); output.connect(context.destination); apply() }
      if (context.state === 'suspended') void context.resume().catch(() => {})
    } catch { /* Audio unavailable: visible reaction still works. */ }
  }
  window.addEventListener('audioSettingsChanged', changed)
  window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock)
  unlock() // A prior Start/Join gesture can already have unlocked the game's shared audio.
  return {
    play(distance: number) {
      if (!context || !output || context.state !== 'running' || disposed) return
      const volume = whistleGain(distance, 1, 1, false)
      if (volume <= 0) return
      for (const [delay, duration, frequency] of [[0, .13, 2100], [.23, .16, 2350]]) {
        const oscillator = context.createOscillator(), envelope = context.createGain(), start = context.currentTime + delay
        oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency, start)
        oscillator.frequency.linearRampToValueAtTime(frequency * 1.035, start + duration * .5)
        oscillator.frequency.linearRampToValueAtTime(frequency * .98, start + duration)
        envelope.gain.setValueAtTime(0, start); envelope.gain.linearRampToValueAtTime(volume, start + .018)
        envelope.gain.exponentialRampToValueAtTime(.0001, start + duration)
        oscillator.connect(envelope); envelope.connect(output); playing.add(oscillator)
        oscillator.onended = () => { playing.delete(oscillator); oscillator.disconnect(); envelope.disconnect() }
        oscillator.start(start); oscillator.stop(start + duration + .02)
      }
    },
    dispose() {
      disposed = true; window.removeEventListener('audioSettingsChanged', changed)
      window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock)
      for (const oscillator of playing) { oscillator.stop(); oscillator.disconnect() }
      playing.clear(); output?.disconnect() // Never close/suspend the shared game context.
    },
  }
}
