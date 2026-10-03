import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ConnectionManager } from '../network/ConnectionManager';
import { WeaponSoundSettings } from './WeaponSoundEffects';

type ChatScope = 'all' | 'team' | 'proxy';

type ChatMessage = {
  id: string;
  playerId?: string;
  playerName?: string;
  message: string;
  timestamp: number;
  scope: ChatScope;
  deliveredByProxy?: boolean;
  effectiveScope?: 'all' | 'team';
};

type AudioSettings = {
  masterVolume: number;
  muteAll: boolean;
  footstepsEnabled: boolean;
  walkingVolume: number;
  runningVolume: number;
  spatialAudioEnabled: boolean;
  remoteSoundsEnabled: boolean;
  weaponVolume: number;
  micVolume: number;
  voiceChatEnabled: boolean;
  voiceActivationThreshold: number;
};

interface AudioCommsPanelProps {
  connectionManager: ConnectionManager;
  enabled: boolean;
  playerType: 'merc' | 'jackalope';
  position?: 'bottom-right' | 'right-center' | 'top-right';
}

type VoiceSignalMessage = {
  fromPlayerId: string;
  fromPlayerName?: string;
  fromPlayerType?: 'merc' | 'jackalope';
  signal: any;
  scope?: ChatScope;
};

const STORAGE_KEY = 'audioSettings';
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }],
};

const defaultSettings: AudioSettings = {
  masterVolume: 1,
  muteAll: false,
  footstepsEnabled: true,
  walkingVolume: 0.3,
  runningVolume: 0.4,
  spatialAudioEnabled: true,
  remoteSoundsEnabled: true,
  weaponVolume: 0.1,
  micVolume: 1,
  voiceChatEnabled: false,
  voiceActivationThreshold: 0.07,
};

const readSettings = (): AudioSettings => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings;
    return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {
    return defaultSettings;
  }
};

const scopeLabel = (scope: ChatScope, effectiveScope?: 'all' | 'team') => {
  if (scope === 'proxy') return 'PROXY';
  if ((effectiveScope || scope) === 'team') return 'TEAM';
  return 'ALL';
};

const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));

