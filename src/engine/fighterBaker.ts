import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { FighterProfile } from '../data/fighters';
import type { SkinVariant } from './combatTypes';

export const STILL_W = 128;
export const STILL_H = 160;
export const SHEET_COLS = 12;
export const SHEET_ROWS = 10;
export const FRAMES_PER_SHEET = SHEET_COLS * SHEET_ROWS; // 120 frames
export const TOTAL_STILLS_PER_FIGHTER = FRAMES_PER_SHEET * 4; // 480 PNG stills

export type AnimSheetKey = 'idle' | 'walk' | 'run' | 'attack';

export interface BakedFighterAssets {
  fighterId: string;
  sheets: Record<AnimSheetKey, ImageBitmap | HTMLImageElement>;
  portraitUrl: string;
  stillCount: number;
}

interface RigJoints {
  root: THREE.Group;
  hip: THREE.Group;
  torso: THREE.Group;
  chest: THREE.Group;
  head: THREE.Group;
  shoulderL: THREE.Group;
  elbowL: THREE.Group;
  shoulderR: THREE.Group;
  elbowR: THREE.Group;
  hipL: THREE.Group;
  kneeL: THREE.Group;
  hipR: THREE.Group;
  kneeR: THREE.Group;
}

const DB_NAME = 'iron-titan-png-cache-v1';
const DB_STORE = 'sheets';
const BAKE_VERSION = 'v1';

const memoryCache = new Map<string, BakedFighterAssets>();
const portraitMemoryCache = new Map<string, string>();

function getSkinCacheKey(fighterId: string, skin: SkinVariant): string {
  return skin === 'default' ? fighterId : `${fighterId}__${skin}`;
}

function applySkinAppearance(fighter: FighterProfile, skin: SkinVariant): FighterProfile {
  if (skin === 'default') return fighter;
  if (skin === 'gold') {
    return {
      ...fighter,
      appearance: {
        ...fighter.appearance,
        trunksHex: '#ca8a04',
        accentHex: '#fef08a',
        wrapHex: '#1e293b',
      },
    };
  }
  return {
    ...fighter,
    appearance: {
      ...fighter.appearance,
      trunksHex: '#991b1b',
      accentHex: '#f87171',
      wrapHex: '#0f172a',
    },
  };
}

let sharedRenderer: THREE.WebGLRenderer | null = null;
let sharedScene: THREE.Scene | null = null;
let sharedCamera: THREE.PerspectiveCamera | null = null;
let sharedEnvMap: THREE.Texture | null = null;
let isSoftwareGlCached: boolean | null = null;

function detectSoftwareGl(): boolean {
  if (isSoftwareGlCached !== null) return isSoftwareGlCached;
  const probe = document.createElement('canvas');
  const gl = probe.getContext('webgl2') || probe.getContext('webgl');
  if (!gl) {
    isSoftwareGlCached = true;
    return true;
  }
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param) || '');
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  isSoftwareGlCached = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  return isSoftwareGlCached;
}

