"""Rebuild the supplied red panda rig and bake looping game animations.
Run with Blender 4.3: blender -b <source.blend> --python tools/panda/build.py
"""
import bpy,math,json,os
from pathlib import Path
from mathutils import Vector,Quaternion,Matrix
REPO=Path(__file__).resolve().parents[2]
OUT=str(REPO/'assets'/'characters')
EDIT=os.environ.get('PANDA_EDIT_PATH',str(REPO.parent/'output'/'red-panda-rigged.blend'))
os.makedirs(os.path.dirname(EDIT),exist_ok=True)
os.makedirs(OUT,exist_ok=True)
mesh=next(o for o in bpy.context.scene.objects if o.type=='MESH')
for o in list(bpy.data.objects):
 if o!=mesh:bpy.data.objects.remove(o,do_unlink=True)
bpy.context.view_layer.objects.active=mesh;mesh.select_set(True)
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
mesh.name='RedPanda';mesh.data.name='RedPandaMesh'
sub=mesh.modifiers.new('JointSupport','SUBSURF');sub.subdivision_type='SIMPLE';sub.levels=1
bpy.ops.object.modifier_apply(modifier=sub.name)
for poly in mesh.data.polygons:poly.use_smooth=True
mat=mesh.data.materials[0]
img=next(n.image for n in mat.node_tree.nodes if n.type=='TEX_IMAGE' and n.image)
img=img.copy();img.scale(1024,1024);img.filepath_raw=OUT+'/red-panda-color-v1.jpg';img.file_format='JPEG';img.save();img.pack()
for n in mat.node_tree.nodes:
 if n.type=='TEX_IMAGE':n.image=img
mat.name='RedPandaCoat'
# World axes: +X is forward, +Z is up, Y spans the arms.
spec=[('Root',(0,0,0),(0,0,.12),None),('Pelvis',(-.018,0,.315),(-.018,0,.405),'Root'),('Spine',(-.018,0,.405),(-.01,0,.54),'Pelvis'),('Neck',(-.01,0,.54),(0,0,.625),'Spine'),('Head',(0,0,.625),(.015,0,.85),'Neck')]
for s,label in [(1,'L'),(-1,'R')]:
 spec.extend([(label+'_Clavicle',(-.01,0,.54),(-.01,s*.14,.554),'Spine'),(label+'_UpperArm',(-.01,s*.14,.554),(-.008,s*.268,.553),label+'_Clavicle'),(label+'_Forearm',(-.008,s*.268,.553),(.003,s*.355,.548),label+'_UpperArm'),(label+'_Hand',(.003,s*.355,.548),(.008,s*.415,.548),label+'_Forearm'),(label+'_Thigh',(-.013,s*.087,.315),(-.005,s*.102,.17),'Pelvis'),(label+'_Shin',(-.005,s*.102,.17),(.008,s*.105,.06),label+'_Thigh'),(label+'_Foot',(.008,s*.105,.06),(.105,s*.105,.035),label+'_Shin')])
spec.extend([('Tail01',(-.075,0,.345),(-.19,0,.33),'Pelvis'),('Tail02',(-.19,0,.33),(-.29,0,.315),'Tail01'),('Tail03',(-.29,0,.315),(-.385,0,.335),'Tail02')])
armdata=bpy.data.armatures.new('RedPandaSkeleton');arm=bpy.data.objects.new('RedPandaRig',armdata);bpy.context.collection.objects.link(arm)
bpy.context.view_layer.objects.active=arm;mesh.select_set(False);arm.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
for name,h,t,parent in spec:
 b=armdata.edit_bones.new(name);b.head=h;b.tail=t
 if parent:b.parent=armdata.edit_bones[parent]
 b.use_deform=name!='Root'
bpy.ops.object.mode_set(mode='OBJECT')
mesh.select_set(True);bpy.context.view_layer.objects.active=arm
mesh.parent=arm
mod=mesh.modifiers.new('PandaSkin','ARMATURE');mod.object=arm
for n,_,_,_ in spec:
 if n!='Root':mesh.vertex_groups.new(name=n)
def weights(v,ws):
 for g in mesh.vertex_groups:g.remove([v.index])
 total=sum(ws.values())
 for name,w in ws.items():
  if w>1e-6:mesh.vertex_groups.get(name).add([v.index],w/total,'REPLACE')
