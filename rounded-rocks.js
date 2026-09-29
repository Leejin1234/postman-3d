import * as T from 'three';

function closedHull(points) {
  const a=0,b=points.reduce((best,p,i)=>p.distanceToSquared(points[a])>points[best].distanceToSquared(points[a])?i:best,1);
  const axis=points[b].clone().sub(points[a]),cross=new T.Vector3();
  let c=-1,best=-1;
  for(let i=0;i<points.length;i++){const area=cross.subVectors(points[i],points[a]).cross(axis).lengthSq();if(area>best){best=area;c=i;}}
  const normal=new T.Vector3().subVectors(points[b],points[a]).cross(new T.Vector3().subVectors(points[c],points[a])).normalize();
  let d=-1;best=-1;
  for(let i=0;i<points.length;i++){const distance=Math.abs(normal.dot(new T.Vector3().subVectors(points[i],points[a])));if(distance>best){best=distance;d=i;}}
  const inside=points[a].clone().add(points[b]).add(points[c]).add(points[d]).multiplyScalar(.25);
  const orient=t=>{const n=new T.Vector3().subVectors(points[t[1]],points[t[0]]).cross(new T.Vector3().subVectors(points[t[2]],points[t[0]]));return n.dot(inside.clone().sub(points[t[0]]))>0?[t[0],t[2],t[1]]:t;};
  let faces=[[a,b,c],[a,d,b],[a,c,d],[b,d,c]].map(orient);
  const eps=new T.Box3().setFromPoints(points).getSize(new T.Vector3()).length()*1e-8;
  for(let i=0;i<points.length;i++){
    if([a,b,c,d].includes(i))continue;
    const visible=new Set(),edges=new Map();
    faces.forEach((t,j)=>{
      const n=new T.Vector3().subVectors(points[t[1]],points[t[0]]).cross(new T.Vector3().subVectors(points[t[2]],points[t[0]])).normalize();
      if(n.dot(points[i].clone().sub(points[t[0]]))<=eps)return;
      visible.add(j);for(let k=0;k<3;k++){const u=t[k],v=t[(k+1)%3],key=[u,v].sort((a,b)=>a-b).join(':');if(edges.has(key))edges.delete(key);else edges.set(key,[u,v]);}
    });
    if(!visible.size)continue;
    faces=faces.filter((_,j)=>!visible.has(j));
    for(const [u,v]of edges.values())faces.push(orient([u,v,i]));
  }
  return faces;
}

// Weld before subdividing: smoothing separate FBX face vertices would open cracks.
export function roundRockGeometry(source) {
  const positions=[], welded=new Map(), pos=source.attributes.position;
  for(let i=0;i<pos.count;i++){
    const p=new T.Vector3().fromBufferAttribute(pos,i),key=p.toArray().map(v=>Math.round(v*1e8)).join(',');
    if(!welded.has(key)){welded.set(key,positions.length);positions.push(p);}
  }
  const oldBox=new T.Box3().setFromPoints(positions),oldHeight=oldBox.max.z-oldBox.min.z;
  // Some imported stones contain overlapping shells. Rebuild a closed outer hull
  // before subdivision so these old seams cannot turn into holes.
  let faces=closedHull(positions);
  const used=[...new Set(faces.flat())],compact=new Map(used.map((id,i)=>[id,i]));
  const hullPoints=used.map(i=>positions[i]);positions.splice(0,positions.length,...hullPoints);
  faces=faces.map(t=>t.map(i=>compact.get(i)));
  const passes=faces.length<128?2:1;
  for(let pass=0;pass<passes;pass++){
    const edges=new Map(),next=[];
    const midpoint=(a,b)=>{
      const key=a<b?`${a}:${b}`:`${b}:${a}`;
      if(!edges.has(key)){edges.set(key,positions.length);positions.push(positions[a].clone().add(positions[b]).multiplyScalar(.5));}
      return edges.get(key);
    };
    for(const [a,b,c]of faces){const ab=midpoint(a,b),bc=midpoint(b,c),ca=midpoint(c,a);next.push([a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]);}
    faces=next;
    const neighbors=positions.map(()=>new Set());
    for(const t of faces)for(let k=0;k<3;k++){neighbors[t[k]].add(t[(k+1)%3]);neighbors[t[k]].add(t[(k+2)%3]);}
    for(let iteration=0;iteration<3;iteration++){
      const nextPositions=positions.map((p,i)=>{
        if(!neighbors[i].size)return p.clone();
        const average=new T.Vector3();for(const j of neighbors[i])average.add(positions[j]);
        return p.clone().lerp(average.divideScalar(neighbors[i].size),.44);
      });
      positions.splice(0,positions.length,...nextPositions);
    }
  }
  // Restore the local base and height. Horizontal smoothing stays inside the old hull.
  const box=new T.Box3().setFromPoints(positions),height=box.max.z-box.min.z;
  for(const p of positions)p.z=oldBox.min.z+(p.z-box.min.z)*oldHeight/(height||1);
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions.flatMap(p=>p.toArray()),3));
  geometry.setIndex(faces.flat());geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return geometry;
}

export function roundSceneRocks(city){
  const cache=new Map(),material=new T.MeshLambertMaterial({color:'#92998a'});
  material.name='RoundedStone';let rocks=0,triangles=0;
  city.traverse(o=>{
    if(!o.isMesh||!/^Rock_/.test(o.name))return;
    if(!cache.has(o.geometry))cache.set(o.geometry,roundRockGeometry(o.geometry));
    o.geometry=cache.get(o.geometry);o.material=material;o.userData.roundedRock=true;
    rocks++;triangles+=o.geometry.index.count/3;
  });
  return {rocks,sharedGeometries:cache.size,triangles};
}
