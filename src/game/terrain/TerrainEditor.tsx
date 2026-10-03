import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { Canvas, type ThreeEvent } from '@react-three/fiber'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Download,
  Droplets,
  Eraser,
  FileUp,
  Gamepad2,
  Mountain,
  Redo2,
  RotateCcw,
  Save,
  Waves,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import './TerrainEditor.css'
import {
  clearTerrainLevel,
  loadTerrainLevel,
  normalizeTerrainLevel,
  publishTerrainLevel,
  sampleBaseTerrainHeight,
  saveTerrainLevel,
  TERRAIN_SEGMENTS,
  TERRAIN_SIZE,
  terrainHeightAtVertex,
  terrainVertexIndex,
  terrainVertexWorldPosition,
  type TerrainLevelDocument,
  type TerrainTool,
} from './level-document'
import { WaterSurface } from './WaterSurface'

type BrushSettings = {
  tool: TerrainTool
  radius: number
  strength: number
}

type TerrainSurfaceProps = {
  level: TerrainLevelDocument
  brush: BrushSettings
  revision: number
  onStrokeStart: (x: number, z: number) => void
  onStroke: (x: number, z: number) => void
  onStrokeEnd: () => void
}

type LevelSnapshot = Pick<TerrainLevelDocument, 'heightOffsets' | 'waterMask'>

// Keep the initial target stable so brush/UI rerenders never recenter a panned view.
const INITIAL_ORBIT_TARGET: [number, number, number] = [0, -8, 0]

const TOOL_OPTIONS: Array<{
  id: TerrainTool
  label: string
  hint: string
  icon: typeof Mountain
}> = [
  { id: 'raise', label: 'Raise', hint: 'Build hills and ridges', icon: ArrowUpFromLine },
  { id: 'lower', label: 'Lower', hint: 'Cut valleys and paths', icon: ArrowDownToLine },
  { id: 'smooth', label: 'Smooth', hint: 'Soften sharp terrain', icon: Waves },
  { id: 'flatten', label: 'Flatten', hint: 'Make playable ground', icon: Eraser },
  { id: 'water', label: 'Water', hint: 'Paint swimmable water', icon: Droplets },
  { id: 'erase-water', label: 'Dry', hint: 'Erase painted water', icon: Eraser },
]

function buildTerrainGeometry(level: TerrainLevelDocument): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS)
  const positions = geometry.attributes.position.array as Float32Array

  for (let index = 0; index < positions.length / 3; index += 1) {
    const column = index % (TERRAIN_SEGMENTS + 1)
    const row = Math.floor(index / (TERRAIN_SEGMENTS + 1))
    positions[index * 3 + 2] = terrainHeightAtVertex(level, column, row)
  }

  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

function TerrainSurface({ level, brush, revision, onStrokeStart, onStroke, onStrokeEnd }: TerrainSurfaceProps) {
  const [cursor, setCursor] = useState<[number, number, number] | null>(null)
  const painting = useRef(false)
  const geometry = useMemo(() => buildTerrainGeometry(level), [level, revision])

  useEffect(() => () => geometry.dispose(), [geometry])

  const updateCursor = (event: ThreeEvent<PointerEvent>) => {
    const waterTool = brush.tool === 'water' || brush.tool === 'erase-water'
    setCursor([event.point.x, (waterTool ? Math.max(event.point.y, level.waterLevel) : event.point.y) + 0.35, event.point.z])
  }

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0 || event.altKey || event.shiftKey) return
    event.stopPropagation()
    painting.current = true
    event.target.setPointerCapture(event.pointerId)
    updateCursor(event)
    onStrokeStart(event.point.x, event.point.z)
  }

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    updateCursor(event)
    if (!painting.current) return
    event.stopPropagation()
    onStroke(event.point.x, event.point.z)
  }

  const finishStroke = (event: ThreeEvent<PointerEvent>) => {
    if (!painting.current) return
    painting.current = false
    event.target.releasePointerCapture(event.pointerId)
    onStrokeEnd()
  }

  return (
    <group>
      <mesh
        geometry={geometry}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishStroke}
        onPointerCancel={finishStroke}
        onPointerLeave={() => {
          if (!painting.current) setCursor(null)
        }}
      >
        <meshStandardMaterial
          color="#667b63"
          roughness={0.92}
          metalness={0.02}
          vertexColors={false}
          flatShading
        />
      </mesh>

      <WaterSurface level={level} revision={revision} editor />

      {cursor && (
        <group position={cursor}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[brush.radius * 0.96, brush.radius, 64]} />
            <meshBasicMaterial color={brush.tool === 'erase-water' ? '#fda4af' : '#67e8f9'} transparent opacity={0.9} depthTest={false} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[brush.radius, 64]} />
            <meshBasicMaterial color="#22d3ee" transparent opacity={0.09} depthWrite={false} />
          </mesh>
        </group>
      )}
    </group>
  )
}

