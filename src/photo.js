// Optional "photo" quality: a real sky (HDRI) for background and lighting, a
// photo-scanned ground texture, ambient occlusion and sharper sun shadows.
// The image files are optional: whatever is missing keeps its procedural
// look, so the mode also works (as AO + shadows) without them.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

// Files are served from static/ (copied into the build). See static/photo/README.md.
export const PHOTO_ASSETS = {
  sky: 'photo/sky.hdr',
  groundColor: 'photo/ground_diff.jpg',
  groundNormal: 'photo/ground_nor.jpg',
  groundRough: 'photo/ground_rough.jpg',
  groundTileMetres: 3, // how many metres one repeat of the ground texture covers
};

const MIN_SUN_ELEVATION = THREE.MathUtils.degToRad(12);

/**
 * Brightest pixel of an equirectangular float image = the sun, as a world
 * direction (three.js equirect mapping, flipY), plus the average horizon colour.
 * @param {{width:number,height:number,data:Float32Array}} image RGBA float data
 */
export function analyseSky(image) {
  const { width: w, height: h, data } = image;
  let best = -1;
  let bx = 0;
  let by = 0;
  for (let y = 0; y < h / 2; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const l = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
      if (l > best) {
        best = l;
        bx = x;
        by = y;
      }
    }
  }
  const u = (bx + 0.5) / w;
  const v = 1 - (by + 0.5) / h;
  const phi = (u - 0.5) * Math.PI * 2;
  const theta = Math.max(MIN_SUN_ELEVATION, (v - 0.5) * Math.PI);
  const sun = new THREE.Vector3(Math.cos(theta) * Math.cos(phi), Math.sin(theta), Math.cos(theta) * Math.sin(phi));

  // Average colour in a band just above the horizon (for the fog).
  const horizon = [0, 0, 0];
  let n = 0;
  const y0 = Math.floor(h * 0.44);
  const y1 = Math.floor(h * 0.49);
  for (let y = y0; y <= y1; y++) {
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4;
      horizon[0] += data[i];
      horizon[1] += data[i + 1];
      horizon[2] += data[i + 2];
      n++;
    }
  }
  return { sun, horizon: horizon.map((c) => c / Math.max(1, n)) };
}

export function createPhotoMode({ renderer, scene, camera, sky, sunDir, lights, terrain }) {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, 1, 1, undefined, {
    radius: 0.6, distanceExponent: 1.5, thickness: 1, scale: 1, samples: 12, distanceFallOff: 1, screenSpaceRadius: false,
  });
  gtao.blendIntensity = 0.9;
  composer.addPass(gtao);
  composer.addPass(new OutputPass());

  const mat = terrain.material;
  const original = {
    background: scene.background,
    environment: scene.environment,
    environmentIntensity: scene.environmentIntensity,
    fog: scene.fog.color.clone(),
    sun: sunDir.clone(),
    map: mat.map,
    vertexColors: mat.vertexColors,
  };
  let loaded = null; // Promise of { sky, env, analysis, maps }
  let enabled = false;

  const loadTexture = (url, srgb) =>
    new THREE.TextureLoader().loadAsync(url).then((t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      const repeat = 5 / PHOTO_ASSETS.groundTileMetres; // terrain UVs: 1 unit = 5 m
      t.repeat.set(repeat, repeat);
      t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    }).catch(() => null);

  function load() {
    if (loaded) return loaded;
    const skyP = new HDRLoader()
      .setDataType(THREE.FloatType)
      .loadAsync(PHOTO_ASSETS.sky)
      .then((tex) => {
        tex.mapping = THREE.EquirectangularReflectionMapping;
        const analysis = analyseSky(tex.image);
        const pmrem = new THREE.PMREMGenerator(renderer);
        const env = pmrem.fromEquirectangular(tex).texture;
        pmrem.dispose();
        return { tex, env, analysis };
      })
      .catch(() => null);
    loaded = Promise.all([
      skyP,
      loadTexture(PHOTO_ASSETS.groundColor, true),
      loadTexture(PHOTO_ASSETS.groundNormal, false),
      loadTexture(PHOTO_ASSETS.groundRough, false),
    ]).then(([skyData, color, normal, rough]) => ({ skyData, color, normal, rough }));
    return loaded;
  }

  function applyAssets(on, a) {
    if (a?.skyData) {
      const { tex, env, analysis } = a.skyData;
      sky.visible = !on;
      scene.background = on ? tex : original.background;
      scene.environment = on ? env : original.environment;
      scene.environmentIntensity = on ? 1 : original.environmentIntensity;
      if (on) {
        scene.fog.color.setRGB(...analysis.horizon, THREE.LinearSRGBColorSpace);
        sunDir.copy(analysis.sun);
      } else {
        scene.fog.color.copy(original.fog);
        sunDir.copy(original.sun);
      }
    }
    if (a?.color) {
      mat.map = on ? a.color : original.map;
      mat.normalMap = on ? a.normal : null;
      mat.roughnessMap = on ? a.rough : null;
      mat.vertexColors = on ? false : original.vertexColors;
      mat.needsUpdate = true;
    }
  }

  return {
    get enabled() {
      return enabled;
    },
    /**
     * @returns {Promise<{sky:boolean, ground:boolean}>} which photo assets were found
     */
    async setEnabled(on) {
      enabled = on;
      lights.setHighQuality(on);
      if (!on) {
        applyAssets(false, loaded ? await loaded : null);
        return { sky: false, ground: false };
      }
      const a = await load();
      if (enabled) applyAssets(true, a); // still wanted after loading
      return { sky: !!a.skyData, ground: !!a.color };
    },
    setSize(width, height, pixelRatio) {
      composer.setPixelRatio(pixelRatio);
      composer.setSize(width, height);
    },
    render() {
      composer.render();
    },
  };
}
