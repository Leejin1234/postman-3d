import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as T from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/loaders/GLTFLoader.js';

// Exercise the game's actual mount/dismount and playback functions against
// native GLB bone poses, rather than only checking which clip was selected.
const loader = new GLTFLoader();
loader.register(() => ({name:'TEST_TEXTURE_STUB',loadTexture:()=>Promise.resolve(new T.Texture())}));
const bytes = fs.readFileSync('assets/characters/red-panda-v3.glb');
const parse = () => loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const actual = await parse(), reference = await parse();
const riding = T.AnimationClip.parse(JSON.parse(fs.readFileSync('assets/characters/panda-riding-v1.json','utf8')));
const boy = {pivot:new T.Group(),mixer:new T.AnimationMixer(actual.scene),actions:{},cur:'',seat:new T.Vector3()};
boy.pivot.add(actual.scene);
for (const clip of actual.animations) boy.actions[clip.name] = boy.mixer.clipAction(clip.name==='sit'?riding:clip);
const referenceMixer = new T.AnimationMixer(reference.scene);
const state = {onBike:true,speed:0,q:new T.Quaternion()};
const context = vm.createContext({THREE:T,boy,state,foot:{q:new T.Quaternion()},
  walker:new T.Group(),player:new T.Group(),walkerRig:new T.Group(),riderHolder:new T.Group(),
  CFG:{footRadius:1,mountRange:3},S:1,_dmQ:new T.Quaternion(),
  turn:()=>{},advance:()=>{},blockedAt:()=>false,syncBody:()=>{},toast:()=>{},setRideBtn:()=>{}});
const source = fs.readFileSync('game.js','utf8');
vm.runInContext(source.slice(source.indexOf('function playAnim('),source.indexOf('function setRideBtn('))+
  source.slice(source.indexOf('function dismount('),source.indexOf('function toggleRide(')),context);
const tick = seconds => {for(let i=0;i<Math.round(seconds*60);i++)boy.mixer.update(1/60)};
const results = [];
function checkPose(name) {
  const action = boy.actions[name];
  assert.equal(boy.cur,name);
  const active = Object.entries(boy.actions).filter(([,a])=>a.isScheduled()&&a.enabled&&a.getEffectiveWeight()>1e-6).map(([n])=>n);
  assert.deepEqual(active,[name],`${name}: previous actions must finish fading out`);
  referenceMixer.stopAllAction();
  const clip = name==='sit'?riding:reference.animations.find(c=>c.name===name);
  const expectedAction = referenceMixer.clipAction(clip).reset().play();
  expectedAction.time=action.time;
  referenceMixer.update(0);
  let maxError=0,bones=0;
  actual.scene.traverse(bone=>{
    if(!bone.isBone)return;
    const expected = reference.scene.getObjectByName(bone.name);
    const error = Math.max(bone.position.distanceTo(expected.position),bone.scale.distanceTo(expected.scale),
      1-Math.abs(bone.quaternion.dot(expected.quaternion)));
    maxError=Math.max(maxError,error);bones++;
    assert.ok(error<1e-5,`${name}: ${bone.name} differs from source pose by ${error}`);
  });
  results.push({name,bones,maxError});
}
vm.runInContext("playAnim('sit',{fade:0})",context);tick(.3);checkPose('sit');
for(let cycle=0;cycle<3;cycle++){
  vm.runInContext('dismount()',context);tick(.5);checkPose('idle');
  for(const name of ['walk','run','jump','idle','swim','idle']){
    vm.runInContext(`playAnim('${name}',{fade:.16,once:${name==='jump'}})`,context);
    tick(.4);checkPose(name);
  }
  vm.runInContext('mount()',context);tick(.5);checkPose('sit');
}
console.log(JSON.stringify({result:'PASS',poseChecks:results.length,bonesPerPose:results[0].bones,
  maxError:Math.max(...results.map(r=>r.maxError)),mountDismountCycles:3},null,2));
