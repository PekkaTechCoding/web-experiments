import { Engine } from './engine.js';
import { World } from './world.js';
import { InputHandler } from './input-handler.js';

const engine = new Engine();
const world = new World(engine);
engine.setWorld(world);
world.init();
engine.start();
engine.run();

new InputHandler({
  element: window,
  onTapped: () => world.addSphere(),
  onSwiped: (direction) => {
    // Placeholder for future controls.
    console.log('Swiped:', direction);
  },
});
