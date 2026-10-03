import { Compass, Egg, Leaf, Mountain } from 'lucide-react';

interface AdventureHUDProps {
  avatar: 'jackalope' | 'astronaut';
  onToggleAvatar: () => void;
  goldenEggs: number;
  rainbowEggs: number;
  greenNightVision: boolean;
  onEditMap?: () => void;
  lushGrove: boolean;
  onToggleGrove: () => void;
}

export const AdventureHUD = ({ avatar, onToggleAvatar, goldenEggs, rainbowEggs, greenNightVision, onEditMap, lushGrove, onToggleGrove }: AdventureHUDProps) => (
  <div style={{
    position: 'fixed',
    top: 0,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 2000,
    display: 'flex',
    width: 'max-content',
    maxWidth: 'calc(100vw - 24px)',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '10px',
    padding: '9px 14px',
    borderBottomLeftRadius: '14px',
    borderBottomRightRadius: '14px',
    color: '#fff',
    background: 'linear-gradient(180deg, rgba(15,40,70,0.82), rgba(8,22,42,0.62))',
    boxShadow: '0 16px 40px rgba(0,0,0,0.22)',
    backdropFilter: 'blur(18px)',
    fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
    pointerEvents: 'none',
    userSelect: 'none',
  }}>
    <span style={{ display: 'grid', width: 34, height: 34, placeItems: 'center', borderRadius: 10, color: '#93c5fd', background: 'rgba(96,165,250,0.13)' }}>
      <Compass size={20} />
    </span>
    <span style={{ display: 'flex', flexDirection: 'column', minWidth: 118 }}>
      <strong style={{ fontSize: 11, letterSpacing: '0.16em', color: '#bfdbfe' }}>ADVENTURE</strong>
      <span style={{ marginTop: 2, fontSize: 10, color: '#94a3b8' }}>Explore together</span>
    </span>
    <button type="button" data-testid="adventure-avatar" onClick={onToggleAvatar}
      aria-label={avatar === 'astronaut' ? 'Switch to jackalope' : 'Switch to astronaut'}
      style={{ pointerEvents: 'auto', padding: '7px 9px', borderRadius: 9, border: '1px solid #58728d', background: '#172f46', color: '#d9edff', fontSize: 10, cursor: 'pointer' }}>
      {avatar === 'astronaut' ? 'Astronaut' : 'Jackalope'} ↔
    </button>
    {(goldenEggs > 0 || rainbowEggs > 0 || greenNightVision) && (
      <span style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.08)' }} />
    )}
    {goldenEggs > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#fde68a', fontSize: 12, fontWeight: 800 }}><Egg size={15} /> {goldenEggs}</span>}
    {rainbowEggs > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#ddd6fe', fontSize: 12, fontWeight: 800 }}><Egg size={15} /> {rainbowEggs}</span>}
    {greenNightVision && <span title="Night vision found" style={{ display: 'inline-flex', color: '#86efac' }}><Leaf size={16} /></span>}
    <button
      type="button"
      aria-label="Lush test grove"
      aria-pressed={lushGrove}
      onClick={onToggleGrove}
      title="Press G to compare the small foliage grove near the western starting area. The rest of the map is unchanged."
      style={{ pointerEvents: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '7px 9px', border: '1px solid rgba(134,239,172,0.2)', borderRadius: 9,
        color: lushGrove ? '#bbf7d0' : '#94a3b8', background: lushGrove ? 'rgba(74,222,128,0.12)' : 'rgba(15,23,42,0.3)',
        fontSize: 10, fontWeight: 800, cursor: 'pointer' }}
    >
      <Leaf size={14} /> Grove: {lushGrove ? 'Lush' : 'Classic'} <kbd style={{ fontSize: 9, opacity: 0.65 }}>G</kbd>
    </button>
    {onEditMap && (
      <button
        type="button"
        onClick={onEditMap}
        style={{
          pointerEvents: 'auto',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          marginLeft: 2,
          padding: '7px 10px',
          border: 0,
          borderRadius: 9,
          color: '#a5f3fc',
          background: 'rgba(34,211,238,0.11)',
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: '0.04em',
          cursor: 'pointer',
        }}
      >
        <Mountain size={14} /> Edit map
      </button>
    )}
  </div>
);
