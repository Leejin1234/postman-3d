import bpy
from mathutils import Vector
scene=bpy.context.scene;arm=bpy.data.objects['RedPandaRig'];arm.animation_data.action=bpy.data.actions['idle'];scene.frame_set(1)
scene.render.engine='BLENDER_EEVEE_NEXT';scene.render.resolution_x=256;scene.render.resolution_y=256;scene.render.resolution_percentage=100;scene.render.film_transparent=True;scene.view_settings.view_transform='Standard';scene.world.color=(.3,.3,.3)
for loc,power in [((3,-3,4),350),((-2,3,2),250)]:
 bpy.ops.object.light_add(type='AREA',location=loc);bpy.context.object.data.energy=power;bpy.context.object.data.size=4
bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=.65;target=Vector((.02,0,.74));cam.location=target+Vector((3,-.8,.25));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.filepath='D:/GPT/postman-3d/assets/ui/panda-avatar-v1.png';bpy.ops.render.render(write_still=True)