function EditorScene(props: TerrainSurfaceProps) {
  const [navigationModifierHeld, setNavigationModifierHeld] = useState(false)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      setNavigationModifierHeld(event.altKey || event.shiftKey)
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      setNavigationModifierHeld(event.altKey || event.shiftKey)
    }
    const clearModifier = () => setNavigationModifierHeld(false)

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', clearModifier)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', clearModifier)
    }
  }, [])

  return (
    <>
      <color attach="background" args={['#071017']} />
      <fog attach="fog" args={['#071017', 520, 1050]} />
      <ambientLight intensity={0.48} />
      <hemisphereLight args={['#dffcff', '#101912', 0.85]} />
      <directionalLight
        castShadow
        position={[260, 360, 190]}
        intensity={2.2}
        color="#f3fbff"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-440}
        shadow-camera-right={440}
        shadow-camera-top={440}
        shadow-camera-bottom={-440}
      />
      <directionalLight position={[-240, 110, -260]} intensity={0.48} color="#67e8f9" />
      <TerrainSurface {...props} />
      <gridHelper args={[TERRAIN_SIZE, 40, '#2dd4bf', '#17333a']} position={[0, 0.16, 0]} />
      <PerspectiveCamera makeDefault position={[310, 270, 310]} near={0.5} far={1800} fov={48} />
      <OrbitControls
        makeDefault
        target={INITIAL_ORBIT_TARGET}
        minDistance={80}
        maxDistance={920}
        maxPolarAngle={Math.PI * 0.48}
        enablePan
        screenSpacePanning
        enableDamping
        dampingFactor={0.08}
        mouseButtons={{
          // OrbitControls turns ROTATE into PAN when Shift is held.
          LEFT: navigationModifierHeld ? THREE.MOUSE.ROTATE : -1 as THREE.MOUSE,
          MIDDLE: THREE.MOUSE.PAN,
          RIGHT: THREE.MOUSE.ROTATE,
        }}
      />
    </>
  )
}

