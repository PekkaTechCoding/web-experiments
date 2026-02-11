import { describe, it, expect } from 'vitest';
import { DeformationTexture } from '../src/deformation-texture.js';

function createStubCanvas() {
  return {
    width: 0,
    height: 0,
    getContext() {
      return {
        fillStyle: null,
        fillRect() {},
        beginPath() {},
        moveTo() {},
        arc() {},
        fill() {},
      };
    },
  };
}

describe('DeformationTexture', () => {
  it('maps world positions to UV space and wraps', () => {
    const deform = new DeformationTexture({ size: 100, resolution: 64, canvas: createStubCanvas() });
    deform.updateOrigin(0, 0);

    const center = deform.worldToUV(0, 0);
    expect(center.u).toBeCloseTo(0.5, 5);
    expect(center.v).toBeCloseTo(0.5, 5);

    const edge = deform.worldToUV(50, 50);
    expect(edge.u).toBeCloseTo(1.0, 5);
    expect(edge.v).toBeCloseTo(1.0, 5);
  });
});
