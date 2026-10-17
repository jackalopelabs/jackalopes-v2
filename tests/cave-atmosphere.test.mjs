import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import * as THREE from 'three'
const compiled = await build({stdin:{contents:`export * from './src/game/cave-atmosphere';export * from './src/game/hot-tub-party-steam';export * from './src/game/terrain/level-document';export {caveFloorAt,caveCeilingAt,caveLayout} from './src/game/adventure-caves';export {CAVE_HOT_TUB_POSITION,HOT_TUB_WATER_HEIGHT} from './src/game/cave-hot-tub';`,resolveDir:process.cwd()},bundle:true,format:'esm',platform:'node',write:false})
const {createCaveFogOwner,createCaveFogLayer,caveAirWeight,partyLightScale,PARTY_AIR_DENSITY,createHotTubSteamPaths,sampleHotTubSteamPath,
  createHotTubSteamResources,steamPointInside,steamAirFloor,createTerrainLevel,caveFloorAt,caveCeilingAt,caveLayout,
  STEAM_BUDGET,STEAM_PATH_NODES,CAVE_HOT_TUB_POSITION,HOT_TUB_WATER_HEIGHT}=await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)

test('one fog owner composes party and sealed sauna; release order cannot restore stale party fog',()=>{
  const ordinary=new THREE.Fog('#123456',70,340), scene={fog:ordinary}, owner=createCaveFogOwner(scene)
  const party=createCaveFogLayer(10),sauna=createCaveFogLayer(100),partyFog=new THREE.FogExp2('#696482',.028),saunaFog=new THREE.FogExp2('#c7c9b5',.7)
  const releaseParty=owner.register(party),releaseSauna=owner.register(sauna)
  party.fog=partyFog;owner.update();assert.equal(scene.fog,partyFog)
  sauna.fog=saunaFog;owner.update();assert.equal(scene.fog,saunaFog)
  party.fog=null;owner.update();assert.equal(scene.fog,saunaFog)
  sauna.fog=null;owner.update();assert.equal(scene.fog,ordinary)
  for(let i=0;i<8;i++){
    party.fog=partyFog;sauna.fog=saunaFog;owner.update()
    sauna.fog=null;owner.update();assert.equal(scene.fog,partyFog)
    party.fog=null;owner.update();assert.equal(scene.fog,ordinary)
  }
  party.fog=partyFog;sauna.fog=saunaFog;owner.update();releaseParty();assert.equal(scene.fog,saunaFog)
  releaseSauna();assert.equal(scene.fog,ordinary)
  owner.dispose();assert.equal(scene.fog,ordinary)
})
test('App/night-vision fog changes during party survive OFF, sauna exit and provider unmount',()=>{
  const initial=new THREE.Fog('#123456',70,340),scene={fog:initial},owner=createCaveFogOwner(scene)
  const party=createCaveFogLayer(10),sauna=createCaveFogLayer(100)
  owner.register(party);owner.register(sauna)
  party.fog=new THREE.FogExp2('#696482',.028);owner.update()
  const nightVision=new THREE.Fog('#173624',10,70)
  scene.fog=nightVision;owner.update()
  sauna.fog=new THREE.FogExp2('#c7c9b5',.7);owner.update()
  party.fog=null;sauna.fog=null;owner.update();assert.equal(scene.fog,nightVision)
  party.fog=new THREE.FogExp2('#696482',.028);owner.update();owner.dispose();assert.equal(scene.fog,nightVision)
  const owner2=createCaveFogOwner(scene),layer=createCaveFogLayer(10);owner2.register(layer);layer.fog=new THREE.FogExp2('#fff',.1);owner2.update()
  scene.fog=null;owner2.dispose();assert.equal(scene.fog,null,'unmount must not resurrect a disabled App fog')
})
const level=createTerrainLevel(),floor=caveFloorAt(level,0,-187)
test('modest explicit light dimming is scoped to cave air, disabled for night vision and exactly restores base',()=>{
  const inside={x:0,y:floor+3,z:-181},air=caveAirWeight(level,inside)
  assert.equal(air,1);assert.equal(partyLightScale(1,air,false),.6);assert.equal(partyLightScale(1,air,false,true),.76)
  for(const point of [{x:0,y:5,z:10},{x:0,y:0,z:-187},{x:70,y:floor+3,z:-187},{x:0,y:caveLayout(level).waterLevel-1,z:-120}]){
    assert.equal(caveAirWeight(level,point),0)
    assert.equal(partyLightScale(1,caveAirWeight(level,point),false),1)
  }
  assert.equal(partyLightScale(0,air,false),1);assert.equal(partyLightScale(1,air,true),1)
  assert(PARTY_AIR_DENSITY.full<.04&&PARTY_AIR_DENSITY.low<PARTY_AIR_DENSITY.full)
})
test('every stream begins at actual hot-tub water, rises there, then spreads along connected cave air',()=>{
  const paths=createHotTubSteamPaths(level),point=new THREE.Vector3()
  assert.equal(paths.length,8)
  let reachesCorridor=false,reachesBedrooms=false
  for(const path of paths){
    sampleHotTubSteamPath(path,0,point)
    assert.equal(point.x,CAVE_HOT_TUB_POSITION.x);assert.equal(point.z,CAVE_HOT_TUB_POSITION.z)
    assert(Math.abs(point.y-(floor+HOT_TUB_WATER_HEIGHT+.08))<1e-6)
    const start=point.clone();sampleHotTubSteamPath(path,.16,point)
    assert.equal(point.x,start.x);assert.equal(point.z,start.z);assert(point.y>start.y)
    for(let i=0;i<=400;i++){
      sampleHotTubSteamPath(path,i/400,point)
      assert(steamPointInside(level,point),`stream must remain in cave air: ${point.toArray()}`)
    }
    sampleHotTubSteamPath(path,1,point)
    reachesCorridor ||= point.z>-40;reachesBedrooms ||= Math.abs(point.x)>15&&point.z<-175
  }
  assert(reachesCorridor&&reachesBedrooms)
})
test('bounded GPU wisps cover all eight source paths at low quality and contain finite atlas/billboard data',()=>{
  const resources=createHotTubSteamResources(level),attrs=resources.geometry.attributes
  assert.equal(attrs.position.count,STEAM_BUDGET.full*6)
  assert.equal(resources.trajectory.image.width,STEAM_PATH_NODES)
  assert.equal(resources.trajectory.image.height,8)
  for(const quality of ['low','full']){
    const routes=new Set(),seeds=[]
    for(let i=0;i<STEAM_BUDGET[quality];i++){routes.add(attrs.stream.getX(i*6));seeds.push(attrs.seed.getX(i*6))}
    assert.equal(routes.size,8);assert(Math.min(...seeds)<.1&&Math.max(...seeds)>.85,'low prefix must not lose downstream wisps')
  }
  const data=resources.trajectory.image.data
  for(let route=0;route<8;route++)for(let i=0;i<STEAM_PATH_NODES-1;i++)for(let k=0;k<=8;k++){
    const a=(route*STEAM_PATH_NODES+i)*4,b=a+4,t=k/8
    const point={x:data[a]+(data[b]-data[a])*t,y:data[a+1]+(data[b+1]-data[a+1])*t,z:data[a+2]+(data[b+2]-data[a+2])*t}
    assert(steamPointInside(level,point),'GPU interpolated segment cannot cross rock or the sauna')
  }
  const air=resources.air.image.data
  for(const [x,z] of [[0,-12],[0,-22],[0,-30],[0,-85],[0,-120],[-17,-187]]){
    const col=Math.floor(x+56),row=Math.floor(z+200),offset=(row*112+col)*4
    if(air[offset+2]<.5)continue
    for(const dx of [0,1])for(const dz of [0,1]){
      const px=-56+col+dx,pz=-200+row+dz
      assert(air[offset]>=steamAirFloor(level,px,pz)-1e-4)
      assert(air[offset+1]<=caveCeilingAt(level,px,pz)+1e-4,'air field must conservatively clip a sloped roof')
    }
  }
  assert(Array.from(data).every(Number.isFinite));assert(Array.from(air).every(Number.isFinite))
  resources.geometry.dispose();resources.trajectory.dispose();resources.air.dispose()
})


