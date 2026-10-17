import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'
const compiled=await build({stdin:{contents:`export * from './src/game/cave-lifeguard';export * from './src/game/lifeguard-whistle';export * from './src/game/adventure-caves';export * from './src/game/terrain/level-document'`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false})
const {createLifeguardRules,createGuardReactionGate,whistleGain,normalizeTerrainLevel,caveFloorAt,caveCeilingAt}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'))
const level=normalizeTerrainLevel(JSON.parse(readFileSync(new URL('./fixtures/adventure-valley.json',import.meta.url),'utf8')))
const base=(x=-2,z=-87)=>({x,z,y:caveFloorAt(level,x,z)+1.85,at:0,sprint:false,grounded:true,autoHop:false,swimming:false,riding:false,enabled:true})
function trace(rules,seconds,make,start=0){const result=[];for(let i=0;i<=seconds*20;i++){const t=i/20,at=start+t*1000;const m=make(t,i);m.at=at;const reason=rules.step(m,at);if(reason)result.push(reason)}return result}

test('guard stand is dry, below ceiling and clear of the actual main trough',()=>{
 const r=createLifeguardRules(level),p=r.position
 assert(p.y>r.slide.waterLevel+1)
 assert(caveCeilingAt(level,p.x,p.z)-p.y>5)
 assert(r.project(p).distance>5)
 for(const dx of [-1.3,1.3])for(const dz of [-1.2,1.2])assert.notEqual(caveFloorAt(level,p.x+dx,p.z+dz),null)
 assert.equal(r.slide.start.z,-70);assert(Math.abs(r.slide.end.z+145)<1e-8)
})
test('sustained real sprint warns once, including normal automatic locomotion hops',()=>{
 for(const hops of [false,true]){
  const r=createLifeguardRules(level)
  const result=trace(r,2,(t,i)=>({...base(-2+t*12.24),sprint:true,grounded:!hops||i%8<2,autoHop:hops,y:base().y+(hops?.15:0)}))
  assert.deepEqual(result,['run'])
 }
})
test('walking, held sprint while blocked, manual jumping/falling, swimming, riding and disabled samples never warn',()=>{
 for(const mode of ['walk','still','jump','fall','swim','ride','disabled']){
  const r=createLifeguardRules(level)
  const result=trace(r,1.5,t=>({...base(-15+t*(mode==='still'?0:mode==='walk'?6.8:12.24)),sprint:mode!=='walk',grounded:!['jump','fall'].includes(mode),swimming:mode==='swim',riding:mode==='ride',enabled:mode!=='disabled'}))
  assert.deepEqual(result,[],mode)
 }
})
test('upstream follows the actual S channel; downhill riding, jitter, off-channel and boarding are safe',()=>{
 for(const mode of ['up','down','jitter','off','board']){
  const r=createLifeguardRules(level)
  const result=trace(r,2,(t,i)=>{
   const progress=mode==='board'?.02:mode==='jitter'?.4+(i%2)*.0001:mode==='down'?.3+t*.04:.5-t*.04
   const p=r.slide.curve.getPointAt(progress)
   return {...base(),x:p.x+(mode==='off'?3:0),y:p.y+1.95,z:p.z,sprint:false,riding:mode==='down'}
  })
  assert.deepEqual(result,mode==='up'?['up-slide']:[],mode)
 }
})
test('outdoor, upstairs, other rooms and submerged lake bottom never warn',()=>{
 for(const make of [t=>({...base(-2+t*12.24),y:3}),t=>({...base(-2+t*12.24,-180)}),t=>({...base(-2+t*12.24,-120)}),t=>({...base(-2+t*12.24,12),y:3})]){
  assert.deepEqual(trace(createLifeguardRules(level),1.5,t=>({...make(t),sprint:true})),[])
 }
})
test('teleports, stale samples and pause gaps discard persistence instead of tweeting',()=>{
 const r=createLifeguardRules(level)
 for(let i=0;i<10;i++)assert.equal(r.step({...base(i%2?-14:14),at:i*100,sprint:true},i*100),null)
 r.reset();const p=base();assert.equal(r.step({...p,at:1000,sprint:true},1000),null)
 assert.equal(r.step({...p,x:p.x+2,at:1100,sprint:true},2000),null)
 assert.equal(r.step({...p,x:p.x+4,at:3000,sprint:true},3000),null)
})
test('cooldown and quiet re-arm prevent continuous shrieking but allow a later offense',()=>{
 const r=createLifeguardRules(level)
 assert.deepEqual(trace(r,1,t=>({...base(-2+t*12.24),sprint:true})),['run'])
 assert.deepEqual(trace(r,2,()=>base(),1200),[])
 assert.deepEqual(trace(r,1,t=>({...base(-2+t*12.24),sprint:true}),3500),[])
 trace(r,2,()=>base(),5000)
 assert.deepEqual(trace(r,1,t=>({...base(-2+t*12.24),sprint:true}),9500),['run'])
})
test('relay reaction gate bounds echoes, simultaneous warnings, malformed and stale events',()=>{
 const gate=createGuardReactionGate(),e={event_type:'cave_lifeguard',id:'a',reason:'run',at:Date.now(),position:[0,-20,-78]}
 assert.equal(gate(e,0),e);assert.equal(gate(e,5000),null)
 assert.equal(gate({...e,id:'b'},100),null);assert.equal(gate({...e,id:'c'},4000).id,'c')
 for(const bad of [null,{}, {...e,id:'bad',reason:'swim'},{...e,id:'bad',at:Date.now()-20000},{...e,id:'bad',position:[NaN,0,0]}])assert.equal(gate(bad,9000),null)
})
test('gentle whistle attenuates to silence and respects master, SFX and mute',()=>{
 assert(whistleGain(10,1,1,false)>whistleGain(40,1,1,false))
 assert.equal(whistleGain(72,1,1,false),0)
 assert.equal(whistleGain(0,0,1,false),0);assert.equal(whistleGain(0,1,0,false),0);assert.equal(whistleGain(0,1,1,true),0)
 assert.equal(whistleGain(0,.5,.5,false),.03)
})

test('leaving or resetting re-arms naturally but preserves the last-tweet cooldown',()=>{
 for(const reset of [false,true]){
  const r=createLifeguardRules(level)
  assert.deepEqual(trace(r,1,t=>({...base(-2+t*12.24),sprint:true})),['run'])
  if(reset)r.reset()
  else trace(r,1,()=>({...base(),x:0,y:3,z:12}),1500)
  assert.deepEqual(trace(r,1,t=>({...base(-2+t*12.24),sprint:true}),3000),[])
  if(reset)r.reset()
  else trace(r,1,()=>({...base(),x:0,y:3,z:12}),5000)
  assert.deepEqual(trace(r,1,t=>({...base(-2+t*12.24),sprint:true}),10000),['run'])
 }
})
