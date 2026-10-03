import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
const compiled = await build({entryPoints:['src/common/touch-input.ts'],bundle:true,format:'esm',platform:'node',write:false})
const input = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)
const {setTouchEnabled,setTouchStick,setTouchButton,resetTouchInput,mergeTouchGamepad}=input
const physical={axes:[.4,-.8,.5,.2],buttons:Array.from({length:17},()=>({pressed:false,touched:false,value:0}))}

test('touch works without Gamepad API, uses forward-negative coordinates and simultaneous move/look/held actions',()=>{
 setTouchEnabled(true);setTouchStick('move',0,-1);setTouchStick('look',.8,.6);setTouchButton('jump',true);setTouchButton('swimDown',true)
 let pad=mergeTouchGamepad(null);assert.deepEqual(pad.axes,[0,-1,.8,.6]);assert(pad.buttons[0].pressed);assert.equal(pad.buttons[6].value,1)
 setTouchButton('jump',false);assert.equal(mergeTouchGamepad(null).buttons[0].pressed,false);assert(mergeTouchGamepad(null).buttons[6].pressed)
 resetTouchInput();pad=mergeTouchGamepad(null);assert.deepEqual(pad.axes,[0,0,0,0]);assert(pad.buttons.every(b=>!b.pressed&&b.value===0))
})
test('idle visible controls preserve Ally physical sticks and triggers; active touch only replaces its own stick',()=>{
 setTouchEnabled(true);physical.buttons[7]={pressed:true,touched:true,value:.7}
 assert.deepEqual(mergeTouchGamepad(physical).axes,physical.axes);assert.equal(mergeTouchGamepad(physical).buttons[7].value,.7)
 setTouchStick('move',-1,0);assert.deepEqual(mergeTouchGamepad(physical).axes,[-1,0,.5,.2]);setTouchStick('move',0,0);assert.deepEqual(mergeTouchGamepad(physical).axes,physical.axes)
 setTouchEnabled(false);assert.equal(mergeTouchGamepad(physical),physical);assert.equal(mergeTouchGamepad(null),null)
})
test('disable/re-enable cancels held input and ignores hidden UI; malformed/oversized vectors cannot corrupt movement',()=>{
 setTouchEnabled(true);setTouchStick('move',4,3);assert(Math.abs(Math.hypot(...mergeTouchGamepad(null).axes.slice(0,2))-1)<1e-8)
 setTouchStick('look',NaN,Infinity);assert.deepEqual(mergeTouchGamepad(null).axes.slice(2),[0,0]);setTouchButton('sprint',true)
 setTouchEnabled(false);setTouchStick('move',0,-1);setTouchButton('jump',true);setTouchEnabled(true)
 assert.deepEqual(mergeTouchGamepad(null).axes,[0,0,0,0]);assert(mergeTouchGamepad(null).buttons.every(b=>!b.pressed))
 setTouchEnabled(false)
})
