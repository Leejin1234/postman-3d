import assert from 'node:assert/strict';
import {installFloatingStick} from '../floating-stick.js';

// Exercise pointer ownership/cancellation without a GPU or game assets.
class Target extends EventTarget {
  style={}; offsetWidth=128; offsetHeight=128; classes=new Set(); capture=null;
  classList={add:x=>this.classes.add(x),remove:x=>this.classes.delete(x)};
  contains(target){return target===this;}
  getBoundingClientRect(){return {left:0,top:0,width:390,height:844};}
  setPointerCapture(id){this.capture=id;}
  hasPointerCapture(id){return this.capture===id;}
  releasePointerCapture(){this.capture=null;}
}
globalThis.window=new Target();globalThis.document=new Target();
const stage=new Target(),canvas=new Target(),stick=new Target(),knob=new Target();let enabled=true;
const joystick=installFloatingStick({stage,canvas,stick,knob,enabled:()=>enabled});
function send(type,id,x,y,target=canvas){const event=new Event(type,{cancelable:true});Object.defineProperties(event,{pointerId:{value:id},clientX:{value:x},clientY:{value:y},button:{value:0},target:{value:target}});stage.dispatchEvent(event);}
send('pointerdown',1,90,600);assert.equal(stick.style.left,'26px');
send('pointermove',1,135,555);assert.ok(joystick.vector.x>.6&&joystick.vector.y<-.6);
send('pointerdown',2,330,650);send('pointerup',2,330,650);assert.ok(joystick.vector.x>.6,'Second finger release cannot stop movement');
send('pointerup',1,135,555);assert.deepEqual(joystick.vector,{x:0,y:0});assert.equal(stick.classes.has('active'),false);
send('pointerdown',3,155,430);assert.equal(stick.style.left,'91px','Next touch moves joystick origin');
send('pointermove',3,155,0);assert.equal(joystick.vector.y,-1);
send('pointercancel',3,155,0);assert.equal(joystick.vector.y,0);
send('pointerdown',4,100,600,new Target());assert.equal(stage.capture,null,'UI buttons cannot start joystick');
send('pointerdown',5,300,600);assert.equal(stage.capture,null,'Right side reserved for other controls');
send('pointerdown',6,100,600);send('pointermove',6,140,600);window.dispatchEvent(new Event('blur'));assert.equal(joystick.vector.x,0);
enabled=false;send('pointerdown',7,100,600);assert.equal(stage.capture,null);
console.log('PASS: floating origins, clamping, multitouch ownership, cancellation, focus loss and UI exclusion');
