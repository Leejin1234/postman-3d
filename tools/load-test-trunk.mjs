import fs from 'node:fs';
import * as T from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/loaders/GLTFLoader.js';
import {prepareTreeTrunk} from '../stylized-trees.js';
export async function loadTestTrunk() {
  const loader=new GLTFLoader();
  loader.register(()=>({name:'TEST_TEXTURE_STUB',loadTexture:()=>Promise.resolve(new T.Texture())}));
  const b=fs.readFileSync(new URL('../assets/trees/wooden-trunk-v1.glb',import.meta.url));
  const gltf=await loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
  return prepareTreeTrunk(gltf.scene);
}
