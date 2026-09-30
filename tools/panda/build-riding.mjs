// Build only a replacement sit clip. The source GLB and other five clips stay intact.
import {T,fs,root,pivot,gltf} from './inspect-riding.mjs';
const world=o=>o.getWorldPosition(new T.Vector3());
const orient=(bone,q)=>{const parent=bone.parent.getWorldQuaternion(new T.Quaternion());bone.quaternion.copy(parent.invert().multiply(q));pivot.updateMatrixWorld(true)};
const aim=(bone,child,target)=>{const old=world(child).sub(world(bone)).normalize(),next=target.clone().sub(world(bone)).normalize();orient(bone,new T.Quaternion().setFromUnitVectors(old,next).multiply(bone.getWorldQuaternion(new T.Quaternion())))};
const report=[];
for(const [label,side]of [['L',-1],['R',1]]){
 const clav=root.getObjectByName(label+'_Clavicle'),upper=root.getObjectByName(label+'_Upperarm'),fore=root.getObjectByName(label+'_Forearm'),hand=root.getObjectByName(label+'_Hand');
 orient(clav,new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),side*.5).multiply(clav.getWorldQuaternion(new T.Quaternion())));
 const grip=new T.Vector3(.26,1.09,side*.343),target=grip.clone().add(new T.Vector3(-.09,.023,0));
 const shoulder=world(upper),elbow=world(fore),wrist=world(hand),a=shoulder.distanceTo(elbow),b=elbow.distanceTo(wrist),d=target.clone().sub(shoulder),distance=d.length();d.normalize();
 const reach=Math.min(distance,a+b-.0005),along=(a*a-b*b+reach*reach)/(2*reach),h=Math.sqrt(Math.max(0,a*a-along*along));
 const bend=new T.Vector3(0,-1,side*.3).addScaledVector(d,-new T.Vector3(0,-1,side*.3).dot(d)).normalize();
 const nextElbow=shoulder.clone().addScaledVector(d,along).addScaledVector(bend,h);
 aim(upper,fore,nextElbow);aim(fore,hand,target);
 const mid=root.getObjectByName(label+'_Mid1'),index=root.getObjectByName(label+'_Index1'),pinky=root.getObjectByName(label+'_Pinky1');
 const forward=world(mid).sub(world(hand)).normalize(),across=world(pinky).sub(world(index));across.addScaledVector(forward,-across.dot(forward)).normalize();const normal=new T.Vector3().crossVectors(forward,across);
 const desiredF=new T.Vector3(1,-.18,0).normalize(),desiredA=new T.Vector3(0,0,side),desiredN=new T.Vector3().crossVectors(desiredF,desiredA);
 const from=new T.Matrix4().makeBasis(forward,across,normal),to=new T.Matrix4().makeBasis(desiredF,desiredA,desiredN);const delta=new T.Quaternion().setFromRotationMatrix(to.multiply(from.invert()));
 orient(hand,delta.multiply(hand.getWorldQuaternion(new T.Quaternion())));
 report.push({side:label,grip:grip.toArray(),wrist:world(hand).toArray(),knuckle:world(mid).toArray(),wristError:world(hand).distanceTo(target),reach,distance});
}
const sit=gltf.animations.find(a=>a.name==='sit');const tracks=sit.tracks.map(track=>{const [name,property]=track.name.split('.');const o=root.getObjectByName(name);const value=o[property].toArray();return new track.constructor(track.name,[0,sit.duration],[...value,...value],track.getInterpolation())});
const clip=new T.AnimationClip('sit',sit.duration,tracks);fs.writeFileSync('assets/characters/panda-riding-v1.json',JSON.stringify(T.AnimationClip.toJSON(clip)));fs.writeFileSync('D:/GPT/output/panda-grip-report.json',JSON.stringify(report,null,2));console.log(report);


