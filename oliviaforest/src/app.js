import { Engine } from './engine.js';
import { World } from './world.js';
import { InputHandler } from './input-handler.js';
import { PhysicsDebug } from './physics-debug.js';

const engine = new Engine();
const world = new World(engine);
engine.setWorld(world);
world.init();
engine.start();
engine.run();

const debugToggle = document.getElementById('debugToggle');
const physicsDebug = new PhysicsDebug(engine.scene, world.physicsWorld, { color: 0xff3333 });

engine.addPostUpdate(() => {
  physicsDebug.update();
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

new InputHandler({
  element: window,
  onTapped: () => world.spawnRandomEntity(),
  onSwiped: (direction) => {
    // Placeholder for future controls.
    console.log('Swiped:', direction);
  },
});
