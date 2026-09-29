from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

# Seamless fine grass fibres. This is a material mask, not extra blade geometry.
rng = np.random.default_rng(91829)
n = 1024
grain = np.clip(122 + rng.normal(0, 16, (n, n)), 0, 255).astype('uint8')
image = Image.fromarray(grain, 'L')
draw = ImageDraw.Draw(image)
for _ in range(18000):
    x, y = rng.integers(0, n, 2)
    length = int(rng.integers(4, 19))
    dx = int(rng.integers(-5, 6))
    value = int(rng.integers(65, 225))
    for ox in (-n, 0, n):
        for oy in (-n, 0, n):
            draw.line((x+ox, y+oy, x+dx+ox, y-length+oy), fill=value, width=2)
image = image.filter(ImageFilter.GaussianBlur(.35)).resize((512, 512), Image.Resampling.LANCZOS).convert('RGB')
out = Path(__file__).resolve().parent.parent/'assets'/'surfaces'/'grass-nap-v1-512.webp'
image.save(out, quality=88, method=6)
print(out.name, image.size, out.stat().st_size)
