from PIL import Image, ImageFilter
import numpy as np
from pathlib import Path
import json, argparse

parser=argparse.ArgumentParser()
parser.add_argument('--grass-source', type=Path, required=True)
parser.add_argument('--grass-base', default='grass_BaseColor.png')
parser.add_argument('--grass-normal', default='grass_normal.png')
parser.add_argument('--grass-roughness', default='grass_roughness.png')
parser.add_argument('--grass-name', default='grass-v2')
args=parser.parse_args()
out=Path(__file__).resolve().parent.parent/'assets'/'surfaces'
out.mkdir(parents=True,exist_ok=True)
N=512
rng=np.random.default_rng(4927)

def resize(path):
    return Image.open(path).resize((N,N),Image.Resampling.LANCZOS)

def save_base(a,name):
    im=Image.fromarray(np.uint8(np.clip(a,0,255))) if isinstance(a,np.ndarray) else a.convert('RGB')
    im.save(out/(name+'-base-512.webp'),quality=88,method=6)

def save_detail(normal,rough,name):
    normal=normal/np.maximum(np.linalg.norm(normal,axis=2,keepdims=True),1e-5)
    rgba=np.dstack([normal*.5+.5,rough])
    Image.fromarray(np.uint8(np.clip(rgba*255,0,255)),'RGBA').save(out/(name+'-detail-512.webp'),lossless=True,method=6)

def periodic_noise(scale):
    a=rng.normal(size=(N,N))
    freq=np.fft.fftfreq(N)
    kernel=np.exp(-2*np.pi*np.pi*scale*scale*(freq[:,None]**2+freq[None,:]**2))
    a=np.fft.ifft2(np.fft.fft2(a)*kernel).real
    return a/(a.std()+1e-8)

def normal_from_height(height,strength):
    dx=(np.roll(height,-1,axis=1)-np.roll(height,1,axis=1))*.5
    dy=(np.roll(height,-1,axis=0)-np.roll(height,1,axis=0))*.5
    return np.dstack([-dx*strength,dy*strength,np.ones_like(height)])

base=resize(args.grass_source/args.grass_base)
save_base(base,args.grass_name)
normal=np.array(resize(args.grass_source/args.grass_normal).convert('RGB'),dtype=float)/127.5-1
rough_image=Image.open(args.grass_source/args.grass_roughness)
if rough_image.mode in ('RGB','RGBA','LA','P'):
    rough_image=rough_image.convert('L')
rough_source=np.array(rough_image,dtype=np.float32)
rough_source/=65535 if rough_source.max()>255 else 255
rough=np.asarray(Image.fromarray(rough_source,'F').resize((N,N),Image.Resampling.LANCZOS))
save_detail(normal,np.clip(rough,0,1),args.grass_name)
# Seamless aggregate: periodic noise gives the asphalt no visible tile border.
fine=periodic_noise(.65);medium=periodic_noise(2);broad=periodic_noise(16)
asphalt=151+fine*4+medium*2+broad*1.4
save_base(np.dstack([asphalt,asphalt+1,asphalt-.5]),'asphalt')
save_detail(normal_from_height(fine*.5+medium*.3,.28),np.clip(.90+fine*.025,.78,.99),'asphalt')
# Warm staggered concrete pavers. Four by eight slabs per repeat.
y,x=np.mgrid[:N,:N]
row=y//64
col=((x+(row%2)*64)//128)%4
xx=(x+(row%2)*64)%128;yy=y%64
edge=np.minimum.reduce([xx,127-xx,yy,63-yy]).astype(float)
joint=np.clip(edge/2.5,0,1)
bevel=np.clip(edge/5,0,1)
slabs=rng.uniform(-5,5,(8,4))[row,col]
grain=periodic_noise(.6)
value=185+slabs+grain*1.6-(1-joint)*26-(1-bevel)*5
save_base(np.dstack([value+5,value+3,value-1]),'pavers')
save_detail(normal_from_height(bevel*1.4+grain*.05,.65),np.clip(.91+(1-joint)*.07+grain*.008,.8,1),'pavers')
report={"resolution":[512,512],"grassSourceFiles":[args.grass_base,args.grass_normal,args.grass_roughness],"detailChannels":"RGB: normalized tangent normal; A: roughness (linear)","textures":[]}
for f in sorted(out/(kind+'-'+channel+'-512.webp') for kind in [args.grass_name,'asphalt','pavers'] for channel in ['base','detail']):
    im=Image.open(f)
    assert im.size==(512,512)
    report['textures'].append({'file':f.name,'size':list(im.size),'bytes':f.stat().st_size})
report['totalBytes']=sum(f['bytes'] for f in report['textures'])
(out/'texture-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=True,indent=2))