function ensureSharedRenderer() {
  if (sharedRenderer && sharedScene && sharedCamera) {
    return {
      renderer: sharedRenderer,
      scene: sharedScene,
      camera: sharedCamera,
      isSoftwareGl: detectSoftwareGl(),
    };
  }

  const isSoftwareGl = detectSoftwareGl();
  const renderer = new THREE.WebGLRenderer({
    antialias: !isSoftwareGl,
    alpha: true,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  renderer.setSize(STILL_W, STILL_H, false);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  sharedEnvMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = sharedEnvMap;
  pmrem.dispose();

  // Studio 3-point muscular definition rig
  const keyLight = new THREE.DirectionalLight(0xfff1dc, 2.3);
  keyLight.position.set(2.4, 3.6, 3.2);
  scene.add(keyLight);

  const hemiLight = new THREE.HemisphereLight(0x9ec5ff, 0x3a2418, 0.95);
  scene.add(hemiLight);

  const rimLight = new THREE.DirectionalLight(0xfbbf24, 1.45);
  rimLight.position.set(-2.6, 2.5, -2.2);
  scene.add(rimLight);

  const camera = new THREE.PerspectiveCamera(32, STILL_W / STILL_H, 0.1, 30);
  camera.position.set(0.05, 1.12, 4.45);
  camera.lookAt(0, 1.02, 0);

  sharedRenderer = renderer;
  sharedScene = scene;
  sharedCamera = camera;

  return { renderer, scene, camera, isSoftwareGl };
}

function buildMuscularFighterRig(fighter: FighterProfile): {
  rig: RigJoints;
  dispose: () => void;
} {
  const a = fighter.appearance;
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  const skinMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(a.skinHex),
      roughness: 0.48,
      metalness: 0.06,
    })
  );
  const hairMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(a.hairHex),
      roughness: 0.78,
      metalness: 0.05,
    })
  );
  const trunksMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(a.trunksHex),
      roughness: 0.42,
      metalness: 0.14,
    })
  );
  const accentMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(a.accentHex),
      roughness: 0.25,
      metalness: 0.72,
    })
  );
  const wrapMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(a.wrapHex),
      roughness: 0.7,
      metalness: 0.05,
    })
  );
  const bootMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color('#141821'),
      roughness: 0.38,
      metalness: 0.25,
    })
  );
  const eyeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.2,
    })
  );

  const root = new THREE.Group();
  root.scale.setScalar(a.heightScale);

  const hip = new THREE.Group();
  hip.position.set(0, 0.98, 0);
  root.add(hip);

  // Pelvis & fighting trunks
  const pelvis = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.24 * a.legScale, 0.22 * a.legScale, 0.26, 12)),
    trunksMat
  );
  hip.add(pelvis);

  // Championship belt / waist sash
  const belt = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.255 * a.legScale, 0.25 * a.legScale, 0.08, 12)),
    accentMat
  );
  belt.position.y = 0.11;
  hip.add(belt);

  const beltBuckle = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.14, 0.1, 0.06)),
    accentMat
  );
  beltBuckle.position.set(0, 0.11, 0.23 * a.legScale);
  hip.add(beltBuckle);

  // Torso & 6-pack abs
  const torso = new THREE.Group();
  torso.position.set(0, 0.13, 0);
  hip.add(torso);

  const waist = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.26 * a.chestScale, 0.22 * a.legScale, 0.26, 12)),
    skinMat
  );
  waist.position.y = 0.13;
  torso.add(waist);

  // Sculpted 6-pack abdominal blocks
  for (let row = 0; row < 3; row++) {
    for (const side of [-1, 1]) {
      const ab = new THREE.Mesh(
        trackGeo(new THREE.SphereGeometry(0.055, 8, 8)),
        skinMat
      );
      ab.scale.set(1.1, 0.85, 0.75);
      ab.position.set(side * 0.062, 0.06 + row * 0.08, 0.2 * a.chestScale);
      torso.add(ab);
    }
  }

  // Broad upper chest & latissimus V-taper
  const chest = new THREE.Group();
  chest.position.set(0, 0.27, 0);
  torso.add(chest);

  const ribcage = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.35 * a.shoulderScale, 0.26 * a.chestScale, 0.34, 12)),
    skinMat
  );
  ribcage.scale.set(1.08, 1, 0.78);
  ribcage.position.y = 0.16;
  chest.add(ribcage);

  // Massive pectoral plates
  for (const side of [-1, 1]) {
    const pec = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.16 * a.chestScale, 12, 10)),
      skinMat
    );
    pec.scale.set(1.05, 0.85, 0.72);
    pec.position.set(side * 0.145 * a.shoulderScale, 0.18, 0.18 * a.chestScale);
    chest.add(pec);
  }

  // Trapezius & thick muscular neck
  const traps = new THREE.Mesh(
    trackGeo(new THREE.ConeGeometry(0.24 * a.shoulderScale, 0.18, 10)),
    skinMat
  );
  traps.position.set(0, 0.36, -0.02);
  chest.add(traps);

  const neck = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.095, 0.125, 0.14, 10)),
    skinMat
  );
  neck.position.set(0, 0.39, 0.01);
  chest.add(neck);

  // Head
  const head = new THREE.Group();
  head.position.set(0, 0.48, 0.02);
  chest.add(head);

  const cranium = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.145, 14, 12)),
    skinMat
  );
  cranium.scale.set(0.92, 1.08, 0.98);
  cranium.position.y = 0.11;
  head.add(cranium);

  const jaw = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.18, 0.11, 0.17)),
    skinMat
  );
  jaw.position.set(0, 0.03, 0.03);
  head.add(jaw);

  // Brow ridge & eyes
  const brow = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.17, 0.04, 0.07)),
    skinMat
  );
  brow.position.set(0, 0.14, 0.12);
  head.add(brow);

  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.035, 0.018, 0.02)),
      eyeMat
    );
    eye.position.set(side * 0.048, 0.115, 0.138);
    head.add(eye);
  }

  // Beard / Mustache
  if (a.hasBeard) {
    const beard = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.115, 0.085, 0.12, 10)),
      hairMat
    );
    beard.position.set(0, 0.01, 0.045);
    head.add(beard);
  }
  if (a.hasMustache) {
    const stache = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.12, 0.028, 0.04)),
      hairMat
    );
    stache.position.set(0, 0.058, 0.132);
    head.add(stache);
  }

  // Country-specific headgear / hair silhouette
  if (a.headStyle === 'topknot') {
    const hairCap = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.148, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55)),
      hairMat
    );
    hairCap.position.y = 0.12;
    head.add(hairCap);
    const knot = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.055, 8, 8)), hairMat);
    knot.position.set(0, 0.27, -0.04);
    head.add(knot);
  } else if (a.headStyle === 'headband_braid') {
    const hairCap = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.148, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.52)),
      hairMat
    );
    hairCap.position.y = 0.12;
    head.add(hairCap);
    const band = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.15, 0.15, 0.042, 12)),
      accentMat
    );
    band.position.set(0, 0.16, 0.01);
    head.add(band);
    const braid = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.032, 0.02, 0.24, 8)),
      hairMat
    );
    braid.position.set(0, 0.06, -0.15);
    braid.rotation.x = 0.3;
    head.add(braid);
  } else if (a.headStyle === 'flattop') {
    const flattop = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.135, 0.135, 0.09, 10)),
      hairMat
    );
    flattop.position.set(0, 0.21, -0.01);
    head.add(flattop);
  } else if (a.headStyle === 'swept') {
    const swept = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.24, 0.1, 0.26)),
      hairMat
    );
    swept.position.set(0, 0.2, -0.02);
    swept.rotation.x = -0.18;
    head.add(swept);
  } else if (a.headStyle === 'turban_beard') {
    const turban = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.185, 12, 10)),
      accentMat
    );
    turban.scale.set(1.05, 0.88, 1.08);
    turban.position.set(0, 0.19, -0.01);
    head.add(turban);
    const crest = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.155, 0.17, 0.08, 12)),
      trunksMat
    );
    crest.position.set(0, 0.21, 0.01);
    head.add(crest);
  } else if (a.headStyle === 'locks') {
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI - Math.PI * 0.5;
      const lock = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.028, 0.022, 0.24, 6)),
        hairMat
      );
      lock.position.set(Math.sin(ang) * 0.12, 0.14, -0.1 - Math.cos(ang) * 0.04);
      lock.rotation.x = 0.35;
      head.add(lock);
    }
  } else if (a.headStyle === 'fade') {
    const fadeCap = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.147, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.45)),
      hairMat
    );
    fadeCap.position.y = 0.125;
    head.add(fadeCap);
  } else if (a.headStyle === 'bandana') {
    const bandana = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.152, 0.148, 0.065, 12)),
      trunksMat
    );
    bandana.position.set(0, 0.17, 0);
    head.add(bandana);
    const hairTop = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.142, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.42)),
      hairMat
    );
    hairTop.position.y = 0.14;
    head.add(hairTop);
  }

  // Arms factory (deltoid -> bicep -> elbow -> forearm -> taped fist)
  const makeArm = (side: -1 | 1) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.42 * a.shoulderScale, 0.29, 0);
    chest.add(shoulder);

    const deltoid = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.135 * a.armScale, 10, 10)),
      skinMat
    );
    deltoid.scale.set(1.08, 1.0, 0.95);
    shoulder.add(deltoid);

    const bicep = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.105 * a.armScale, 0.088 * a.armScale, 0.31, 10)),
      skinMat
    );
    bicep.position.y = -0.17;
    shoulder.add(bicep);

    const elbow = new THREE.Group();
    elbow.position.y = -0.34;
    shoulder.add(elbow);

    const forearm = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.088 * a.armScale, 0.068 * a.armScale, 0.28, 10)),
      skinMat
    );
    forearm.position.y = -0.14;
    elbow.add(forearm);

    const wrap = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.078 * a.armScale, 0.072 * a.armScale, 0.11, 10)),
      wrapMat
    );
    wrap.position.y = -0.23;
    elbow.add(wrap);

    const fist = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.125 * a.armScale, 0.125 * a.armScale, 0.135 * a.armScale)),
      wrapMat
    );
    fist.position.y = -0.32;
    elbow.add(fist);

    return { shoulder, elbow };
  };

  const armL = makeArm(-1);
  const armR = makeArm(1);

  // Legs factory (quad -> knee -> calf -> fighting boot)
  const makeLeg = (side: -1 | 1) => {
    const legHip = new THREE.Group();
    legHip.position.set(side * 0.15 * a.legScale, -0.06, 0);
    hip.add(legHip);

    const trunksLeg = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.135 * a.legScale, 0.122 * a.legScale, 0.18, 10)),
      trunksMat
    );
    trunksLeg.position.y = -0.08;
    legHip.add(trunksLeg);

    const quad = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.132 * a.legScale, 0.105 * a.legScale, 0.38, 10)),
      skinMat
    );
    quad.position.y = -0.24;
    legHip.add(quad);

    const knee = new THREE.Group();
    knee.position.y = -0.45;
    legHip.add(knee);

    const calf = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.102 * a.legScale, 0.076 * a.legScale, 0.36, 10)),
      skinMat
    );
    calf.position.y = -0.18;
    knee.add(calf);

    const shinWrap = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.085 * a.legScale, 0.08 * a.legScale, 0.13, 10)),
      accentMat
    );
    shinWrap.position.y = -0.31;
    knee.add(shinWrap);

    const boot = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.14 * a.legScale, 0.1, 0.25)),
      bootMat
    );
    boot.position.set(0, -0.41, 0.05);
    knee.add(boot);

    return { legHip, knee };
  };

  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  // Hero combat orientation (+X facing right, angled slightly toward camera)
  root.rotation.y = Math.PI * 0.36;

  const dispose = () => {
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
  };

  return {
    rig: {
      root,
      hip,
      torso,
      chest,
      head,
      shoulderL: armL.shoulder,
      elbowL: armL.elbow,
      shoulderR: armR.shoulder,
      elbowR: armR.elbow,
      hipL: legL.legHip,
      kneeL: legL.knee,
      hipR: legR.legHip,
      kneeR: legR.knee,
    },
    dispose,
  };
}

