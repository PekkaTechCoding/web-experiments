import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TrailSystem } from '../src/trail-system.js';

function createStubCanvas() {
  return createTrackedCanvas();
}

function createTrackedCanvas() {
  const calls = {
    fillRect: [],
    clearRect: [],
    drawImage: [],
  };
  const ctx = {
    fillStyle: null,
    fillRect(x, y, w, h) {
      calls.fillRect.push({ x, y, w, h });
    },
    clearRect(x, y, w, h) {
      calls.clearRect.push({ x, y, w, h });
    },
    drawImage(...args) {
      calls.drawImage.push(args);
    },
    createRadialGradient() {
      return { addColorStop() {} };
    },
    beginPath() {},
    arc() {},
    fill() {},
  };

  return {
    width: 0,
    height: 0,
    getContext() {
      return ctx;
    },
    calls,
  };
}

describe('TrailSystem', () => {
  it('maps world positions to UV space', () => {
    const trails = new TrailSystem({ size: 100, resolution: 64, canvas: createStubCanvas() });
    trails.updateOrigin(0, 0);

    const center = trails.worldToUV(0, 0);
    expect(center.u).toBeCloseTo(0.5, 5);
    expect(center.v).toBeCloseTo(0.5, 5);

    const edge = trails.worldToUV(50, 50);
    expect(edge.u).toBeCloseTo(1.0, 5);
    expect(edge.v).toBeCloseTo(1.0, 5);
  });

  it('wraps texture sampling and clears newly exposed edges when shifting', () => {
    const main = createTrackedCanvas();
    const trails = new TrailSystem({ size: 100, resolution: 10, canvas: main });
    trails._tempCanvas = createTrackedCanvas();

    // Prime origin so updateOrigin will shift instead of initializing.
    trails.updateOrigin(0, 0);
    main.calls.fillRect.length = 0;

    trails.updateOrigin(10, 0); // dx > 0 => offsetX negative => clear right edge
    const clears = main.calls.fillRect;
    expect(clears.length).toBeGreaterThan(0);
    expect(clears.some((r) => r.x === 9 && r.y === 0 && r.w === 1 && r.h === 10)).toBe(true);
  });

  it('clears newly exposed top edge when shifting forward in Z', () => {
    const main = createTrackedCanvas();
    const trails = new TrailSystem({ size: 100, resolution: 10, canvas: main });
    trails._tempCanvas = createTrackedCanvas();

    trails.updateOrigin(0, 0);
    main.calls.fillRect.length = 0;

    trails.updateOrigin(0, 10); // dz > 0 => offsetY positive => clear top edge
    const clears = main.calls.fillRect;
    expect(clears.length).toBeGreaterThan(0);
    expect(clears.some((r) => r.x === 0 && r.y === 0 && r.w === 10 && r.h === 1)).toBe(true);
  });

  it('uses repeat wrapping to avoid edge clamping artifacts', () => {
    const trails = new TrailSystem({ canvas: createStubCanvas() });
    expect(trails.texture.wrapS).toBe(THREE.RepeatWrapping);
    expect(trails.texture.wrapT).toBe(THREE.RepeatWrapping);
  });
});
