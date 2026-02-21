import { Engine } from './engine.js';
import { World } from './world.js';
import { PhysicsDebug } from './physics-debug.js';

const engine = new Engine();
const world = new World(engine);
engine.setWorld(world);
world.init();
engine.start();
engine.run();

const debugLinesToggle = document.getElementById('debugLinesToggle');
const hideTerrainToggle = document.getElementById('hideTerrainToggle');
const disableFollowCamToggle = document.getElementById('disableFollowCamToggle');
const slowToggle = document.getElementById('slowToggle');
const hud = document.getElementById('hud');
const physicsDebug = new PhysicsDebug(engine.scene, world.physicsWorld, { color: 0xff3333 });
const urlParams = new URLSearchParams(window.location.search);

const readFlagFromUrl = (keys, fallback = false) => {
  for (const key of keys) {
    if (!urlParams.has(key)) continue;
    const raw = `${urlParams.get(key) ?? ''}`.trim().toLowerCase();
    if (raw === '' || raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') return true;
    if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false;
  }
  return fallback;
};

engine.addPostUpdate(() => {
  physicsDebug.update();
  if (hud && world.debug) {
    const yaw = Number(world.debug.yawAngularVelocity) || 0;
    hud.textContent = `❄️ Winter Physics — steer with thumbstick, jump on right | yaw ${yaw.toFixed(2)} rad/s`;
  }
  if (physicsDebug.enabled && world.debug?.groundNormal) {
    physicsDebug.setGroundNormal(world.debug.groundNormal.position, world.debug.groundNormal.direction);
  }
  if (physicsDebug.enabled && world.debug?.forwardVelocity) {
    physicsDebug.setForwardVelocity(world.debug.forwardVelocity.position, world.debug.forwardVelocity.direction);
  }
  if (physicsDebug.enabled && world.debug?.sumForce) {
    physicsDebug.setSumForce(world.debug.sumForce.position, world.debug.sumForce.direction, world.debug.sumForce.magnitude);
  }
  if (physicsDebug.enabled && world.debug?.sumTorque) {
    physicsDebug.setSumTorque(world.debug.sumTorque.position, world.debug.sumTorque.direction, world.debug.sumTorque.magnitude);
  }
  if (physicsDebug.enabled && world.debug?.frenchFriesForce) {
    physicsDebug.setFrenchFriesForce(world.debug.frenchFriesForce.position, world.debug.frenchFriesForce.direction);
  }
});

const setDebugLines = (enabled) => {
  physicsDebug.setEnabled(enabled);
  if (debugLinesToggle) debugLinesToggle.checked = !!enabled;
};

const setTerrainHidden = (hidden) => {
  world.setTerrainVisible(!hidden);
  if (hideTerrainToggle) hideTerrainToggle.checked = !!hidden;
};

const setFollowCameraDisabled = (disabled) => {
  world.setCameraFollowEnabled(!disabled);
  if (disableFollowCamToggle) disableFollowCamToggle.checked = !!disabled;
};

setDebugLines(readFlagFromUrl(['debugLines', 'debug', 'physicsDebug'], false));
setTerrainHidden(readFlagFromUrl(['hideTerrain', 'terrainHidden'], false));
setFollowCameraDisabled(readFlagFromUrl(['disableFollowCamera', 'freeCamera', 'followCameraOff'], false));

const setSlow = (enabled) => {
  engine.slowMo1fps = enabled;
  slowToggle?.classList.toggle('active', enabled);
};

setSlow(false);

if (debugLinesToggle) {
  debugLinesToggle.addEventListener('change', () => {
    setDebugLines(debugLinesToggle.checked);
  });
}

if (hideTerrainToggle) {
  hideTerrainToggle.addEventListener('change', () => {
    setTerrainHidden(hideTerrainToggle.checked);
  });
}

if (disableFollowCamToggle) {
  disableFollowCamToggle.addEventListener('change', () => {
    setFollowCameraDisabled(disableFollowCamToggle.checked);
  });
}

if (slowToggle) {
  slowToggle.addEventListener('click', (event) => {
    event.stopPropagation();
    setSlow(!engine.slowMo1fps);
  });
  slowToggle.addEventListener('touchstart', (event) => {
    event.preventDefault();
    event.stopPropagation();
    setSlow(!engine.slowMo1fps);
  }, { passive: false });
}

window.addEventListener('keydown', (event) => {
  if (event.key?.toLowerCase() === 'd') {
    setDebugLines(!physicsDebug.enabled);
  }
  if (event.key?.toLowerCase() === 't') {
    setSlow(!engine.slowMo1fps);
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
const alwaysShowJoystick = typeof window !== 'undefined'
  && window.matchMedia
  && window.matchMedia('(pointer: coarse)').matches;

const setStickVisible = (visible) => {
  if (!joystickBase || !joystickThumb) return;
  const show = alwaysShowJoystick ? true : visible;
  joystickBase.style.display = show ? 'block' : 'none';
  joystickThumb.style.display = show ? 'block' : 'none';
};

const setStickPosition = (x, y, dx = 0, dy = 0) => {
  if (!joystickBase || !joystickThumb) return;
  const rect = joystickZone?.getBoundingClientRect();
  const localX = rect ? x - rect.left : x;
  const localY = rect ? y - rect.top : y;
  joystickBase.style.left = `${localX}px`;
  joystickBase.style.top = `${localY}px`;
  joystickThumb.style.left = `${localX + dx}px`;
  joystickThumb.style.top = `${localY + dy}px`;
};

const setStickIdlePosition = () => {
  if (typeof window === 'undefined') return;
  const x = 80;
  const y = window.innerHeight - 80;
  origin = { x, y };
  setStickPosition(origin.x, origin.y, 0, 0);
};

if (joystickZone) {
  if (alwaysShowJoystick) {
    setStickVisible(true);
    setStickIdlePosition();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', setStickIdlePosition);
    }
  }

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
    if (alwaysShowJoystick) {
      setStickIdlePosition();
    }
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
