// Ground mesh: heightfield with vertex-coloured grass, a canvas grass texture
// and mown stripes around the flying field (added in the shader).
import * as THREE from 'three';
import { WORLD } from '../config.js';
import { terrainHeight, fbm, smoothstep } from './terrain-height.js';
import { mulberry32 } from './rng.js';

function grassTexture(renderer) {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(222,222,222)';
  g.fillRect(0, 0, size, size);
  const rand = mulberry32(7);
  // Soft blotches.
  for (let i = 0; i < 260; i++) {
    const v = 190 + rand() * 65;
    g.fillStyle = `rgba(${v},${v},${v},0.35)`;
    const r = 4 + rand() * 18;
    const x = rand() * size;
    const y = rand() * size;
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
      g.beginPath();
      g.arc(x + dx, y + dy, r, 0, Math.PI * 2);
      g.fill();
    }
  }
  // Short blade strokes.
  g.lineWidth = 1;
  for (let i = 0; i < 5000; i++) {
    const v = 150 + rand() * 105;
    g.strokeStyle = `rgba(${v},${v},${v},0.55)`;
    const x = rand() * size;
    const y = rand() * size;
    const a = -Math.PI / 2 + (rand() - 0.5) * 0.9;
    const l = 2 + rand() * 4;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return tex;
}

export function createTerrain(renderer) {
  const { size, segments } = WORLD;
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const lush = new THREE.Color('#4c8530');
  const dry = new THREE.Color('#86a043');
  const dark = new THREE.Color('#356326');
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);
    const patch = fbm(x / 25, z / 25, 3);
    tmp.copy(lush).lerp(dry, smoothstep(0.45, 0.75, patch) * 0.6);
    tmp.lerp(dark, smoothstep(4, 30, h) * 0.6);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const map = grassTexture(renderer);
  const tilesPerMetre = 1 / 5;
  // Scale UVs so the texture repeats every 5 m.
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * size * tilesPerMetre, uv.getY(i) * size * tilesPerMetre);

  const mat = new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.96, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFlat = { value: WORLD.flatRadius + 15 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos;
        uniform float uFlat;
        float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float gNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), u.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), u.x), u.y);
        }`)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        vec2 wp = vWPos.xz;
        float r = length(wp);
        float inField = 1.0 - smoothstep(uFlat - 12.0, uFlat, r);
        // Mown stripes on the flying field.
        float stripe = smoothstep(0.46, 0.54, abs(fract(wp.x / 14.0) - 0.5) * 2.0);
        diffuseColor.rgb *= mix(1.0, mix(0.9, 1.08, stripe), inField);
        // Multi-scale brightness and hue variation, so the texture never tiles visibly.
        float n1 = gNoise(wp * 0.045);
        float n2 = gNoise(wp * 0.21 + 17.0);
        float n3 = gNoise(wp * 1.3 - 5.0);
        diffuseColor.rgb *= 0.86 + n1 * 0.18 + n2 * 0.1 + n3 * 0.06;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.18, 1.08, 0.7), smoothstep(0.55, 0.85, n2) * 0.45);
        // A few thin, sun-dried patches, and a worn area around the pad and pilot spot.
        float dry = smoothstep(0.68, 0.9, gNoise(wp * 0.05 + 41.0));
        float worn = (1.0 - smoothstep(1.2, 3.2, length(wp))) * 0.5 + (1.0 - smoothstep(0.4, 1.4, length(wp - vec2(0.0, 6.0)))) * 0.45;
        vec3 earth = vec3(0.32, 0.27, 0.17) * (0.85 + n3 * 0.3);
        diffuseColor.rgb = mix(diffuseColor.rgb, earth, clamp(dry * 0.3 + worn * (0.6 + n3 * 0.4), 0.0, 0.7));`,
      );
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}
