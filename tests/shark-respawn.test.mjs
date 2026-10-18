import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { Vector3 } from 'three'
globalThis.window = new EventTarget()
const bundle = await build({ stdin: { contents: `export * from './src/game/adventure-destructibles';export * from './src/game/water-sharks';export * from './src/game/terrain/level-document'`, resolveDir: process.cwd() }, bundle:true, platform:'node', format:'esm', write:false })
const url = 'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
const a = await import(url + '#player-a'), b = await import(url + '#player-b')
const start = Date.now(), id = 'water-shark-0'
function at(time, run) { const original = Date.now; Date.now = () => time; try { return run() } finally { Date.now = original } }
function reset() { window.dispatchEvent(new Event('jackalopesRoundReset')) }
function target(api, name = id) {
  const state = { alive: true, deaths: 0, respawns: 0 }
  const remove = api.registerAdventureDestructible(name, { radius:1.65, position:() => state.alive ? new Vector3() : null,
    destroy:() => { state.alive = false; state.deaths++ }, respawn:() => { state.alive = true; state.respawns++ } })
  return { state, remove }
}
test('a killed shark stays down for a full minute, returns once, and can be shot again', () => at(start, () => {
  reset(); const t=target(a)
  try {
    assert.equal(a.SHARK_RESPAWN_MS, 60000)
    assert(a.destroyAdventureObject(id)); assert.equal(t.state.alive, false)
    a.refreshAdventureDestructions(start + 59999); assert.equal(t.state.alive, false)
    a.refreshAdventureDestructions(start + 60000); assert.equal(t.state.alive, true)
    a.refreshAdventureDestructions(start + 90000); assert.equal(t.state.respawns, 1)
    at(start + 90000, () => { assert(a.destroyAdventureObject(id)); assert.equal(t.state.deaths, 2) })
  } finally { t.remove() }
}))
test('late joins inherit the remaining cooldown and both players revive at the same time', () => at(start, () => {
  reset(); const first=target(a), second=target(b)
  try {
    a.destroyAdventureObject(id); const snapshot=a.getAdventureDestructionState()
    assert.deepEqual(snapshot.ids, []); assert.deepEqual(snapshot.sharkDeaths, [{id,killedAt:start}])
    at(start + 45000, () => b.applyAdventureSharkDeaths(snapshot.sharkDeaths))
    assert.equal(second.state.alive, false)
    for (const api of [a,b]) api.refreshAdventureDestructions(start + 60000)
    assert(first.state.alive); assert(second.state.alive)
    at(start + 65000, () => { a.applyAdventureSharkDeaths(snapshot.sharkDeaths); b.applyAdventureSharkDeaths(snapshot.sharkDeaths) })
    assert(first.state.alive); assert(second.state.alive); assert.equal(second.state.deaths, 1)
  } finally { first.remove(); second.remove() }
}))
test('an expired late replay, refresh or older cached world reply cannot hide the new sharks', () => at(start, () => {
  reset(); const t=target(a)
  try {
    a.applyDestroyedAdventureObjectIds(['water-shark-0','water-shark-1'])
    assert(t.state.alive); assert.deepEqual(a.getDestroyedAdventureObjectIds(), [])
    a.applyAdventureSharkDeaths([{id,killedAt:start - 60000}]); assert(t.state.alive)
    a.applyAdventureSharkDeaths([{id,killedAt:start - 61000}]); assert(t.state.alive)
    assert.equal(t.state.deaths, 0)
  } finally { t.remove() }
}))
test('latest death wins; stale packets cannot undo or extend a subsequent kill', () => at(start, () => {
  reset(); const t=target(a)
  try {
    a.destroyAdventureObject(id)
    at(start + 61000, () => { a.refreshAdventureDestructions(); assert(a.destroyAdventureObject(id)) })
    a.applyAdventureSharkDeaths([{id,killedAt:start}],start+70000)
    a.refreshAdventureDestructions(start+120999); assert.equal(t.state.alive, false)
    a.refreshAdventureDestructions(start+121000); assert.equal(t.state.alive, true)
  } finally { t.remove() }
}))
test('background overnight time is respected without waiting for rendered frames', () => at(start, () => {
  reset(); let t=target(a); a.destroyAdventureObject(id); t.remove()
  at(start+8*3600000, () => {
    t=target(a); assert(t.state.alive); assert.equal(t.state.deaths,0)
    assert.deepEqual(a.getAdventureDestructionState().sharkDeaths,[{id,killedAt:start}])
  }); t.remove()
}))
test('only sharks respawn: the eliminated lifeguard and collectibles remain down until round reset', () => at(start, () => {
  reset(); const shark=target(a), guard=target(a,'cave-lifeguard'), egg=target(a,'golden-egg-1')
  try {
    for (const name of [id,'cave-lifeguard','golden-egg-1']) assert(a.destroyAdventureObject(name))
    a.refreshAdventureDestructions(start+3600000)
    assert(shark.state.alive); assert.equal(guard.state.alive,false); assert.equal(egg.state.alive,false)
    assert.deepEqual(a.getAdventureDestructionState().ids,['cave-lifeguard','golden-egg-1'])
    reset(); assert.deepEqual(a.getAdventureDestructionState(),{ids:[],sharkDeaths:[]})
  } finally { shark.remove();guard.remove();egg.remove() }
}))
test('invalid or far-future timestamps cannot hide sharks or extend their cooldown indefinitely', () => at(start, () => {
  reset(); const t=target(a)
  try {
    a.applyAdventureSharkDeaths([{id,killedAt:Infinity},{id,killedAt:NaN},{id,killedAt:0},{id,killedAt:start+6000},{id:'water-shark-99',killedAt:start}])
    assert(t.state.alive); assert.deepEqual(a.getAdventureDestructionState(),{ids:[],sharkDeaths:[]})
  } finally { t.remove() }
}))
test('clients with the old permanent-death simulator cannot own the refreshed pool', () => {
  const peer=a.createSharkPeer(a.createTerrainLevel(),'new',()=>{})
  peer.receive({event_type:'water_sharks_v2_peer',actor:'aaa-old',sequence:1,swimmer:{x:0,y:-26,z:-110,enabled:true,swimming:true,riding:false,immune:false}},0)
  peer.step({x:0,y:0,z:0,enabled:false,swimming:false,riding:false,immune:false},1,.05,true)
  assert.equal(peer.leader,'new')
})
