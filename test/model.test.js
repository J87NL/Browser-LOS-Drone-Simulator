import { describe, it, expect, beforeAll } from 'vitest';
import { Box3, Sprite } from 'three';
import { PRESETS } from '../src/config.js';

// The model draws a glow texture on a canvas; stub just enough of the DOM.
beforeAll(() => {
  const ctx = { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} };
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
});

describe('drone model placement', () => {
  it('FEET_DEPTH matches the lowest point of the model', async () => {
    const { createDroneModel, FEET_DEPTH } = await import('../src/drone/model.js');
    const { root } = createDroneModel();
    root.traverse((o) => { if (o instanceof Sprite) o.visible = false; });
    const box = new Box3();
    root.updateMatrixWorld(true);
    root.traverse((o) => { if (o.isMesh) box.expandByObject(o); });
    expect(box.min.y).toBeCloseTo(-FEET_DEPTH, 4);
  });

  it('feet rest on the collision sphere bottom for every preset and size', async () => {
    const { modelLift, FEET_DEPTH } = await import('../src/drone/model.js');
    for (const p of Object.values(PRESETS)) {
      for (const size of [1, 1.5, 3]) {
        const feet = modelLift(p, size) - FEET_DEPTH * p.modelScale * size;
        expect(feet).toBeCloseTo(-p.radius, 9);
      }
    }
  });
});
