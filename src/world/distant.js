// Distant hills and mountains around the playable terrain, so the horizon is
// a landscape instead of the terrain's edge. Fog turns them blue-grey.
import * as THREE from 'three';
import { WORLD } from '../config.js';
import { terrainHeight, fbm, smoothstep } from './terrain-height.js';

export function createDistantLand(scene) {
  const half = WORLD.size / 2;
  const r0 = half - 20;
  const r1 = 2600;
  const rings = 70;
  const segs = 160;
  const pos = [];
  const col = [];
  const idx = [];
  const near = new THREE.Color('#3f6a2c');
  const far = new THREE.Color('#566b5a');
  const c = new THREE.Color();
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const r = r0 + (r1 - r0) * t * t; // denser close by
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      let y;
      if (Math.abs(x) < half && Math.abs(z) < half) {
        y = terrainHeight(x, z) - 1.5; // hidden under the playable terrain
      } else {
        const mountains = smoothstep(700, 2000, r) * (fbm(x / 320, z / 320, 4, WORLD.seed + 5) ** 1.8) * 260;
        y = terrainHeight(x, z) + mountains;
      }
      pos.push(x, y, z);
      c.copy(near).lerp(far, smoothstep(500, 1600, r));
      col.push(c.r, c.g, c.b);
    }
  }
  const row = segs + 1;
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * row + j;
      // Counter-clockwise seen from above, so the faces point up.
      idx.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  mesh.name = 'distant-land';
  scene.add(mesh);
  return mesh;
}
