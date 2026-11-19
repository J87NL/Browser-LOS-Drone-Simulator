// Grass blades around the camera. One instanced patch is wrapped around the
// camera in the vertex shader (mod on world position), so the blades stay
// put in the world while the patch follows the viewer with no CPU work.
// Only on the flat flying field, never on the launch pad.
import * as THREE from 'three';
import { WORLD } from '../config.js';
import { mulberry32 } from './rng.js';
import { PAD } from './course.js';

const RADIUS = 14; // half size of the patch (m)
const DENSITY = 60; // blades per m²

const vertexShader = /* glsl */ `
  uniform vec3 uCenter;
  uniform float uR;
  uniform float uTime;
  uniform float uFlat;
  uniform float uPad;
  attribute vec4 aBlade; // x, z offset in the patch, rotation, height
  attribute float aShade;
  varying float vH;
  varying float vShade;
  #include <fog_pars_vertex>
  void main() {
    vec2 p = uCenter.xz + mod(aBlade.xy - uCenter.xz + uR, 2.0 * uR) - uR;
    float d = length(p - uCenter.xz);
    float fade = (1.0 - smoothstep(uR * 0.55, uR, d)) * (1.0 - smoothstep(uFlat - 12.0, uFlat, length(p)));
    if (abs(p.x) < uPad && abs(p.y) < uPad) fade = 0.0;
    float h = aBlade.w * fade;
    float c = cos(aBlade.z);
    float s = sin(aBlade.z);
    vec3 pos = vec3(position.x * c, position.y * h, position.x * s);
    float gust = sin(uTime * 1.6 + p.x * 0.31 + p.y * 0.23) * 0.6 + sin(uTime * 3.7 + p.x * 1.7 + p.y * 1.1) * 0.25;
    float bend = position.y * position.y * h;
    pos.x += (0.35 + gust) * bend * 0.45;
    pos.z += gust * bend * 0.2;
    vec4 mvPosition = viewMatrix * vec4(p.x + pos.x, pos.y, p.y + pos.z, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    vH = position.y;
    vShade = aShade;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uTip;
  varying float vH;
  varying float vShade;
  #include <common>
  #include <fog_pars_fragment>
  void main() {
    vec3 col = mix(uBase, uTip, vH) * (0.8 + vShade * 0.4);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export function createGrass(scene) {
  const area = (RADIUS * 2) ** 2;
  const count = Math.round(area * DENSITY);
  // One blade: a narrow tapered strip, y from 0 (root) to 1 (tip).
  const blade = new THREE.BufferGeometry();
  const w = 0.011;
  const verts = [-w, 0, 0, w, 0, 0, -w * 0.75, 0.45, 0, w * 0.75, 0.45, 0, -w * 0.35, 0.8, 0, w * 0.35, 0.8, 0, 0, 1, 0];
  blade.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  blade.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5, 4, 5, 6]);

  const geo = new THREE.InstancedBufferGeometry();
  geo.index = blade.index;
  geo.attributes.position = blade.attributes.position;
  const rand = mulberry32(WORLD.seed + 7);
  const bladeData = new Float32Array(count * 4);
  const shade = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    bladeData[i * 4] = (rand() * 2 - 1) * RADIUS;
    bladeData[i * 4 + 1] = (rand() * 2 - 1) * RADIUS;
    bladeData[i * 4 + 2] = rand() * Math.PI;
    bladeData[i * 4 + 3] = 0.05 + rand() * rand() * 0.12;
    shade[i] = rand();
  }
  geo.setAttribute('aBlade', new THREE.InstancedBufferAttribute(bladeData, 4));
  geo.setAttribute('aShade', new THREE.InstancedBufferAttribute(shade, 1));
  geo.instanceCount = count;

  const mat = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uCenter: { value: new THREE.Vector3() },
        uR: { value: RADIUS },
        uTime: { value: 0 },
        uFlat: { value: WORLD.flatRadius },
        uPad: { value: PAD.half + 0.08 },
        uBase: { value: new THREE.Color('#4a7a2c') },
        uTip: { value: new THREE.Color('#a6c865') },
      },
    ]),
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; // positions are made in the shader
  mesh.name = 'grass';
  scene.add(mesh);

  return {
    mesh,
    update(time, cameraPos) {
      mat.uniforms.uTime.value = time;
      mat.uniforms.uCenter.value.copy(cameraPos);
    },
    setVisible(v) {
      mesh.visible = v;
    },
  };
}
