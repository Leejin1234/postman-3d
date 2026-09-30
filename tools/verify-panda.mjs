import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../vendor/three.module.js';
import { FBXLoader } from '../vendor/loaders/FBXLoader.js';
T.TextureLoader.prototype.load=function(){return new T.Texture()};
const bytes=fs.readFileSync('assets/characters/red-panda-v1.fbx');
const root=new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
root.updateMatrixWorld(true);
const meshes=[];root.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o)});assert.equal(meshes.length,1);
const mesh=meshes[0],weights=mesh.geometry.attributes.skinWeight;
for(let i=0;i<weights.count;i++){let sum=0;for(let k=0;k<4;k++){const w=weights.getComponent(i,k);assert.ok(Number.isFinite(w)&&w>=0);sum+=w}assert.ok(Math.abs(sum-1)<.0001)}
const clips={};for(const c of root.animations)clips[c.name.split('|').at(-1)]=c;
console.log('FBX',Object.keys(clips),mesh.skeleton.bones.map(b=>b.name));
const mixer=new T.AnimationMixer(root),bounds=[];
for(const name of ['idle','sit','walk','run','swim','jump']){
 const clip=clips[name];assert.ok(clip&&clip.duration>0,name);
 for(const tr of clip.tracks){assert.ok(root.getObjectByName(tr.name.split('.')[0]),tr.name);for(const x of tr.values)assert.ok(Number.isFinite(x))}
 mixer.stopAllAction();const action=mixer.clipAction(clip).play();let last=null,motion=0;
 for(let i=0;i<=12;i++){
  mixer.setTime(clip.duration*i/12);root.updateMatrixWorld(true);mesh.skeleton.update();mesh.computeBoundingBox();const b=mesh.boundingBox;assert.ok(!b.isEmpty());const size=b.getSize(new T.Vector3());assert.ok(size.length()<300,'No exploding skin');
  const points=mesh.skeleton.bones.map(b=>b.getWorldPosition(new T.Vector3()));if(last)motion+=points.reduce((n,p,i)=>n+p.distanceTo(last[i]),0);last=points;
 }
 assert.ok(motion>.01,`${name} must animate`);bounds.push({name,duration:clip.duration,motion:+motion.toFixed(2)});
}
console.log(JSON.stringify({result:'PASS',skinnedMeshes:meshes.length,bones:mesh.skeleton.bones.length,vertices:weights.count,animations:bounds},null,2));
