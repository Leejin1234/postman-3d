import assert from 'node:assert/strict';
import {T,fs,root,pivot,gltf,mix} from './panda/inspect-riding.mjs';
const original=gltf.animations,other=original.filter(c=>c.name!=='sit').map(c=>JSON.stringify(T.AnimationClip.toJSON(c)));
const sit=T.AnimationClip.parse(JSON.parse(fs.readFileSync('assets/characters/panda-riding-v1.json','utf8')));
const replaced=original.map(c=>c.name==='sit'?sit:c);
assert.deepEqual(replaced.filter(c=>c.name!=='sit').map(c=>JSON.stringify(T.AnimationClip.toJSON(c))),other);
mix.stopAllAction();mix.clipAction(sit).play();
let first;const samples=[];
for(const time of [0,.2,1,3,5,sit.duration-.01,sit.duration+1]){
 mix.setTime(time);pivot.updateMatrixWorld(true);
 const pose=[];root.traverse(o=>{if(o.isBone)pose.push(...o.matrixWorld.elements)});
 if(first)for(let i=0;i<pose.length;i++)assert.ok(Math.abs(pose[i]-first[i])<1e-6,'Riding skeleton must remain still');else first=pose;
 for(const [side,z]of [['L',-.343],['R',.343]]){
  const wrist=root.getObjectByName(side+'_Hand').getWorldPosition(new T.Vector3());
  assert.ok(wrist.distanceTo(new T.Vector3(.17,1.113,z))<.005,'Wrist stays at handlebar');
  const knuckle=root.getObjectByName(side+'_Mid1').getWorldPosition(new T.Vector3());
  assert.ok(knuckle.distanceTo(new T.Vector3(.26,1.09,z))<.025,'Grip touches handlebar');
 }
 samples.push(time);
}
mix.stopAllAction();mix.clipAction(original.find(c=>c.name==='walk')).play();mix.setTime(.4);const a=root.getObjectByName('L_Hand').getWorldPosition(new T.Vector3());mix.setTime(.9);root.updateMatrixWorld(true);assert.ok(a.distanceTo(root.getObjectByName('L_Hand').getWorldPosition(new T.Vector3()))>.01,'Walking restores arm motion');
console.log(JSON.stringify({result:'PASS',staticSamples:samples.length,unchangedOtherClips:5,handGripChecks:samples.length*2},null,2));
