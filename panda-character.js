import {GLTFLoader} from './vendor/loaders/GLTFLoader.js';
export const PANDA_URL='./assets/characters/red-panda-v3.glb';
export const PANDA_ACTIONS=['idle','sit','walk','run','swim','jump'];
export async function loadPanda(buffer){
 const gltf=buffer?await new GLTFLoader().parseAsync(buffer,'./assets/characters/'):await new GLTFLoader().loadAsync(PANDA_URL);
 const root=gltf.scene;root.animations=gltf.animations;
 for(const name of PANDA_ACTIONS)if(!gltf.animations.some(a=>a.name===name))throw new Error('GLB 动作缺失：'+name);
 root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false}});
 return root;
}
