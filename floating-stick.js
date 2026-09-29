// One captured pointer owns movement; other fingers remain free for action buttons.
export function installFloatingStick({ stage, canvas, stick, knob, enabled = () => true, onChange = () => {} }) {
  const vector = { x: 0, y: 0 };
  let pointer = null, originX = 0, originY = 0, radius = 1;
  function reset() {
    const old = pointer; pointer = null;
    vector.x = vector.y = 0; knob.style.transform = '';
    stick.classList.remove('active');
    if (old !== null && stage.hasPointerCapture(old)) stage.releasePointerCapture(old);
    onChange(vector, false);
  }
  stage.addEventListener('pointerdown', event => {
    if (pointer !== null || !enabled() || event.button !== 0) return;
    if (event.target !== canvas && !stick.contains(event.target)) return;
    const bounds = stage.getBoundingClientRect(), x = event.clientX - bounds.left, y = event.clientY - bounds.top;
    if (x > bounds.width * .52 || y < bounds.height * .30) return;
    pointer = event.pointerId; originX = event.clientX; originY = event.clientY;
    radius = stick.offsetWidth * .34;
    stick.style.left = `${x - stick.offsetWidth / 2}px`;
    stick.style.top = `${y - stick.offsetHeight / 2}px`; stick.style.bottom = 'auto';
    stick.classList.add('active'); stage.setPointerCapture(pointer);
    event.preventDefault(); onChange(vector, true);
  });
  stage.addEventListener('pointermove', event => {
    if (event.pointerId !== pointer) return;
    const dx = event.clientX - originX, dy = event.clientY - originY;
    const length = Math.hypot(dx,dy), factor = Math.min(1,radius / (length || 1));
    vector.x = dx * factor / radius; vector.y = dy * factor / radius;
    knob.style.transform = `translate(${dx * factor}px,${dy * factor}px)`;
    event.preventDefault(); onChange(vector, true);
  });
  for (const type of ['pointerup','pointercancel','lostpointercapture']) stage.addEventListener(type,event => {
    if (event.pointerId === pointer) reset();
  });
  window.addEventListener('blur',reset); window.addEventListener('resize',reset);
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
  return { vector, reset };
}