function resetPose(rig: RigJoints) {
  rig.hip.position.set(0, 0.98, 0);
  rig.hip.rotation.set(0, 0, 0);
  rig.torso.rotation.set(0, 0, 0);
  rig.chest.rotation.set(0, 0, 0);
  rig.head.rotation.set(0, 0, 0);

  rig.shoulderL.rotation.set(0, 0, 0);
  rig.elbowL.rotation.set(0, 0, 0);
  rig.shoulderR.rotation.set(0, 0, 0);
  rig.elbowR.rotation.set(0, 0, 0);

  rig.hipL.rotation.set(0, 0, 0);
  rig.kneeL.rotation.set(0, 0, 0);
  rig.hipR.rotation.set(0, 0, 0);
  rig.kneeR.rotation.set(0, 0, 0);
}

function applyFighterPose(rig: RigJoints, anim: AnimSheetKey, frameIdx: number) {
  resetPose(rig);
  const t = frameIdx / FRAMES_PER_SHEET;
  const tau = Math.PI * 2;

  if (anim === 'idle') {
    const breath = Math.sin(t * tau * 2);
    const bounce = Math.abs(Math.sin(t * tau * 2));
    rig.hip.position.y = 0.96 - bounce * 0.04;
    rig.torso.rotation.x = 0.1 + breath * 0.03;
    rig.torso.rotation.y = -0.18 + Math.sin(t * tau) * 0.06;
    rig.head.rotation.y = 0.18;
    rig.head.rotation.x = -0.06;

    // Guard stance: lead arm up, rear arm tight to chin
    rig.shoulderL.rotation.set(-0.95 + breath * 0.08, 0.2, -0.22);
    rig.elbowL.rotation.set(-1.35, 0, 0.25);
    rig.shoulderR.rotation.set(-1.05 - breath * 0.06, -0.25, 0.25);
    rig.elbowR.rotation.set(-1.55, 0, -0.35);

    rig.hipL.rotation.set(-0.32 - bounce * 0.06, 0, -0.14);
    rig.kneeL.rotation.set(0.42 + bounce * 0.08, 0, 0);
    rig.hipR.rotation.set(0.24 + bounce * 0.05, 0, 0.16);
    rig.kneeR.rotation.set(0.28 + bounce * 0.06, 0, 0);
    return;
  }

  if (anim === 'walk') {
    // 2 full walk cycles in 120 frames
    const phase = t * tau * 2;
    const stride = Math.sin(phase);
    const liftL = Math.max(0, Math.cos(phase));
    const liftR = Math.max(0, -Math.cos(phase));

    rig.hip.position.y = 0.95 + Math.abs(Math.cos(phase)) * 0.04;
    rig.torso.rotation.x = 0.14;
    rig.torso.rotation.y = stride * 0.14 - 0.12;
    rig.head.rotation.y = 0.12;

    rig.shoulderL.rotation.set(-0.9 - stride * 0.25, 0.15, -0.2);
    rig.elbowL.rotation.set(-1.3, 0, 0.2);
    rig.shoulderR.rotation.set(-0.95 + stride * 0.25, -0.2, 0.22);
    rig.elbowR.rotation.set(-1.45, 0, -0.25);

    rig.hipL.rotation.set(-stride * 0.48 - 0.1, 0, -0.1);
    rig.kneeL.rotation.set(0.25 + liftL * 0.55, 0, 0);
    rig.hipR.rotation.set(stride * 0.48 - 0.1, 0, 0.1);
    rig.kneeR.rotation.set(0.25 + liftR * 0.55, 0, 0);
    return;
  }

  if (anim === 'run') {
    // 2 aggressive sprint cycles in 120 frames
    const phase = t * tau * 2;
    const stride = Math.sin(phase);
    const kneePumpL = Math.max(0, Math.sin(phase + 0.7));
    const kneePumpR = Math.max(0, -Math.sin(phase + 0.7));

    rig.hip.position.y = 0.92 + Math.abs(Math.sin(phase)) * 0.09;
    rig.torso.rotation.x = 0.34;
    rig.torso.rotation.y = stride * 0.24;
    rig.head.rotation.x = -0.22;

    rig.shoulderL.rotation.set(-0.6 - stride * 0.85, 0.1, -0.18);
    rig.elbowL.rotation.set(-1.55, 0, 0.15);
    rig.shoulderR.rotation.set(-0.6 + stride * 0.85, -0.1, 0.18);
    rig.elbowR.rotation.set(-1.55, 0, -0.15);

    rig.hipL.rotation.set(-stride * 0.85 - 0.18, 0, -0.08);
    rig.kneeL.rotation.set(0.2 + kneePumpL * 1.15, 0, 0);
    rig.hipR.rotation.set(stride * 0.85 - 0.18, 0, 0.08);
    rig.kneeR.rotation.set(0.2 + kneePumpR * 1.15, 0, 0);
    return;
  }

  // Attack sheet (120 frames partitioned into Jab, Heavy Uppercut/Cross, Signature Slam, Guard, Hit)
  if (frameIdx < 30) {
    // 0..29: Snappy Lead Jab
    const p = frameIdx / 29;
    const snap = Math.sin(p * Math.PI);
    rig.hip.position.y = 0.94;
    rig.torso.rotation.x = 0.16 + snap * 0.12;
    rig.torso.rotation.y = -0.15 - snap * 0.55;
    rig.head.rotation.y = 0.22 + snap * 0.35;

    rig.shoulderL.rotation.set(-1.35 * snap - 0.9 * (1 - snap), 0.15, -0.12);
    rig.elbowL.rotation.set(-1.35 * (1 - snap) - 0.08 * snap, 0, 0);
    rig.shoulderR.rotation.set(-1.1, -0.25, 0.25);
    rig.elbowR.rotation.set(-1.6, 0, -0.3);

    rig.hipL.rotation.set(-0.42 - snap * 0.18, 0, -0.14);
    rig.kneeL.rotation.set(0.55, 0, 0);
    rig.hipR.rotation.set(0.32 + snap * 0.15, 0, 0.14);
    rig.kneeR.rotation.set(0.22, 0, 0);
  } else if (frameIdx < 60) {
    // 30..59: Heavy Power Cross / Uppercut
    const p = (frameIdx - 30) / 29;
    const drive = Math.sin(p * Math.PI);
    rig.hip.position.y = 0.9 + drive * 0.08;
    rig.torso.rotation.x = 0.22 - drive * 0.28;
    rig.torso.rotation.y = -0.3 + drive * 0.85;
    rig.head.rotation.y = -drive * 0.45;

    rig.shoulderL.rotation.set(-0.9, 0.25, -0.25);
    rig.elbowL.rotation.set(-1.55, 0, 0.2);

    rig.shoulderR.rotation.set(-1.55 * drive - 0.9 * (1 - drive), -0.1, 0.12);
    rig.elbowR.rotation.set(-1.4 * (1 - drive) - 0.35 * drive, 0, 0);

    rig.hipL.rotation.set(-0.48, 0, -0.15);
    rig.kneeL.rotation.set(0.6, 0, 0);
    rig.hipR.rotation.set(0.35, 0, 0.15);
    rig.kneeR.rotation.set(0.3, 0, 0);
  } else if (frameIdx < 96) {
    // 60..95: Signature Airborne Double-Fist / Heavy Slam
    const p = (frameIdx - 60) / 35;
    const arc = Math.sin(p * Math.PI);
    const slam = p > 0.55 ? Math.min(1, (p - 0.55) / 0.25) : 0;
    rig.hip.position.y = 0.92 + arc * 0.28 - slam * 0.14;
    rig.torso.rotation.x = -0.22 * (1 - slam) + 0.55 * slam;
    rig.torso.rotation.y = 0.2 * (1 - slam);

    const armRaise = -2.45 * (1 - slam) + -0.85 * slam;
    rig.shoulderL.rotation.set(armRaise, 0.15, -0.25);
    rig.elbowL.rotation.set(-0.35, 0, 0.2);
    rig.shoulderR.rotation.set(armRaise, -0.15, 0.25);
    rig.elbowR.rotation.set(-0.35, 0, -0.2);

    rig.hipL.rotation.set(-0.55 - arc * 0.25, 0, -0.18);
    rig.kneeL.rotation.set(0.75 + arc * 0.3, 0, 0);
    rig.hipR.rotation.set(0.25 - arc * 0.2, 0, 0.18);
    rig.kneeR.rotation.set(0.4 + arc * 0.4, 0, 0);
  } else if (frameIdx < 108) {
    // 96..107: Iron Guard / Crouch Block
    rig.hip.position.y = 0.84;
    rig.torso.rotation.x = 0.28;
    rig.torso.rotation.y = -0.1;
    rig.head.rotation.x = 0.16;

    rig.shoulderL.rotation.set(-1.35, 0.48, -0.1);
    rig.elbowL.rotation.set(-1.65, 0, 0.45);
    rig.shoulderR.rotation.set(-1.35, -0.48, 0.1);
    rig.elbowR.rotation.set(-1.65, 0, -0.45);

    rig.hipL.rotation.set(-0.58, 0, -0.16);
    rig.kneeL.rotation.set(0.85, 0, 0);
    rig.hipR.rotation.set(0.18, 0, 0.16);
    rig.kneeR.rotation.set(0.65, 0, 0);
  } else {
    // 108..119: Hit Stagger / Recoil
    const p = (frameIdx - 108) / 11;
    const recoil = Math.sin(p * Math.PI * 0.8 + 0.2);
    rig.hip.position.y = 0.92;
    rig.torso.rotation.x = -0.35 * recoil;
    rig.torso.rotation.z = -0.14 * recoil;
    rig.head.rotation.x = -0.38 * recoil;

    rig.shoulderL.rotation.set(-0.5, 0.2, -0.55);
    rig.elbowL.rotation.set(-0.9, 0, 0);
    rig.shoulderR.rotation.set(-0.4, -0.2, 0.55);
    rig.elbowR.rotation.set(-0.8, 0, 0);

    rig.hipL.rotation.set(-0.22, 0, -0.18);
    rig.kneeL.rotation.set(0.35, 0, 0);
    rig.hipR.rotation.set(0.28, 0, 0.18);
    rig.kneeR.rotation.set(0.35, 0, 0);
  }
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to encode PNG sprite sheet'));
      },
      'image/png'
    );
  });
}