export function TerrainEditor() {
  const [level, setLevel] = useState<TerrainLevelDocument>(() => loadTerrainLevel())
  const [tool, setTool] = useState<TerrainTool>('raise')
  const [radius, setRadius] = useState(34)
  const [strength, setStrength] = useState(5)
  const [revision, setRevision] = useState(0)
  const [saved, setSaved] = useState(true)
  const [message, setMessage] = useState('Shift + left-drag to pan and move the orbit point. Left-drag to sculpt.')
  const undoStack = useRef<LevelSnapshot[]>([])
  const redoStack = useRef<LevelSnapshot[]>([])
  const strokeStart = useRef<LevelSnapshot | null>(null)
  const flattenHeight = useRef<number | null>(null)
  const lastStamp = useRef<[number, number] | null>(null)
  const importInput = useRef<HTMLInputElement>(null)

  const snapshotLevel = (source: TerrainLevelDocument): LevelSnapshot => ({
    heightOffsets: [...source.heightOffsets],
    waterMask: [...source.waterMask],
  })

  const replaceSnapshot = (snapshot: LevelSnapshot) => {
    setLevel((current) => ({
      ...current,
      heightOffsets: [...snapshot.heightOffsets],
      waterMask: [...snapshot.waterMask],
    }))
    setRevision((current) => current + 1)
    setSaved(false)
  }

  const stampTerrain = (x: number, z: number) => {
    const last = lastStamp.current
    if (last && Math.hypot(last[0] - x, last[1] - z) < Math.max(2.5, radius * 0.1)) return
    lastStamp.current = [x, z]

    setLevel((current) => {
      const source = current.heightOffsets
      const next = [...source]
      const waterSource = current.waterMask
      const nextWater = [...waterSource]
      const step = TERRAIN_SIZE / TERRAIN_SEGMENTS
      const centerColumn = Math.round((x + TERRAIN_SIZE / 2) / step)
      const centerRow = Math.round((z + TERRAIN_SIZE / 2) / step)
      const vertexRadius = Math.ceil(radius / step)

      for (let row = Math.max(0, centerRow - vertexRadius); row <= Math.min(TERRAIN_SEGMENTS, centerRow + vertexRadius); row += 1) {
        for (let column = Math.max(0, centerColumn - vertexRadius); column <= Math.min(TERRAIN_SEGMENTS, centerColumn + vertexRadius); column += 1) {
          const [vertexX, vertexZ] = terrainVertexWorldPosition(column, row)
          const distance = Math.hypot(vertexX - x, vertexZ - z)
          if (distance > radius) continue

          const index = terrainVertexIndex(column, row)
          const falloff = (Math.cos((distance / radius) * Math.PI) + 1) * 0.5

          if (tool === 'water') nextWater[index] = Math.max(waterSource[index], falloff)
          if (tool === 'erase-water') nextWater[index] = waterSource[index] * (1 - Math.min(1, falloff * 1.35))
          if (tool === 'raise') next[index] = Math.min(120, source[index] + strength * falloff)
          if (tool === 'lower') next[index] = Math.max(-120, source[index] - strength * falloff)
          if (tool === 'flatten' && flattenHeight.current !== null) {
            const baseHeight = sampleBaseTerrainHeight(vertexX, vertexZ)
            const targetOffset = flattenHeight.current - baseHeight
            next[index] = THREE.MathUtils.lerp(source[index], targetOffset, Math.min(0.8, 0.16 + strength * 0.035) * falloff)
          }
          if (tool === 'smooth') {
            let totalHeight = 0
            let samples = 0
            for (let offsetRow = -1; offsetRow <= 1; offsetRow += 1) {
              for (let offsetColumn = -1; offsetColumn <= 1; offsetColumn += 1) {
                const sampleColumn = Math.max(0, Math.min(TERRAIN_SEGMENTS, column + offsetColumn))
                const sampleRow = Math.max(0, Math.min(TERRAIN_SEGMENTS, row + offsetRow))
                const [sampleX, sampleZ] = terrainVertexWorldPosition(sampleColumn, sampleRow)
                totalHeight += sampleBaseTerrainHeight(sampleX, sampleZ) + source[terrainVertexIndex(sampleColumn, sampleRow)]
                samples += 1
              }
            }
            const targetOffset = totalHeight / samples - sampleBaseTerrainHeight(vertexX, vertexZ)
            next[index] = THREE.MathUtils.lerp(source[index], targetOffset, Math.min(0.72, 0.12 + strength * 0.025) * falloff)
          }
        }
      }

      return { ...current, heightOffsets: next, waterMask: nextWater }
    })

    setRevision((current) => current + 1)
    setSaved(false)
  }

  const beginStroke = (x: number, z: number) => {
    strokeStart.current = snapshotLevel(level)
    lastStamp.current = null
    const step = TERRAIN_SIZE / TERRAIN_SEGMENTS
    const column = Math.max(0, Math.min(TERRAIN_SEGMENTS, Math.round((x + TERRAIN_SIZE / 2) / step)))
    const row = Math.max(0, Math.min(TERRAIN_SEGMENTS, Math.round((z + TERRAIN_SIZE / 2) / step)))
    flattenHeight.current = terrainHeightAtVertex(level, column, row)
    stampTerrain(x, z)
  }

  const endStroke = () => {
    if (strokeStart.current) {
      undoStack.current.push(strokeStart.current)
      if (undoStack.current.length > 30) undoStack.current.shift()
      redoStack.current = []
    }
    strokeStart.current = null
    flattenHeight.current = null
    lastStamp.current = null
  }

  const undo = () => {
    const previous = undoStack.current.pop()
    if (!previous) return
    redoStack.current.push(snapshotLevel(level))
    replaceSnapshot(previous)
  }

  const redo = () => {
    const next = redoStack.current.pop()
    if (!next) return
    undoStack.current.push(snapshotLevel(level))
    replaceSnapshot(next)
  }

  const save = async (): Promise<boolean> => {
    const localLevel = saveTerrainLevel(level)
    setLevel(localLevel)
    setSaved(false)
    setMessage('Saving the shared multiplayer map…')

    try {
      const sharedLevel = await publishTerrainLevel(localLevel)
      setLevel(sharedLevel)
      setSaved(true)
      setMessage('Shared map saved. Other players will load this terrain automatically.')
      return true
    } catch (error) {
      setMessage(`${error instanceof Error ? error.message : 'Shared save failed.'} Your browser copy is safe; press Save map to retry.`)
      return false
    }
  }

  const reset = async () => {
    if (!window.confirm('Reset every terrain edit and return to the original Adventure Valley?')) return
    undoStack.current.push(snapshotLevel(level))
    redoStack.current = []
    const resetLevel = clearTerrainLevel()
    setLevel(resetLevel)
    setRevision((current) => current + 1)
    setSaved(false)
    setMessage('Reset locally. Publishing the original shared map…')
    try {
      const sharedLevel = await publishTerrainLevel(saveTerrainLevel(resetLevel))
      setLevel(sharedLevel)
      setSaved(true)
      setMessage('Shared terrain reset to the original map.')
    } catch (error) {
      setMessage(`${error instanceof Error ? error.message : 'Shared reset failed.'} Press Save map to retry.`)
    }
  }

  const exportLevel = () => {
    const exported = { ...level, updatedAt: new Date().toISOString() }
    const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${level.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'jackalopes-level'}.json`
    link.click()
    URL.revokeObjectURL(url)
    setMessage('Level JSON exported. Import it in another browser to share the same terrain.')
  }

  const importLevel = async (file: File) => {
    try {
      const imported = normalizeTerrainLevel(JSON.parse(await file.text()))
      undoStack.current.push(snapshotLevel(level))
      redoStack.current = []
      setLevel(imported)
      setRevision((current) => current + 1)
      setSaved(false)
      setMessage(`Imported “${imported.name}”. Save it before playing.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'That terrain file could not be imported.')
    }
  }

  const play = async () => {
    if (!saved && !await save()) return
    window.location.href = '/?mode=adventure'
  }

  return (
    <main className="terrain-editor">
      <div className="terrain-editor__viewport">
        <Canvas shadows dpr={[1, 1.5]} gl={{ antialias: true, powerPreference: 'high-performance' }}>
          <EditorScene
            level={level}
            brush={{ tool, radius, strength }}
            revision={revision}
            onStrokeStart={beginStroke}
            onStroke={stampTerrain}
            onStrokeEnd={endStroke}
          />
        </Canvas>
      </div>

      <header className="terrain-editor__header terrain-panel">
        <div className="terrain-editor__brand">
          <span><Mountain size={20} /></span>
          <div>
            <small>JACKALOPES // WORLD LAB</small>
            <input
              aria-label="Level name"
              value={level.name}
              onChange={(event) => {
                setLevel((current) => ({ ...current, name: event.target.value }))
                setSaved(false)
              }}
            />
          </div>
        </div>
        <div className={`terrain-editor__status ${saved ? 'is-saved' : ''}`}>
          <i /> {saved ? 'Shared map saved' : 'Unsaved terrain'}
        </div>
        <button className="terrain-button terrain-button--primary" type="button" onClick={() => void play()}>
          <Gamepad2 size={16} /> Play map
        </button>
      </header>

      <aside className="terrain-editor__tools terrain-panel">
        <div className="terrain-panel__heading">
          <span>SCULPT TERRAIN</span>
          <strong>Brush tools</strong>
        </div>
        <div className="terrain-tool-grid">
          {TOOL_OPTIONS.map((option) => {
            const Icon = option.icon
            return (
              <button
                key={option.id}
                className={`terrain-tool ${tool === option.id ? 'is-active' : ''} ${option.id.includes('water') || option.id === 'water' ? 'is-water-tool' : ''}`}
                type="button"
                onClick={() => {
                  setTool(option.id)
                  if (option.id === 'water') setMessage('Paint water over a lowered riverbed. Deep water lets players swim; shallow water stays walkable.')
                  if (option.id === 'erase-water') setMessage('Left-drag over painted water to dry that part of the map.')
                }}
                title={option.hint}
              >
                <Icon size={17} />
                <span>{option.label}</span>
              </button>
            )
          })}
        </div>

        <label className="terrain-slider">
          <span><b>Brush radius</b><output>{radius} m</output></span>
          <input type="range" min="12" max="110" step="2" value={radius} onChange={(event) => setRadius(Number(event.target.value))} />
        </label>
        {tool === 'water' || tool === 'erase-water' ? (
          <>
            <label className="terrain-slider terrain-slider--water">
              <span><b>Water surface</b><output>{level.waterLevel.toFixed(0)} m</output></span>
              <input
                type="range"
                min="-80"
                max="40"
                step="1"
                value={level.waterLevel}
                onChange={(event) => {
                  setLevel((current) => ({ ...current, waterLevel: Number(event.target.value) }))
                  setRevision((current) => current + 1)
                  setSaved(false)
                }}
              />
            </label>
            <div className="terrain-water-note">
              <Droplets size={16} />
              <span><b>Swimmable water</b><small>Deep water: swim and float. Shallows: wade.</small></span>
            </div>
          </>
        ) : (
          <label className="terrain-slider">
            <span><b>Strength</b><output>{strength.toFixed(1)} m</output></span>
            <input type="range" min="0.5" max="12" step="0.5" value={strength} onChange={(event) => setStrength(Number(event.target.value))} />
          </label>
        )}

        <div className="terrain-editor__history">
          <button type="button" onClick={undo} title="Undo last stroke"><RotateCcw size={16} /> Undo</button>
          <button type="button" onClick={redo} title="Redo last stroke"><Redo2 size={16} /> Redo</button>
        </div>
      </aside>

      <aside className="terrain-editor__files terrain-panel">
        <div className="terrain-panel__heading">
          <span>LEVEL DOCUMENT</span>
          <strong>Save and share</strong>
        </div>
        <button className="terrain-file-action" type="button" onClick={() => void save()}><Save size={16} /><span><b>Save shared map</b><small>Send it to every player</small></span></button>
        <button className="terrain-file-action" type="button" onClick={exportLevel}><Download size={16} /><span><b>Export JSON</b><small>Share or keep a backup</small></span></button>
        <button className="terrain-file-action" type="button" onClick={() => importInput.current?.click()}><FileUp size={16} /><span><b>Import JSON</b><small>Load a shared map</small></span></button>
        <input
          ref={importInput}
          hidden
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void importLevel(file)
            event.target.value = ''
          }}
        />
        <button className="terrain-file-action terrain-file-action--danger" type="button" onClick={() => void reset()}><RotateCcw size={16} /><span><b>Reset terrain</b><small>Restore the original world</small></span></button>
      </aside>

      <div className="terrain-editor__hint terrain-panel">
        <span>{message}</span>
        <small>Shift + left-drag / middle-drag: pan · Right-drag / Alt + left-drag: orbit · Wheel: zoom · Left-drag: sculpt</small>
      </div>
    </main>
  )
}
