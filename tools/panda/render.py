import bpy,math
from mathutils import Vector
scene=bpy.context.scene;arm=bpy.data.objects['RedPandaRig'];scene.render.engine='BLENDER_EEVEE_NEXT';scene.render.resolution_x=640;scene.render.resolution_y=640;scene.render.resolution_percentage=100;scene.view_settings.view_transform='Standard';scene.world.color=(.35,.35,.35)
for loc,power in [((3,-4,5),450),((-2,3,3),300)]:
 bpy.ops.object.light_add(type='AREA',location=loc);bpy.context.object.data.energy=power;bpy.context.object.data.size=4
bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=1.45
center=Vector((0,0,.45));cam.location=center+Vector((2,-3,1));cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
for kind,frame in [('idle',1),('sit',1),('walk',8),('run',6),('swim',13)]:
 arm.animation_data.action=bpy.data.actions[kind];scene.frame_set(frame);scene.render.filepath='D:/GPT/output/panda-rig-'+kind+'.png';bpy.ops.render.render(write_still=True)