def smooth(a,b,x):
 t=max(0,min(1,(x-a)/(b-a)));return t*t*(3-2*t)
def segdist(p,a,b):
 a,b=Vector(a),Vector(b);d=b-a;t=max(0,min(1,(p-a).dot(d)/d.length_squared));return (p-a-d*t).length
for v in mesh.data.vertices:
 x,y,z=v.co;side='L' if y>0 else 'R'
 if abs(y)>.12 and .43<z<.69 and (abs(y)>.23 or z<.635) and x>-.14:
  t=smooth(.12,.205,abs(y));fore=smooth(.25,.295,abs(y));hand=smooth(.345,.38,abs(y))
  weights(v,{'Spine':1-t,side+'_UpperArm':t*(1-fore),side+'_Forearm':t*fore*(1-hand),side+'_Hand':t*fore*hand})
 elif z>.61:
  t=smooth(.61,.65,z);weights(v,{'Head':t,'Neck':1-t})
 elif x<-.13 and z<.49:
  ds={n:segdist(v.co,h,t) for n,h,t,_ in spec if n.startswith('Tail')};nearest=sorted(ds,key=ds.get)[:2]
  w={n:1/max(.03,ds[n])**3 for n in nearest};total=sum(w.values());blend=smooth(-.13,-.20,x)
  weights(v,{**{n:v/total*blend for n,v in w.items()},'Pelvis':1-blend})
 elif z<.40:
  thigh=1-smooth(.28,.40,z);leg=smooth(.012,.067,abs(y))
  ankle=1-smooth(.065,.125,z);knee=1-smooth(.145,.225,z)
  weights(v,{'Pelvis':1-thigh*leg,side+'_Thigh':thigh*leg*(1-knee),side+'_Shin':thigh*leg*knee*(1-ankle),side+'_Foot':thigh*leg*knee*ankle})
 elif abs(y)>.12 and .44<z<.61:
  t=smooth(.12,.205,abs(y));fore=smooth(.25,.295,abs(y));hand=smooth(.345,.38,abs(y))
  weights(v,{'Spine':1-t,side+'_UpperArm':t*(1-fore),side+'_Forearm':t*fore*(1-hand),side+'_Hand':t*fore*hand})
 else:
  t=smooth(.38,.49,z);neck=smooth(.54,.61,z)
  weights(v,{'Pelvis':1-t,'Spine':t*(1-neck),'Neck':t*neck})
# Limit to four influences for the browser skinning shader.
for v in mesh.data.vertices:
 ws=sorted([(g.group,g.weight) for g in v.groups],key=lambda t:-t[1])[:4];weights(v,{mesh.vertex_groups[i].name:w for i,w in ws})
for pb in arm.pose.bones:pb.rotation_mode='QUATERNION'
scene=bpy.context.scene;scene.render.fps=30

def aim(name,direction,tilt):
 pb=arm.pose.bones[name];rest=pb.bone.matrix_local.to_quaternion();d=tilt@Vector(direction).normalized();rot=(rest@Vector((0,1,0))).rotation_difference(d)@rest
 # Keep the head at its inherited position, changing orientation only.
 pb.matrix=Matrix.Translation(pb.head)@rot.to_matrix().to_4x4();bpy.context.view_layer.update()

