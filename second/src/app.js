import { Engine } from './engine.js';
import { World } from './world.js';
import { PhysicsDebug } from './physics-debug.js';

const engine = new Engine();
const world = new World(engine);
engine.setWorld(world);
world.init();
engine.start();
engine.run();

const debugToggle = document.getElementById('debugToggle');
const hud = document.getElementById('hud');
const physicsDebug = new PhysicsDebug(engine.scene, world.physicsWorld, { color: 0xff3333 });

engine.addPostUpdate(() => {
  physicsDebug.update();
  if (hud && world.debug) {
    const fwd = Number(world.debug.forwardSpeed) || 0;
    const lat = Number(world.debug.lateralSpeed) || 0;
    hud.textContent = `❄️ Winter Physics — steer with thumbstick, jump on right | fwd ${fwd.toFixed(2)} | lat ${lat.toFixed(2)}`;
  }
});

const setDebug = (enabled) => {
  physicsDebug.setEnabled(enabled);
  debugToggle?.classList.toggle('active', enabled);
};

setDebug(false);

if (debugToggle) {
  debugToggle.addEventListener('click', (event) => {
    event.stopPropagation();
    setDebug(!physicsDebug.enabled);
  });
  debugToggle.addEventListener('touchstart', (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDebug(!physicsDebug.enabled);
  }, { passive: false });
}

window.addEventListener('keydown', (event) => {
  if (event.key?.toLowerCase() === 'd') {
    setDebug(!physicsDebug.enabled);
  }
});

// Touch controls
const inputState = { steer: 0, jump: false, boost: false };
world.input = inputState;

const joystickZone = document.getElementById('joystickZone');
const joystickBase = document.getElementById('joystickBase');
const joystickThumb = document.getElementById('joystickThumb');
const jumpButton = document.getElementById('jumpButton');
const boostButton = document.getElementById('boostButton');

let joystickActive = false;
let joystickId = null;
let origin = { x: 0, y: 0 };
const radius = 50;

const setStickVisible = (visible) => {
  if (!joystickBase || !joystickThumb) return;
  joystickBase.style.display = visible ? 'block' : 'none';
  joystickThumb.style.display = visible ? 'block' : 'none';
};

const setStickPosition = (x, y, dx = 0, dy = 0) => {
  if (!joystickBase || !joystickThumb) return;
  joystickBase.style.left = `${x}px`;
  joystickBase.style.top = `${y}px`;
  joystickThumb.style.left = `${x + dx}px`;
  joystickThumb.style.top = `${y + dy}px`;
};

if (joystickZone) {
  joystickZone.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    joystickActive = true;
    joystickId = event.pointerId;
    origin = { x: event.clientX, y: event.clientY };
    setStickVisible(true);
    setStickPosition(origin.x, origin.y, 0, 0);
    joystickZone.setPointerCapture(event.pointerId);
  });

  joystickZone.addEventListener('pointermove', (event) => {
    if (!joystickActive || event.pointerId !== joystickId) return;
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    const dist = Math.hypot(dx, dy);
    const scale = dist > radius ? radius / dist : 1;
    const clampedX = dx * scale;
    const clampedY = dy * scale;

    inputState.steer = Math.max(-1, Math.min(1, -clampedX / radius));
    setStickPosition(origin.x, origin.y, clampedX, clampedY);
  });

  const endStick = (event) => {
    if (event && event.pointerId !== joystickId) return;
    joystickActive = false;
    joystickId = null;
    inputState.steer = 0;
    setStickVisible(false);
  };

  joystickZone.addEventListener('pointerup', endStick);
  joystickZone.addEventListener('pointercancel', endStick);
  joystickZone.addEventListener('pointerleave', endStick);
}

if (jumpButton) {
  const setJump = (state) => {
    inputState.jump = state;
    jumpButton.classList.toggle('active', state);
  };

  jumpButton.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    setJump(true);
  });
  jumpButton.addEventListener('pointerup', () => setJump(false));
  jumpButton.addEventListener('pointercancel', () => setJump(false));
  jumpButton.addEventListener('pointerleave', () => setJump(false));
}

if (boostButton) {
  const setBoost = (state) => {
    inputState.boost = state;
    boostButton.classList.toggle('active', state);
  };

  boostButton.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    setBoost(true);
    setTimeout(() => setBoost(false), 0);
  });
}
