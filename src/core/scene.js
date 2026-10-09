// The living 3D background shared by every module.
// Modules talk to it through the small API returned by createScene().

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const NOOP_SCENE = { setAccent() {}, pulse() {}, warp() {}, setFocus() {}, destroy() {} };

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createScene(canvas) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (err) {
    console.warn('[scene] WebGL unavailable, falling back to a static background', err);
    canvas.remove();
    return NOOP_SCENE;
  }

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Phones and tablets have dense screens but small GPUs; the background is soft
  // (bloom, stars), so a lower render scale looks the same and saves battery.
  const handheld = matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio, handheld ? 1.25 : 1.5));
  renderer.setClearColor(0x05060a, 1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05060a);
  scene.fog = new THREE.FogExp2(0x05060a, 0.028);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 250);
  camera.position.set(0, 0, 12);

  const accent = new THREE.Color('#7c5cff');
  const accentTarget = accent.clone();
  const sprite = dotTexture();

  // --- Star tunnel -------------------------------------------------------
  const STARS = 2600;
  const DEPTH = 140;
  const starPos = new Float32Array(STARS * 3);
  const starCol = new Float32Array(STARS * 3);
  const tint = new Float32Array(STARS); // how much each star takes the accent color
  for (let i = 0; i < STARS; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 4 + Math.pow(Math.random(), 0.7) * 34;
    starPos[i * 3] = Math.cos(a) * r;
    starPos[i * 3 + 1] = Math.sin(a) * r * 0.75;
    starPos[i * 3 + 2] = -Math.random() * DEPTH + 14;
    tint[i] = Math.random();
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
  const starMat = new THREE.PointsMaterial({
    size: 0.16,
    map: sprite,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  // --- Core artifact -----------------------------------------------------
  const core = new THREE.Group();
  scene.add(core);

  const shell = new THREE.Mesh(
    new THREE.IcosahedronGeometry(2.3, 1),
    new THREE.MeshBasicMaterial({ color: accent, wireframe: true, transparent: true, opacity: 0.55 })
  );
  const heart = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.15, 0),
    new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.35 })
  );
  const heartEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(heart.geometry),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 })
  );
  heart.add(heartEdges);
  const ringA = new THREE.Mesh(
    new THREE.TorusGeometry(3.4, 0.015, 8, 160),
    new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.8 })
  );
  const ringB = ringA.clone();
  ringB.material = ringA.material.clone();
  ringB.scale.setScalar(1.25);
  ringA.rotation.x = Math.PI / 2.4;
  ringB.rotation.y = Math.PI / 3;
  core.add(shell, heart, ringA, ringB);

  // Six orbiting "dots" — a nod to a braille cell.
  const orbiters = new THREE.Group();
  const orbGeo = new THREE.SphereGeometry(0.12, 16, 16);
  const orbMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(orbGeo, orbMat);
    m.userData.phase = (i / 6) * Math.PI * 2;
    orbiters.add(m);
  }
  core.add(orbiters);

  // --- Synth grid floor ----------------------------------------------------
  const GRID_CELL = 2;
  const grid = new THREE.GridHelper(240, 120, 0x3a3f66, 0x3a3f66);
  grid.material.transparent = true;
  grid.material.opacity = 0.32;
  grid.material.depthWrite = false;
  grid.position.y = -7;
  scene.add(grid);

  // --- Post processing -----------------------------------------------------
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.75, 0.45, 0.22);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // --- State ---------------------------------------------------------------
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  let pulseLevel = 0;
  let warpLevel = 0;
  const focusTargets = {
    home: { pos: new THREE.Vector3(0, 2.4, -3), scale: 1.05 },
    module: { pos: new THREE.Vector3(13, 4.5, -18), scale: 0.9 },
  };
  let focus = focusTargets.home;

  function resize() {
    const w = innerWidth;
    const h = innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  addEventListener('resize', resize);

  const onMove = (e) => {
    mouse.tx = (e.clientX / innerWidth) * 2 - 1;
    mouse.ty = (e.clientY / innerHeight) * 2 - 1;
  };
  addEventListener('pointermove', onMove);

  const white = new THREE.Color(0xffffff);
  const tmp = new THREE.Color();
  function recolorStars() {
    for (let i = 0; i < STARS; i++) {
      tmp.copy(white).lerp(accent, tint[i] * 0.85);
      const fade = 0.35 + tint[i] * 0.65;
      starCol[i * 3] = tmp.r * fade;
      starCol[i * 3 + 1] = tmp.g * fade;
      starCol[i * 3 + 2] = tmp.b * fade;
    }
    starGeo.attributes.color.needsUpdate = true;
  }
  recolorStars();

  let last = performance.now();
  let raf = 0;
  let elapsed = 0;

  function frame() {
    raf = requestAnimationFrame(frame);
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    elapsed += dt;
    const motion = reducedMotion ? 0.2 : 1;

    // Accent color drift
    if (!accent.equals(accentTarget)) {
      accent.lerp(accentTarget, 1 - Math.pow(0.02, dt));
      if (Math.abs(accent.r - accentTarget.r) + Math.abs(accent.g - accentTarget.g) + Math.abs(accent.b - accentTarget.b) < 0.002) {
        accent.copy(accentTarget);
      }
      shell.material.color.copy(accent);
      heart.material.color.copy(accent);
      ringA.material.color.copy(accent);
      ringB.material.color.copy(accent).lerp(white, 0.4);
      grid.material.color.copy(accent).lerp(white, 0.35);
      recolorStars();
    }

    pulseLevel *= Math.pow(0.04, dt);
    warpLevel *= Math.pow(0.12, dt);

    // Stars rush toward the camera; faster during a warp.
    const speed = (2.2 + warpLevel * 90) * motion * dt;
    for (let i = 0; i < STARS; i++) {
      const zi = i * 3 + 2;
      starPos[zi] += speed;
      if (starPos[zi] > 14) starPos[zi] -= DEPTH;
    }
    starGeo.attributes.position.needsUpdate = true;
    starMat.size = 0.16 + warpLevel * 0.25;

    // Grid scrolls to fake forward motion.
    grid.position.z = (grid.position.z + speed) % GRID_CELL;

    // Core
    core.position.lerp(focus.pos, 1 - Math.pow(0.08, dt));
    const s = THREE.MathUtils.lerp(core.scale.x, focus.scale * (1 + pulseLevel * 0.3), 1 - Math.pow(0.02, dt));
    core.scale.setScalar(s);
    shell.rotation.x += dt * 0.12 * motion;
    shell.rotation.y += dt * (0.18 + warpLevel * 3) * motion;
    heart.rotation.x -= dt * 0.4 * motion;
    heart.rotation.z += dt * 0.25 * motion;
    ringA.rotation.z += dt * 0.3 * motion;
    ringB.rotation.x += dt * 0.22 * motion;
    orbiters.children.forEach((m, i) => {
      const a = elapsed * 0.7 * motion + m.userData.phase;
      const tilt = i % 2 ? 0.6 : -0.6;
      m.position.set(Math.cos(a) * 3.9, Math.sin(a) * 3.9 * tilt, Math.sin(a) * 3.9 * (1 - Math.abs(tilt)));
    });

    // Camera parallax
    mouse.x += (mouse.tx - mouse.x) * (1 - Math.pow(0.05, dt));
    mouse.y += (mouse.ty - mouse.y) * (1 - Math.pow(0.05, dt));
    camera.position.x = mouse.x * 1.6;
    camera.position.y = -mouse.y * 1.0;
    camera.position.z = 12 - warpLevel * 3;
    camera.fov = 60 + warpLevel * 25;
    camera.updateProjectionMatrix();
    camera.lookAt(0, 0, -4);

    bloom.strength = 0.75 + pulseLevel * 0.9 + warpLevel * 0.6;
    composer.render();
  }

  function onVisibility() {
    if (document.hidden) {
      cancelAnimationFrame(raf);
    } else {
      last = performance.now();
      frame();
    }
  }
  document.addEventListener('visibilitychange', onVisibility);
  frame();

  return {
    /** Smoothly shift the scene's accent color (any CSS hex color). */
    setAccent(hex) {
      try {
        accentTarget.set(hex);
      } catch {
        /* ignore bad colors */
      }
    },
    /** A quick energy pulse — call it when something happens. 0..1+ */
    pulse(strength = 1) {
      pulseLevel = Math.min(pulseLevel + strength, 2.5);
    },
    /** Hyperspace jump, used for page transitions. */
    warp(strength = 1) {
      warpLevel = Math.min(warpLevel + strength, 1.5);
    },
    /** 'home' centers the artifact, 'module' tucks it into the background. */
    setFocus(mode) {
      focus = focusTargets[mode] || focusTargets.home;
    },
    destroy() {
      cancelAnimationFrame(raf);
      removeEventListener('resize', resize);
      removeEventListener('pointermove', onMove);
      document.removeEventListener('visibilitychange', onVisibility);
      renderer.dispose();
    },
  };
}