test('effect leases survive StrictMode cleanup/setup replay in either parent/child order',()=>{
  for(const childFirst of [false,true]){
    const base=new THREE.Fog('#123456',70,340),scene={fog:base},owner=createCaveFogOwner(scene)
    const party=createCaveFogLayer(10),sauna=createCaveFogLayer(100)
    party.fog=new THREE.FogExp2('#696482',.028);sauna.fog=new THREE.FogExp2('#c7c9b5',.7)
    // Allocation alone must not make render-discarded layers active.
    owner.update();assert.equal(scene.fog,base)
    let releaseParty=owner.register(party),releaseSauna=owner.register(sauna)
    owner.update();assert.equal(scene.fog,sauna.fog)
    for(let replay=0;replay<3;replay++){
      if(childFirst){releaseSauna();releaseParty()}else{releaseParty();releaseSauna()}
      assert.equal(scene.fog,base)
      if(childFirst){releaseSauna=owner.register(sauna);releaseParty=owner.register(party)}
      else{releaseParty=owner.register(party);releaseSauna=owner.register(sauna)}
      owner.update();assert.equal(scene.fog,sauna.fog)
      // Provider/party replay alone must not destroy a live child lease.
      releaseParty();releaseParty=owner.register(party);owner.update();assert.equal(scene.fog,sauna.fog)
    }
    releaseSauna();assert.equal(scene.fog,party.fog)
    releaseParty();assert.equal(scene.fog,base)
    const remounted=owner.register(party);owner.update();assert.equal(scene.fog,party.fog)
    remounted();assert.equal(scene.fog,base)
  }
})
test('stale or repeated cleanup cannot delete a renewed lease or overwrite a new base fog',()=>{
  const scene={fog:new THREE.Fog('#123456',70,340)},owner=createCaveFogOwner(scene),layer=createCaveFogLayer(10)
  layer.fog=new THREE.FogExp2('#696482',.028)
  const stale=owner.register(layer),current=owner.register(layer)
  owner.update();stale();stale();assert.equal(scene.fog,layer.fog)
  const updatedBase=new THREE.Fog('#173624',10,70);scene.fog=updatedBase;owner.update()
  current();assert.equal(scene.fog,updatedBase);stale();current();assert.equal(scene.fog,updatedBase)
})
