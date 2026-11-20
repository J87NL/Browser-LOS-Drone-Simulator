import * as THREE from 'three';
import { PAD } from './course.js';
import { WORLD } from '../config.js';
import { mulberry32 } from './rng.js';

export const GRASS = {
  blades: 90000,
  tileMetres: 26,
  height: 0.08,
  width: 0.018,
};

function bladeGeometry() {
  const w = GRASS.width / 2;
  const positions = [
    -w, 0, 0,
    w, 0, 0,
    -w * 0.7, 0.45, 0,
    w * 0.7, 0.45, 0,
    0, 1, 0,
  ];
  const indices = [0, 1, 2, 2, 1, 3, 2, 3, 4];
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(Array(5).fill([0, 1, 0]).flat(), 3));
  geometry.setIndex(indices);
  return geometry;
}

function bladeAttributes(count) {
  const rand = mulberry32(99);
  const offsets = new Float32Array(count * 2);
  const shapes = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    offsets[i * 2] = rand() * GRASS.tileMetres;
    offsets[i * 2 + 1] = rand() * GRASS.tileMetres;
    shapes[i * 3] = rand() * Math.PI * 2;
    shapes[i * 3 + 1] = 0.55 + rand() * 0.9;
    shapes[i * 3 + 2] = rand();
  }
  return {
    offsets: new THREE.InstancedBufferAttribute(offsets, 2),
    shapes: new THREE.InstancedBufferAttribute(shapes, 3),
  };
}

export function createGrass() {
  const geometry = bladeGeometry();
  const { offsets, shapes } = bladeAttributes(GRASS.blades);
  geometry.setAttribute('aOffset', offsets);
  geometry.setAttribute('aShape', shapes);
  geometry.instanceCount = GRASS.blades;

  const uniforms = {
    uCentre: { value: new THREE.Vector2() },
    uTime: { value: 0 },
    uWind: { value: 0 },
  };
  const material = new THREE.MeshStandardMaterial({ color: '#74a03c', roughness: 0.9, side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 aOffset;
        attribute vec3 aShape;
        uniform vec2 uCentre;
        uniform float uTime;
        uniform float uWind;
        varying float vTip;
        varying float vTint;`)
      .replace('#include <begin_vertex>', `
        float tile = ${GRASS.tileMetres.toFixed(1)};
        vec2 corner = uCentre - tile * 0.5;
        vec2 world = corner + mod(aOffset - corner, tile);
        float fromCentre = length(world - uCentre) / (tile * 0.5);
        float fieldEdge = 1.0 - smoothstep(${(WORLD.flatRadius - 8).toFixed(1)}, ${WORLD.flatRadius.toFixed(1)}, length(world));
        vec2 onPad = step(abs(world), vec2(${(PAD.half + 0.08).toFixed(2)}));
        float pad = 1.0 - onPad.x * onPad.y;
        float worn = mix(0.35, 1.0, smoothstep(1.2, 3.2, length(world)));
        float size = aShape.y * fieldEdge * pad * worn * (1.0 - smoothstep(0.55, 1.0, fromCentre));
        float c = cos(aShape.x);
        float s = sin(aShape.x);
        vec3 transformed = vec3(position.x * c, position.y * ${GRASS.height.toFixed(3)} * size, position.x * s);
        float sway = sin(uTime * (1.6 + uWind * 0.25) + world.x * 0.7 + world.y * 0.45) * (0.15 + uWind * 0.03);
        transformed.xz += vec2(sway, sway * 0.4 + aShape.z * 0.3 - 0.15) * position.y * position.y * ${GRASS.height.toFixed(3)} * size;
        transformed.xz += world;
        vTip = position.y;
        vTint = aShape.z;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vTip;
        varying float vTint;`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        normal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= mix(0.55, 1.0, vTip) * mix(0.85, 1.1, vTint);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.2, 1.1, 0.65), step(0.92, vTint) * vTip * 0.4);`);
  };

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.name = 'grass';
  mesh.visible = false;

  return {
    mesh,
    update(time, centre, windSpeed) {
      uniforms.uTime.value = time;
      uniforms.uCentre.value.set(centre.x, centre.z);
      uniforms.uWind.value = windSpeed;
    },
  };
}