def pose(kind,t):
 for pb in arm.pose.bones:pb.location=(0,0,0);pb.rotation_quaternion=(1,0,0,0);pb.scale=(1,1,1)
 phase=2*math.pi*t;wave=math.sin(phase);run=kind=='run';moving=kind in ('walk','run')
 tilt=Quaternion((0,1,0), .10 if run else .08 if kind=='sit' else .88 if kind=='swim' else 0)
 hips=arm.pose.bones['Pelvis'];hips.rotation_quaternion=hips.bone.matrix_local.to_quaternion().inverted()@tilt@hips.bone.matrix_local.to_quaternion()
 hips.location=(0,.012*(1-math.cos(phase*2)) if moving else .004*wave,0)
 if kind=='jump':hips.location.y=.028*math.sin(math.pi*t)
 bpy.context.view_layer.update()
 aim('Spine',(0,0,1),tilt);aim('Neck',(0,0,1),tilt);aim('Head',(.012*wave,.013*math.sin(phase),1),Quaternion((0,1,0),.25 if kind=='swim' else .03))
 for s,label in [(1,'L'),(-1,'R')]:
  swing=math.sin(phase+(0 if s==1 else math.pi))
  if kind=='sit':
   thigh=(.95,s*.19,-.22);shin=(.12,0,-1);foot=(1,0,-.1)
   upper=(.72,s*.19,-.55);fore=(1,s*-.07,.18);hand=(1,0,.05)
  elif kind=='swim':
   thigh=(.10+swing*.20,s*.10,-1);shin=(-.25+swing*.20,0,-1);foot=(.6,0,-.6)
   upper=(.75+.3*swing,s*(.65+.2*math.cos(phase)),.2);fore=(.6,s*-.75,-.10+.2*swing);hand=(.75,s*-.5,0)
  else:
   amp=.75 if run else .48 if moving else .02
   thigh=(amp*swing,0,-1);shin=(-max(0,-swing)*(.95 if run else .45) if moving else 0,0,-1);foot=(1,0,.1*swing if moving else -.18)
   upper=(-amp*swing,s*.16,-1);fore=(.65 if run else .12,0,-1);hand=(.2,0,-1)
   if kind=='jump':
    bend=math.sin(math.pi*t);thigh=(.65*bend,0,-1);shin=(-.8*bend,0,-1);upper=(.3,s*.25,-1);fore=(.8,0,-.5)
  for part,d in [('UpperArm',upper),('Forearm',fore),('Hand',hand),('Thigh',thigh),('Shin',shin),('Foot',foot)]:aim(label+'_'+part,d,tilt)
 for i in range(1,4):
  d=(-1,.12*math.sin(phase-i*.5),.15+.09*wave)
  if kind=='sit':d=(-1+i*.22,.75,.45-i*.08+.025*wave)
  aim('Tail0'+str(i),d,tilt)
 for pb in arm.pose.bones:
  pb.keyframe_insert('rotation_quaternion');pb.keyframe_insert('location')

for kind,duration in [('idle',2.4),('sit',2.4),('walk',1.0),('run',.64),('swim',1.6),('jump',.8)]:
 action=bpy.data.actions.new(kind);arm.animation_data_create();arm.animation_data.action=action
 end=round(duration*30)+1
 for frame in range(1,end+1):scene.frame_set(frame);pose(kind,(frame-1)/(end-1))
 for fc in action.fcurves:
  for kp in fc.keyframe_points:kp.interpolation='LINEAR'
 track=arm.animation_data.nla_tracks.new();track.name=kind;strip=track.strips.new(kind,1,action);track.mute=True
 action.use_fake_user=True
arm.animation_data.action=None
scene.frame_set(1)
for pb in arm.pose.bones:pb.location=(0,0,0);pb.rotation_quaternion=(1,0,0,0)
bpy.context.view_layer.update()
bpy.data.orphans_purge(do_recursive=True)
bpy.ops.wm.save_as_mainfile(filepath=EDIT)
bpy.ops.object.select_all(action='DESELECT');arm.select_set(True);mesh.select_set(True);bpy.context.view_layer.objects.active=arm
bpy.ops.export_scene.fbx(filepath=OUT+'/red-panda-v1.fbx',use_selection=True,object_types={'ARMATURE','MESH'},add_leaf_bones=False,axis_forward='-Z',axis_up='Y',bake_anim=True,bake_anim_use_nla_strips=False,bake_anim_use_all_actions=True,bake_anim_simplify_factor=0,mesh_smooth_type='FACE',path_mode='STRIP')
report={'vertices':len(mesh.data.vertices),'triangles':sum(len(p.vertices)-2 for p in mesh.data.polygons),'bones':len(armdata.bones),'animations':[a.name for a in bpy.data.actions],'unweighted':sum(not bool(v.groups) for v in mesh.data.vertices),'maxInfluences':max(len(v.groups) for v in mesh.data.vertices)}
with open(OUT+'/red-panda-rig.json','w') as f:json.dump(report,f,indent=2)
print('RIG_REPORT',report)