async function blobToDrawable(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    return await createImageBitmap(blob);
  }
  return await new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = url;
  });
}

function openCacheDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DB_STORE)) {
          db.createObjectStore(DB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function readCachedFighterBlobs(
  fighterId: string
): Promise<Record<AnimSheetKey | 'portrait', Blob> | null> {
  const db = await openCacheDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(DB_STORE, 'readonly');
      const store = tx.objectStore(DB_STORE);
      const req = store.get(`${BAKE_VERSION}:${fighterId}`);
      req.onsuccess = () => {
        db.close();
        resolve(req.result || null);
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

async function writeCachedFighterBlobs(
  fighterId: string,
  blobs: Record<AnimSheetKey | 'portrait', Blob>
): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(DB_STORE, 'readwrite');
      const store = tx.objectStore(DB_STORE);
      store.put(blobs, `${BAKE_VERSION}:${fighterId}`);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

export async function bakeFighterPortraitPng(
  fighter: FighterProfile,
  skin: SkinVariant = 'default'
): Promise<string> {
  const key = getSkinCacheKey(fighter.id, skin);
  const cached = portraitMemoryCache.get(key);
  if (cached) return cached;

  const styled = applySkinAppearance(fighter, skin);
  const { renderer, scene, camera } = ensureSharedRenderer();
  const { rig, dispose } = buildMuscularFighterRig(styled);
  scene.add(rig.root);

  const prevPos = camera.position.clone();
  camera.position.set(0.18, 1.56, 1.55);
  camera.lookAt(0, 1.5, 0);

  applyFighterPose(rig, 'idle', 12);
  rig.root.rotation.y = 0.25;
  renderer.render(scene, camera);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = 160;
  outCanvas.height = 160;
  const ctx = outCanvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(80, 74, 12, 80, 80, 82);
  grad.addColorStop(0, `${styled.appearance.accentHex}55`);
  grad.addColorStop(0.65, `${styled.appearance.trunksHex}44`);
  grad.addColorStop(1, '#0b0e1400');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 160, 160);
  ctx.drawImage(renderer.domElement, 16, 0, 128, 160);

  camera.position.copy(prevPos);
  camera.lookAt(0, 1.02, 0);
  scene.remove(rig.root);
  dispose();

  const blob = await canvasToPngBlob(outCanvas);
  const url = URL.createObjectURL(blob);
  portraitMemoryCache.set(key, url);
  return url;
}

export async function bakeFighterSheets(
  fighter: FighterProfile,
  onProgress?: (completedFrames: number, totalFrames: number) => void,
  skin: SkinVariant = 'default'
): Promise<BakedFighterAssets> {
  const key = getSkinCacheKey(fighter.id, skin);
  const existing = memoryCache.get(key);
  if (existing) {
    onProgress?.(TOTAL_STILLS_PER_FIGHTER, TOTAL_STILLS_PER_FIGHTER);
    return existing;
  }

  const cachedBlobs = await readCachedFighterBlobs(key);
  if (cachedBlobs && cachedBlobs.idle && cachedBlobs.walk && cachedBlobs.run && cachedBlobs.attack) {
    const [idle, walk, run, attack] = await Promise.all([
      blobToDrawable(cachedBlobs.idle),
      blobToDrawable(cachedBlobs.walk),
      blobToDrawable(cachedBlobs.run),
      blobToDrawable(cachedBlobs.attack),
    ]);
    const portraitUrl = cachedBlobs.portrait
      ? URL.createObjectURL(cachedBlobs.portrait)
      : await bakeFighterPortraitPng(fighter, skin);
    portraitMemoryCache.set(key, portraitUrl);
    const result: BakedFighterAssets = {
      fighterId: fighter.id,
      sheets: { idle, walk, run, attack },
      portraitUrl,
      stillCount: TOTAL_STILLS_PER_FIGHTER,
    };
    memoryCache.set(key, result);
    onProgress?.(TOTAL_STILLS_PER_FIGHTER, TOTAL_STILLS_PER_FIGHTER);
    return result;
  }

  const styled = applySkinAppearance(fighter, skin);
  const { renderer, scene, camera, isSoftwareGl } = ensureSharedRenderer();
  const { rig, dispose } = buildMuscularFighterRig(styled);
  scene.add(rig.root);

  const animKeys: AnimSheetKey[] = ['idle', 'walk', 'run', 'attack'];
  const sheetBlobs = {} as Record<AnimSheetKey, Blob>;
  const sheetDrawables = {} as Record<AnimSheetKey, ImageBitmap | HTMLImageElement>;

  const atlasCanvas = document.createElement('canvas');
  atlasCanvas.width = STILL_W * SHEET_COLS;
  atlasCanvas.height = STILL_H * SHEET_ROWS;
  const atlasCtx = atlasCanvas.getContext('2d')!;

  const chunkSize = isSoftwareGl ? 30 : 60;
  let totalDone = 0;

  for (const anim of animKeys) {
    atlasCtx.clearRect(0, 0, atlasCanvas.width, atlasCanvas.height);

    for (let f = 0; f < FRAMES_PER_SHEET; f++) {
      applyFighterPose(rig, anim, f);
      renderer.render(scene, camera);

      const col = f % SHEET_COLS;
      const row = Math.floor(f / SHEET_COLS);
      atlasCtx.drawImage(renderer.domElement, col * STILL_W, row * STILL_H);

      totalDone++;
      if (totalDone % chunkSize === 0) {
        onProgress?.(totalDone, TOTAL_STILLS_PER_FIGHTER);
        await new Promise((r) => requestAnimationFrame(r));
      }
    }

    const pngBlob = await canvasToPngBlob(atlasCanvas);
    sheetBlobs[anim] = pngBlob;
    sheetDrawables[anim] = await blobToDrawable(pngBlob);
  }

  const portraitUrl = await bakeFighterPortraitPng(fighter, skin);
  const portraitResp = await fetch(portraitUrl);
  const portraitBlob = await portraitResp.blob();

  scene.remove(rig.root);
  dispose();

  await writeCachedFighterBlobs(key, {
    ...sheetBlobs,
    portrait: portraitBlob,
  });

  const baked: BakedFighterAssets = {
    fighterId: fighter.id,
    sheets: sheetDrawables,
    portraitUrl,
    stillCount: TOTAL_STILLS_PER_FIGHTER,
  };
  memoryCache.set(key, baked);
  onProgress?.(TOTAL_STILLS_PER_FIGHTER, TOTAL_STILLS_PER_FIGHTER);
  return baked;
}

export async function getCachedFighterIds(): Promise<string[]> {
  const ids = new Set<string>();
  for (const k of memoryCache.keys()) {
    ids.add(k.split('__')[0]);
  }
  const db = await openCacheDb();
  if (!db) return Array.from(ids);

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(DB_STORE, 'readonly');
      const store = tx.objectStore(DB_STORE);
      const req = store.getAllKeys();
      req.onsuccess = () => {
        db.close();
        const keys = Array.isArray(req.result) ? req.result : [];
        for (const k of keys) {
          const s = String(k);
          if (s.startsWith(`${BAKE_VERSION}:`)) {
            const rawId = s.slice(BAKE_VERSION.length + 1);
            ids.add(rawId.split('__')[0]);
          }
        }
        resolve(Array.from(ids));
      };
      req.onerror = () => {
        db.close();
        resolve(Array.from(ids));
      };
    } catch {
      db.close();
      resolve(Array.from(ids));
    }
  });
}

export async function prewarmAllFighters(
  fighters: FighterProfile[],
  onProgress?: (completedFighters: number, totalFighters: number, currentName: string) => void
): Promise<void> {
  for (let i = 0; i < fighters.length; i++) {
    onProgress?.(i, fighters.length, fighters[i].name);
    await bakeFighterSheets(fighters[i]);
  }
  onProgress?.(fighters.length, fighters.length, 'Complete');
}