export const AudioCommsPanel: React.FC<AudioCommsPanelProps> = ({
  connectionManager,
  enabled,
  playerType,
  position = 'bottom-right',
}) => {
  const [settings, setSettings] = useState<AudioSettings>(defaultSettings);
  const [panelOpen, setPanelOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [scope, setScope] = useState<ChatScope>('team');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [micStatus, setMicStatus] = useState<'idle' | 'requesting' | 'live' | 'blocked' | 'unsupported'>('idle');
  const [micLevel, setMicLevel] = useState(0);
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [connectedPeers, setConnectedPeers] = useState<string[]>([]);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const seenIds = useRef(new Set<string>());
  const inputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const levelIntervalRef = useRef<number | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteAudioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const localTrackRef = useRef<MediaStreamTrack | null>(null);
  const currentScopeRef = useRef<ChatScope>('team');
  const accent = useMemo(() => playerType === 'merc' ? '#ff7a45' : '#60a5fa', [playerType]);

  const panelPositionStyle = position === 'top-right'
    ? { right: 'max(12px, env(safe-area-inset-right))', top: 'max(12px, env(safe-area-inset-top))' }
    : position === 'right-center'
    ? { right: '6px', top: '50%', transform: 'translateY(-50%)' }
    : { right: '20px', bottom: '20px' };

  const refreshConnectedPeers = () => {
    setConnectedPeers(Array.from(peerConnectionsRef.current.entries())
      .filter(([, pc]) => pc.connectionState === 'connected' || pc.connectionState === 'connecting')
      .map(([id]) => id));
  };

  const persistAndBroadcastSettings = (next: AudioSettings) => {
    setSettings(next);
    currentScopeRef.current = scope;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}

    WeaponSoundSettings.setMuted(next.muteAll);
    WeaponSoundSettings.setVolume(next.weaponVolume);
    window.__setWeaponVolume?.(next.weaponVolume);

    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = next.micVolume;
    }

    const effectiveMasterVolume = next.muteAll ? 0 : next.masterVolume;
    const detail = {
      masterVolume: effectiveMasterVolume,
      muteAll: next.muteAll,
      footstepsEnabled: next.footstepsEnabled,
      walkingVolume: next.walkingVolume,
      runningVolume: next.runningVolume,
      spatialAudioEnabled: next.spatialAudioEnabled,
      remoteSoundsEnabled: next.remoteSoundsEnabled,
      weaponVolume: next.weaponVolume,
      micVolume: next.micVolume,
      voiceChatEnabled: next.voiceChatEnabled,
      voiceActivationThreshold: next.voiceActivationThreshold,
    };

    window.dispatchEvent(new CustomEvent('audioSettingsChanged', { detail }));
    window.dispatchEvent(new CustomEvent('remoteSoundsToggled', {
      detail: { enabled: next.remoteSoundsEnabled && !next.muteAll }
    }));
  };

  const closePeer = (playerId: string) => {
    const pc = peerConnectionsRef.current.get(playerId);
    if (pc) {
      try { pc.close(); } catch {}
      peerConnectionsRef.current.delete(playerId);
    }
    const audioEl = remoteAudioElsRef.current.get(playerId);
    if (audioEl) {
      audioEl.pause();
      audioEl.srcObject = null;
      remoteAudioElsRef.current.delete(playerId);
    }
    refreshConnectedPeers();
  };

  const sendVoiceSignal = (targetPlayerId: string, signal: any) => {
    connectionManager.sendMessage({
      type: 'voice_signal',
      targetPlayerId,
      scope: currentScopeRef.current,
      signal,
    });
  };

  const ensurePeerConnection = async (remotePlayerId: string, polite: boolean) => {
    let pc = peerConnectionsRef.current.get(remotePlayerId);
    if (pc) return pc;

    const PeerCtor = (window as any).RTCPeerConnection || (window as any).webkitRTCPeerConnection || (window as any).mozRTCPeerConnection;
    pc = new PeerCtor(RTC_CONFIG);
    peerConnectionsRef.current.set(remotePlayerId, pc);

    if (localTrackRef.current) {
      pc.addTrack(localTrackRef.current, streamRef.current as MediaStream);
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendVoiceSignal(remotePlayerId, { type: 'ice', candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      let audioEl = remoteAudioElsRef.current.get(remotePlayerId);
      if (!audioEl) {
        audioEl = new Audio();
        audioEl.autoplay = true;
        audioEl.volume = settings.muteAll ? 0 : settings.masterVolume;
        remoteAudioElsRef.current.set(remotePlayerId, audioEl);
      }
      audioEl.srcObject = event.streams[0];
      audioEl.volume = settings.muteAll ? 0 : settings.masterVolume;
      audioEl.play().catch(() => {});
    };

    pc.onconnectionstatechange = () => {
      if (pc && ['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
        if (pc.connectionState !== 'disconnected') closePeer(remotePlayerId);
      }
      refreshConnectedPeers();
    };

    if (!polite) {
      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);
      sendVoiceSignal(remotePlayerId, { type: 'offer', sdp: offer.sdp });
    }

    refreshConnectedPeers();
    return pc;
  };

  const handleVoiceSignal = async (msg: VoiceSignalMessage) => {
    try {
      if (!settings.voiceChatEnabled || !localTrackRef.current) return;
      const remotePlayerId = msg.fromPlayerId;
      const signal = msg.signal;
      if (!remotePlayerId || !signal) return;

      const pc = await ensurePeerConnection(remotePlayerId, true);

      if (signal.type === 'offer') {
        await pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendVoiceSignal(remotePlayerId, { type: 'answer', sdp: answer.sdp });
      } else if (signal.type === 'answer') {
        await pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
      } else if (signal.type === 'ice' && signal.candidate) {
        await pc.addIceCandidate(signal.candidate);
      }
    } catch (err: any) {
      console.error('Voice signal error', err);
      setVoiceError(err?.message || 'Voice signaling failed');
    }
  };

  useEffect(() => {
    const loaded = readSettings();
    setSettings(loaded);
    persistAndBroadcastSettings(loaded);
  }, []);

  useEffect(() => {
    currentScopeRef.current = scope;
  }, [scope]);

  useEffect(() => {
    const handleChat = (payload: any) => {
      const incomingScope: ChatScope = payload.scope || 'all';
      const senderType = payload.playerType;
      const deliveredByProxy = !!payload.deliveredByProxy;
      const effectiveScope = payload.effectiveScope || (incomingScope === 'proxy' ? 'team' : incomingScope);

      if (incomingScope === 'team' && senderType && senderType !== playerType) return;
      if (incomingScope === 'proxy' && !deliveredByProxy && senderType === playerType) return;
      if (!payload.id || seenIds.current.has(payload.id)) return;

      seenIds.current.add(payload.id);
      setMessages(prev => [...prev.slice(-29), {
        id: payload.id,
        playerId: payload.player,
        playerName: payload.playerName,
        message: payload.message || '',
        timestamp: payload.timestamp || Date.now(),
        scope: incomingScope,
        deliveredByProxy,
        effectiveScope,
      }]);
    };

    connectionManager.on('chat', handleChat);
    connectionManager.on('voice_signal', handleVoiceSignal);
    return () => {
      connectionManager.off('chat', handleChat);
      connectionManager.off('voice_signal', handleVoiceSignal);
    };
  }, [connectionManager, playerType, settings.voiceChatEnabled]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !chatOpen && panelOpen) {
        setChatOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
        e.preventDefault();
      } else if (e.key === 'Escape' && chatOpen) {
        setChatOpen(false);
        setDraft('');
      } else if (chatOpen && e.key === 'Tab') {
        e.preventDefault();
        setScope(prev => prev === 'team' ? 'proxy' : prev === 'proxy' ? 'all' : 'team');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [chatOpen, panelOpen]);

  useEffect(() => {
    if (!settings.voiceChatEnabled) {
      setIsTransmitting(false);
      setMicStatus('idle');
      if (levelIntervalRef.current) {
        window.clearInterval(levelIntervalRef.current);
        levelIntervalRef.current = null;
      }
      peerConnectionsRef.current.forEach((_, id) => closePeer(id));
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      localTrackRef.current = null;
      analyserRef.current = null;
      gainNodeRef.current = null;
      return;
    }

    const hasNavigator = typeof navigator !== 'undefined';
    const hasMediaDevices = hasNavigator && !!navigator.mediaDevices;
    const hasGetUserMedia = hasMediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function';
    const hasWindow = typeof window !== 'undefined';
    const hasRTCPeer = hasWindow && (
      typeof (window as any).RTCPeerConnection !== 'undefined' ||
      typeof (window as any).webkitRTCPeerConnection !== 'undefined' ||
      typeof (window as any).mozRTCPeerConnection !== 'undefined'
    );
    const isSecure = !hasWindow || window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    if (!hasGetUserMedia || !hasRTCPeer || !isSecure) {
      setMicStatus('unsupported');

      const reasons: string[] = [];
      if (!isSecure) reasons.push('page is not running in a secure context (HTTPS or localhost)');
      if (!hasMediaDevices) reasons.push('navigator.mediaDevices is unavailable');
      if (!hasGetUserMedia) reasons.push('getUserMedia is unavailable');
      if (!hasRTCPeer) reasons.push('RTCPeerConnection is unavailable');

      setVoiceError(`Voice chat unavailable: ${reasons.join('; ') || 'unknown browser capability problem'}.`);
      return;
    }

    let cancelled = false;

    const initVoice = async () => {
      try {
        setVoiceError(null);
        setMicStatus('requesting');
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          }
        });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        streamRef.current = stream;
        localTrackRef.current = stream.getAudioTracks()[0] || null;

        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = audioContextRef.current || new AudioCtx();
        audioContextRef.current = ctx;

        const source = ctx.createMediaStreamSource(stream);
        const gain = ctx.createGain();
        gain.gain.value = settings.micVolume;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(gain);
        gain.connect(analyser);
        gainNodeRef.current = gain;
        analyserRef.current = analyser;

        setMicStatus('live');

        const data = new Uint8Array(analyser.frequencyBinCount);
        levelIntervalRef.current = window.setInterval(() => {
          if (!analyserRef.current || !localTrackRef.current) return;
          analyserRef.current.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const normalized = (data[i] - 128) / 128;
            sum += normalized * normalized;
          }
          const rms = Math.sqrt(sum / data.length);
          setMicLevel(rms);
          const transmitting = rms >= settings.voiceActivationThreshold && !settings.muteAll;
          setIsTransmitting(transmitting);
          localTrackRef.current.enabled = transmitting;
        }, 60);
      } catch (err: any) {
        console.error('Mic init failed', err);
        setMicStatus('blocked');
        setVoiceError(err?.message || 'Microphone permission denied');
      }
    };

    initVoice();

    return () => {
      cancelled = true;
      if (levelIntervalRef.current) {
        window.clearInterval(levelIntervalRef.current);
        levelIntervalRef.current = null;
      }
    };
  }, [settings.voiceChatEnabled, settings.voiceActivationThreshold, settings.micVolume, settings.muteAll]);

  useEffect(() => {
    remoteAudioElsRef.current.forEach((audioEl) => {
      audioEl.volume = settings.muteAll ? 0 : settings.masterVolume;
    });
  }, [settings.masterVolume, settings.muteAll]);

  useEffect(() => () => {
    peerConnectionsRef.current.forEach((_, id) => closePeer(id));
    if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
  }, []);

  const updateSetting = <K extends keyof AudioSettings>(key: K, value: AudioSettings[K]) => {
    const next = { ...settings, [key]: value };
    persistAndBroadcastSettings(next);
  };

  const startVoiceHandshake = async () => {
    if (!settings.voiceChatEnabled || !connectionManager.getPlayerId()) return;
    try {
      const remotePlayers = (window as any).__livePlayerData || {};
      const ids = Object.keys(remotePlayers);
      for (const remotePlayerId of ids) {
        if (!remotePlayerId || remotePlayerId === connectionManager.getPlayerId()) continue;
        if (peerConnectionsRef.current.has(remotePlayerId)) continue;
        await ensurePeerConnection(remotePlayerId, false);
      }
    } catch (err: any) {
      setVoiceError(err?.message || 'Failed to start voice chat');
    }
  };

  const sendChat = () => {
    const message = draft.trim();
    if (!message) return;
    connectionManager.sendMessage({
      type: 'chat',
      message,
      scope,
      id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      playerType,
    });
    setDraft('');
    setChatOpen(false);
  };

  if (!enabled) return null;

  return (
    <div style={{ position: 'fixed', ...panelPositionStyle, zIndex: 2200 }}>
      <div style={{ position: 'relative' }}>
        {panelOpen && (
          <div style={{
            position: 'absolute', right: 0,
            ...(position === 'top-right' ? { top: '64px' } : { bottom: position === 'right-center' ? 'calc(100% - 60px)' : '64px' }),
            width: 'min(390px, calc(100vw - 24px))',
            maxHeight: 'calc(100dvh - 100px)', overflowY: 'auto',
            background: 'linear-gradient(180deg, rgba(8,12,22,0.9) 0%, rgba(8,12,22,0.72) 100%)',
            borderRadius: 18,
            boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
            backdropFilter: 'blur(18px)',
            color: '#fff', overflow: 'hidden'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div>
                <div style={{ fontSize: 11, letterSpacing: '0.14em', color: '#94a3b8' }}>COMMS</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: accent }}>Audio + Voice + Chat</div>
              </div>
              <button onClick={() => updateSetting('muteAll', !settings.muteAll)} style={{ border: 'none', borderRadius: 999, padding: '8px 12px', cursor: 'pointer', background: settings.muteAll ? '#ef4444' : 'rgba(255,255,255,0.08)', color: '#fff', fontWeight: 700 }}>
                {settings.muteAll ? 'Muted' : 'Live'}
              </button>
            </div>

            <div style={{ padding: 16, display: 'grid', gap: 14 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6, color: '#cbd5e1' }}><span>Game Volume</span><span>{Math.round(settings.masterVolume * 100)}%</span></div>
                <input type="range" min={0} max={1} step={0.01} value={settings.masterVolume} onChange={(e) => updateSetting('masterVolume', clamp(Number(e.target.value)))} style={{ width: '100%' }} />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6, color: '#cbd5e1' }}><span>Weapon Volume</span><span>{Math.round(settings.weaponVolume * 100)}%</span></div>
                <input type="range" min={0} max={1} step={0.01} value={settings.weaponVolume} onChange={(e) => updateSetting('weaponVolume', clamp(Number(e.target.value)))} style={{ width: '100%' }} />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6, color: '#cbd5e1' }}><span>Microphone Gain</span><span>{Math.round(settings.micVolume * 100)}%</span></div>
                <input type="range" min={0} max={2} step={0.01} value={settings.micVolume} onChange={(e) => updateSetting('micVolume', clamp(Number(e.target.value), 0, 2))} style={{ width: '100%' }} />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6, color: '#cbd5e1' }}><span>Voice Activation</span><span>{Math.round(settings.voiceActivationThreshold * 100)}%</span></div>
                <input type="range" min={0.02} max={0.25} step={0.005} value={settings.voiceActivationThreshold} onChange={(e) => updateSetting('voiceActivationThreshold', clamp(Number(e.target.value), 0.02, 0.25))} style={{ width: '100%' }} />
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button onClick={() => updateSetting('voiceChatEnabled', !settings.voiceChatEnabled)} style={{ border: 'none', borderRadius: 12, padding: '10px 12px', cursor: 'pointer', background: settings.voiceChatEnabled ? accent : 'rgba(255,255,255,0.08)', color: '#fff', fontWeight: 700 }}>
                  {settings.voiceChatEnabled ? 'Mic Enabled' : 'Enable Mic'}
                </button>
                <button onClick={startVoiceHandshake} style={{ border: 'none', borderRadius: 12, padding: '10px 12px', cursor: 'pointer', background: 'rgba(255,255,255,0.08)', color: '#fff', fontWeight: 700 }}>
                  Connect Voice
                </button>
                <button onClick={() => updateSetting('remoteSoundsEnabled', !settings.remoteSoundsEnabled)} style={{ border: 'none', borderRadius: 12, padding: '10px 12px', cursor: 'pointer', background: settings.remoteSoundsEnabled ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)', color: '#fff', fontWeight: 700 }}>
                  {settings.remoteSoundsEnabled ? 'Remote Audio On' : 'Remote Audio Off'}
                </button>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 12, display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: '#cbd5e1' }}>Microphone</span>
                  <span style={{ fontSize: 11, color: isTransmitting ? '#34d399' : '#94a3b8', fontWeight: 700 }}>{micStatus}</span>
                </div>
                <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, micLevel * 600)}%`, background: isTransmitting ? '#34d399' : accent, transition: 'width 80ms linear' }} />
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>Connected peers: <strong style={{ color: '#fff' }}>{connectedPeers.length}</strong> · Scope: <strong style={{ color: '#fff' }}>{scope.toUpperCase()}</strong></div>
                {voiceError && <div style={{ fontSize: 11, color: '#fca5a5' }}>{voiceError}</div>}
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(['team', 'proxy', 'all'] as ChatScope[]).map(option => (
                  <button key={option} onClick={() => setScope(option)} style={{ border: 'none', borderRadius: 999, padding: '6px 10px', cursor: 'pointer', background: scope === option ? accent : 'rgba(255,255,255,0.08)', color: '#fff', fontWeight: 800, fontSize: 11 }}>
                    {option.toUpperCase()}
                  </button>
                ))}
              </div>

              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 11, letterSpacing: '0.12em', color: '#94a3b8' }}>TEXT CHAT</div>
                <div style={{ maxHeight: 160, overflowY: 'auto', padding: 12, display: 'grid', gap: 8 }}>
                  {messages.length === 0 ? <div style={{ fontSize: 12, color: '#94a3b8' }}>No chatter yet.</div> : messages.map(msg => (
                    <div key={msg.id} style={{ fontSize: 12 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', color: msg.scope === 'proxy' ? '#f9a8d4' : (msg.effectiveScope === 'team' ? accent : '#e2e8f0') }}>{scopeLabel(msg.scope, msg.effectiveScope)}</span>
                        <span style={{ fontWeight: 700, color: '#fff' }}>{msg.playerName || msg.playerId || 'unknown'}</span>
                      </div>
                      <div style={{ color: '#e2e8f0' }}>{msg.message}</div>
                    </div>
                  ))}
                </div>
                <div style={{ padding: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  {chatOpen ? (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendChat(); } if (e.key === 'Escape') { setChatOpen(false); setDraft(''); } }} placeholder={`Send ${scope} message...`} style={{ flex: 1, borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: '#fff', padding: '10px 12px', outline: 'none' }} />
                      <button onClick={sendChat} style={{ border: 'none', borderRadius: 10, padding: '0 14px', fontWeight: 800, cursor: 'pointer', background: accent, color: '#fff' }}>Send</button>
                    </div>
                  ) : (
                    <button onClick={() => { setChatOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }} style={{ width: '100%', border: '1px dashed rgba(255,255,255,0.16)', borderRadius: 10, background: 'rgba(255,255,255,0.04)', color: '#cbd5e1', padding: '10px 12px', textAlign: 'left', cursor: 'pointer' }}>Click or press Enter while this panel is open to chat.</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <button onClick={() => setPanelOpen(v => !v)} title={panelOpen ? 'Close comms' : 'Open comms'} style={{
          width: position === 'top-right' ? 44 : 56, height: position === 'top-right' ? 44 : 56, borderRadius: 999, border: '1px solid transparent',
          background: settings.muteAll ? 'linear-gradient(180deg, rgba(127,29,29,0.92) 0%, rgba(69,10,10,0.92) 100%)' : 'linear-gradient(180deg, rgba(15,23,42,0.92) 0%, rgba(2,6,23,0.92) 100%)',
          color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: panelOpen ? `0 0 0 1px ${accent}55, 0 16px 40px rgba(0,0,0,0.45)` : '0 10px 30px rgba(0,0,0,0.35)', backdropFilter: 'blur(14px)', position: 'relative'
        }}>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="currentColor" width="24" height="24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10.5v3a2.25 2.25 0 0 0 2.25 2.25h1.386a1.125 1.125 0 0 1 .795.33l2.714 2.715a.75.75 0 0 0 1.28-.53V5.73a.75.75 0 0 0-1.28-.53L7.43 7.915a1.125 1.125 0 0 1-.795.33H5.25A2.25 2.25 0 0 0 3 10.5Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 8.25a4.5 4.5 0 0 1 0 7.5M18 6a7.5 7.5 0 0 1 0 12" />
          </svg>
          {settings.voiceChatEnabled && <span style={{ position: 'absolute', right: 6, top: 6, width: 10, height: 10, borderRadius: '50%', background: isTransmitting ? '#34d399' : accent, boxShadow: `0 0 12px ${isTransmitting ? '#34d399' : accent}` }} />}
        </button>
      </div>
    </div>
  );
};

export default AudioCommsPanel;
