/**
 * ============================================================================
 *  TAXNEST COSMIC INTRO
 *  Cinematic WebGL opening animation: starfield → gravity pull → black hole
 *  → energy flash → sparrow reveal → flight into navbar logo → site reveal.
 * ============================================================================
 *  FILE: taxnest-cosmic-intro.js  (ES module — do not rename import map paths)
 *
 *  THIS FILE IS FULLY SELF-CONTAINED:
 *   - injects its own <style> block
 *   - injects its own DOM (canvas + flash + bird + skip button)
 *   - builds the Three.js scene, shaders, timeline and DOM bird-flight
 *   - cleans up (dispose geometries/materials/renderer) when done
 *
 *  See TAXNEST_INTRO_INTEGRATION.md (chat message) for the 3 edits needed
 *  in index.html. Nothing in index.html needs to be rewritten wholesale.
 * ============================================================================
 */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { EffectComposer } from 'https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass }     from 'https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js';

/* ────────────────────────────────────────────────────────────────────────
   1. CONFIGURATION — tune everything from here, nothing else
   ──────────────────────────────────────────────────────────────────────── */
const TAXNEST_INTRO_CONFIG = {
  logoSrc: 'taxnest-logo.png',        // same asset already used in navbar
  navLogoSelector: '.nav-logo-img',   // existing navbar logo element
  revealTargetSelectors: ['.navbar', '.hero'], // faded in on complete (best-effort)
  sessionOnce: true,                  // only play once per browser tab session
  storageKey: 'taxnest-intro-played',
  allowSkip: true,
  skipAppearsAfterMs: 1500,

  // Phase timings in ms — mirrors the story brief (0–2s ambience … 11s reveal)
  timings: {
    ambient: 2000,      // 0.0 – 2.0s : twinkling starfield, no pull
    gravity: 3000,      // 2.0 – 5.0s : gravity pull ramps in
    accretion: 2000,    // 5.0 – 7.0s : full accretion disk intensity
    freeze: 300,        // 7.0 – 7.3s : brief silent freeze
    flash: 350,         // 7.3 – 7.65s : white/gold burst
    birdReveal: 700,     // logo/bird fades in from the flash
    flight: 1600,       // bird travels to navbar logo
    merge: 500,         // final scale/opacity match + site reveal
  },

  particleCounts: { desktop: 5200, laptop: 3200, mobile: 1400 },
  bloomStrength: { desktop: 1.15, mobile: 0.75 },
  dprCap: { desktop: 2, mobile: 1.5 },
};

/* ────────────────────────────────────────────────────────────────────────
   2. DEVICE TIER
   ──────────────────────────────────────────────────────────────────────── */
function getDeviceTier() {
  const w = window.innerWidth;
  const cores = navigator.hardwareConcurrency || 4;
  if (w < 768 || cores <= 4) return 'mobile';
  if (w < 1280) return 'laptop';
  return 'desktop';
}

const prefersReducedMotion = window.matchMedia
  ? window.matchMedia('(prefers-reduce-motion: reduce), (prefers-reduced-motion: reduce)').matches
  : false;

/* ────────────────────────────────────────────────────────────────────────
   3. STYLES (scoped, injected once)
   ──────────────────────────────────────────────────────────────────────── */
function injectStyles() {
  if (document.getElementById('taxnest-intro-styles')) return;
  const style = document.createElement('style');
  style.id = 'taxnest-intro-styles';
  style.textContent = `
    #taxnest-cosmic-intro {
      position: fixed; inset: 0; z-index: 99999;
      background: #000; overflow: hidden;
      opacity: 1; transition: opacity 700ms ease;
    }
    #taxnest-cosmic-intro.tn-hidden { opacity: 0; pointer-events: none; }
    #taxnest-cosmic-intro canvas.tn-scene { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }

    .tn-flash {
      position: absolute; inset: 0; pointer-events: none;
      background: radial-gradient(circle at 50% 50%, #fff 0%, #ffe9b0 28%, #ffcf6e 46%, rgba(255,180,40,0) 72%);
      opacity: 0; will-change: opacity, transform;
      transform: scale(0.85);
    }
    .tn-godrays {
      position: absolute; inset: -20%; pointer-events: none;
      background: conic-gradient(from 0deg,
        rgba(255,240,200,0.0) 0deg, rgba(255,235,180,0.35) 8deg, rgba(255,240,200,0.0) 16deg,
        rgba(255,235,180,0.0) 40deg, rgba(255,225,150,0.30) 48deg, rgba(255,235,180,0.0) 56deg,
        rgba(255,235,180,0.0) 90deg, rgba(255,225,150,0.28) 98deg, rgba(255,235,180,0.0) 106deg,
        rgba(255,235,180,0.0) 150deg, rgba(255,225,150,0.30) 158deg, rgba(255,235,180,0.0) 166deg,
        rgba(255,235,180,0.0) 200deg, rgba(255,225,150,0.28) 208deg, rgba(255,235,180,0.0) 216deg,
        rgba(255,235,180,0.0) 260deg, rgba(255,225,150,0.30) 268deg, rgba(255,235,180,0.0) 276deg,
        rgba(255,235,180,0.0) 320deg, rgba(255,225,150,0.28) 328deg, rgba(255,235,180,0.0) 336deg);
      opacity: 0; mix-blend-mode: screen; will-change: opacity, transform;
      animation: tn-godray-spin 14s linear infinite;
    }
    @keyframes tn-godray-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

    .tn-bird {
      position: absolute; top: 50%; left: 50%;
      width: 110px; height: 110px; border-radius: 50%;
      transform: translate(-50%, -50%) scale(0.2);
      opacity: 0; pointer-events: none; object-fit: cover;
      filter: drop-shadow(0 0 24px rgba(255,210,120,0.55));
      will-change: transform, opacity, filter;
    }

    .tn-skip {
      position: absolute; right: 22px; bottom: 22px;
      padding: 8px 16px; border-radius: 999px;
      background: rgba(255,255,255,0.08); color: #e8e8ee;
      border: 1px solid rgba(255,255,255,0.18);
      font: 500 13px/1 'DM Sans', system-ui, sans-serif;
      letter-spacing: 0.02em; cursor: pointer;
      opacity: 0; transition: opacity 400ms ease, background 200ms ease;
      backdrop-filter: blur(6px);
    }
    .tn-skip.tn-visible { opacity: 1; }
    .tn-skip:hover { background: rgba(255,255,255,0.16); }

    /* Hides main content until the intro finishes, avoids flash-of-content */
    html.tn-intro-lock .navbar,
    html.tn-intro-lock .hero {
      opacity: 0 !important;
      transition: opacity 900ms ease;
    }
    html.tn-intro-lock { overflow: hidden; }

    @media (prefers-reduced-motion: reduce) {
      .tn-godrays { animation: none; }
    }
  `;
  document.head.appendChild(style);
}

/* ────────────────────────────────────────────────────────────────────────
   4. SHADERS — starfield / accretion-disk particle system
   ──────────────────────────────────────────────────────────────────────── */
const VERTEX_SHADER = `
  attribute float aSeed;
  attribute float aOrbitRadius;
  attribute float aOrbitSpeed;
  attribute float aSize;
  attribute vec3  aColor;

  uniform float uTime;
  uniform float uPull;      // 0..1  ambient -> full accretion disk
  uniform float uCollapse;  // 0..1  post-flash outward scatter
  uniform float uPixelRatio;

  varying vec3  vColor;
  varying float vAlpha;

  void main() {
    vec3 initial = position;
    float baseR   = length(initial.xz) + 0.0001;
    float angle   = aSeed * 6.2831853 + uTime * aOrbitSpeed * (1.0 + uPull * 2.2);
    float diskR   = mix(baseR, aOrbitRadius, uPull);

    vec3 diskPos = vec3(cos(angle) * diskR, initial.y * (1.0 - uPull * 0.88), sin(angle) * diskR);
    vec3 pos     = mix(initial, diskPos, uPull);

    // Outward scatter burst after the flash (energy collapse -> release)
    pos *= (1.0 + uCollapse * 5.0);

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    float twinkle = 0.55 + 0.45 * sin(uTime * 2.1 + aSeed * 60.0);

    gl_PointSize = aSize * uPixelRatio * (280.0 / -mvPosition.z) * (1.0 + uPull * 0.6);
    gl_Position  = projectionMatrix * mvPosition;

    vAlpha = twinkle * (1.0 - uCollapse);
    vColor = aColor;
  }
`;

const FRAGMENT_SHADER = `
  varying vec3  vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    float alpha = smoothstep(0.5, 0.0, d) * vAlpha;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(vColor, alpha);
  }
`;

/* ────────────────────────────────────────────────────────────────────────
   5. PARTICLE FIELD BUILDER
   ──────────────────────────────────────────────────────────────────────── */
const PALETTE = [
  new THREE.Color('#bfe3ff'), // soft blue
  new THREE.Color('#ffffff'), // white
  new THREE.Color('#c9a8ff'), // purple
  new THREE.Color('#8beaff'), // cyan
  new THREE.Color('#ffd98a'), // tiny gold highlight (rare)
];

function buildParticleField(count) {
  const positions   = new Float32Array(count * 3);
  const orbitRadius = new Float32Array(count);
  const orbitSpeed  = new Float32Array(count);
  const seed        = new Float32Array(count);
  const size        = new Float32Array(count);
  const colors      = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    // Random position on a large sphere shell (ambient starfield)
    const radius = 18 + Math.random() * 22;
    const theta  = Math.random() * Math.PI * 2;
    const phi    = Math.acos(2 * Math.random() - 1);
    positions[i * 3 + 0] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta) * 0.6;
    positions[i * 3 + 2] = radius * Math.cos(phi);

    orbitRadius[i] = 0.8 + Math.random() * 5.2;
    orbitSpeed[i]  = (Math.random() < 0.5 ? -1 : 1) * (0.15 + Math.random() * 0.6);
    seed[i]        = Math.random();
    size[i]        = 1.0 + Math.random() * 2.4;

    const colorRoll = Math.random();
    const c = colorRoll > 0.94 ? PALETTE[4] : PALETTE[Math.floor(Math.random() * 4)];
    colors[i * 3 + 0] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aOrbitRadius', new THREE.BufferAttribute(orbitRadius, 1));
  geometry.setAttribute('aOrbitSpeed', new THREE.BufferAttribute(orbitSpeed, 1));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    uniforms: {
      uTime: { value: 0 },
      uPull: { value: 0 },
      uCollapse: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  return new THREE.Points(geometry, material);
}

/* ────────────────────────────────────────────────────────────────────────
   6. MAIN CONTROLLER
   ──────────────────────────────────────────────────────────────────────── */
export function playTaxNestCosmicIntro(userConfig = {}) {
  const CFG = { ...TAXNEST_INTRO_CONFIG, ...userConfig };

  // Skip entirely if reduced motion, or already played this session
  const alreadyPlayed = CFG.sessionOnce && sessionStorage.getItem(CFG.storageKey) === '1';
  if (alreadyPlayed) { completeInstantly(CFG); return; }
  if (prefersReducedMotion) { completeInstantly(CFG); return; }

  injectStyles();
  document.documentElement.classList.add('tn-intro-lock');

  const tier = getDeviceTier();
  const root = document.createElement('div');
  root.id = 'taxnest-cosmic-intro';
  document.body.appendChild(root);

  const canvas = document.createElement('canvas');
  canvas.className = 'tn-scene';
  root.appendChild(canvas);

  const godrays = document.createElement('div');
  godrays.className = 'tn-godrays';
  root.appendChild(godrays);

  const flash = document.createElement('div');
  flash.className = 'tn-flash';
  root.appendChild(flash);

  const bird = document.createElement('img');
  bird.className = 'tn-bird';
  bird.src = CFG.logoSrc;
  bird.alt = '';
  root.appendChild(bird);

  let skipBtn = null;
  if (CFG.allowSkip) {
    skipBtn = document.createElement('button');
    skipBtn.className = 'tn-skip';
    skipBtn.type = 'button';
    skipBtn.textContent = 'Skip intro';
    skipBtn.addEventListener('click', () => finish());
    root.appendChild(skipBtn);
    setTimeout(() => skipBtn.classList.add('tn-visible'), CFG.skipAppearsAfterMs);
  }

  /* ---- Three.js scene ---- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CFG.dprCap[tier] || CFG.dprCap.mobile));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 0, 16);

  const particles = buildParticleField(CFG.particleCounts[tier] || CFG.particleCounts.mobile);
  scene.add(particles);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    CFG.bloomStrength[tier === 'desktop' ? 'desktop' : 'mobile'],
    0.85, 0.15
  );
  composer.addPass(bloomPass);

  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
  }
  window.addEventListener('resize', onResize);

  /* ---- Timeline math ---- */
  const T = CFG.timings;
  const tAmbientEnd   = T.ambient;
  const tGravityEnd   = tAmbientEnd + T.gravity;
  const tAccretionEnd = tGravityEnd + T.accretion;
  const tFreezeEnd    = tAccretionEnd + T.freeze;
  const tFlashEnd     = tFreezeEnd + T.flash;
  const tBirdEnd      = tFlashEnd + T.birdReveal;
  const tFlightEnd    = tBirdEnd + T.flight;
  const tMergeEnd     = tFlightEnd + T.merge;

  const clock = new THREE.Clock();
  let startTime = null;
  let rafId = null;
  let finished = false;

  function easeInOutCubic(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function clamp01(x) { return Math.max(0, Math.min(1, x)); }

  function frame(now) {
    if (finished) return;
    if (startTime === null) startTime = now;
    const elapsed = now - startTime;
    const dt = clock.getDelta();

    // Subtle cinematic camera breathing (dolly + parallax)
    camera.position.x = Math.sin(elapsed * 0.00035) * 0.4;
    camera.position.y = Math.cos(elapsed * 0.00028) * 0.25;
    camera.position.z = 16 + Math.sin(elapsed * 0.0002) * 0.6;
    camera.lookAt(0, 0, 0);

    let pull = 0;
    let collapse = 0;

    if (elapsed < tAmbientEnd) {
      pull = 0;
    } else if (elapsed < tGravityEnd) {
      pull = easeInOutCubic(clamp01((elapsed - tAmbientEnd) / T.gravity)) * 0.75;
    } else if (elapsed < tAccretionEnd) {
      const local = clamp01((elapsed - tGravityEnd) / T.accretion);
      pull = 0.75 + easeInOutCubic(local) * 0.25;
    } else if (elapsed < tFreezeEnd) {
      pull = 1.0; // frozen, silent beat
    } else if (elapsed < tFlashEnd) {
      pull = 1.0;
      collapse = easeInOutCubic(clamp01((elapsed - tFreezeEnd) / T.flash));
    } else {
      pull = 1.0;
      collapse = 1.0;
    }

    particles.material.uniforms.uTime.value = elapsed * 0.001;
    particles.material.uniforms.uPull.value = pull;
    particles.material.uniforms.uCollapse.value = collapse;

    // Flash + godrays intensity
    if (elapsed >= tFreezeEnd && elapsed < tFlashEnd + 250) {
      const local = clamp01((elapsed - tFreezeEnd) / T.flash);
      const rampDown = elapsed > tFlashEnd ? clamp01(1 - (elapsed - tFlashEnd) / 300) : 1;
      flash.style.opacity = String(Math.min(local, 1) * rampDown);
      flash.style.transform = `scale(${0.85 + local * 0.5})`;
      godrays.style.opacity = String(local * 0.9 * rampDown);
    } else if (elapsed >= tFlashEnd + 250) {
      flash.style.opacity = '0';
      godrays.style.opacity = '0';
    }

    // Bird reveal + flight
    if (elapsed >= tFlashEnd && elapsed < tBirdEnd) {
      const local = easeInOutCubic(clamp01((elapsed - tFlashEnd) / T.birdReveal));
      bird.style.opacity = String(local);
      bird.style.transform = `translate(-50%, -50%) scale(${0.2 + local * 0.8})`;
    } else if (elapsed >= tBirdEnd && elapsed < tFlightEnd) {
      const local = clamp01((elapsed - tBirdEnd) / T.flight);
      animateBirdFlight(local);
    } else if (elapsed >= tFlightEnd && elapsed < tMergeEnd) {
      const local = clamp01((elapsed - tFlightEnd) / T.merge);
      finalMerge(local);
    } else if (elapsed >= tMergeEnd) {
      finish();
      return;
    }

    composer.render();
    rafId = requestAnimationFrame(frame);
  }

  // Bezier flight path from screen center to the real navbar logo position
  function getNavLogoRect() {
    const el = document.querySelector(CFG.navLogoSelector);
    if (el) return el.getBoundingClientRect();
    return { left: 40, top: 30, width: 42, height: 42 };
  }

  function animateBirdFlight(t) {
    const start = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const target = getNavLogoRect();
    const endX = target.left + target.width / 2;
    const endY = target.top + target.height / 2;

    // Control points for a natural banking swoop rather than a straight line
    const c1 = { x: start.x + (endX - start.x) * 0.25, y: start.y - 120 };
    const c2 = { x: start.x + (endX - start.x) * 0.7, y: endY + 160 };

    const x = bez(start.x, c1.x, c2.x, endX, t);
    const y = bez(start.y, c1.y, c2.y, endY, t);

    const scale = 1.0 - t * (1.0 - Math.max(target.width / 110, 0.32));
    const flap = Math.sin(t * Math.PI * 10) * 6 * (1 - t); // wing-flap wobble, settles near landing
    const bank = Math.sin(t * Math.PI * 4) * 8 * (1 - t);
    const blur = (1 - t) * 3;

    bird.style.left = `${x}px`;
    bird.style.top = `${y}px`;
    bird.style.transform = `translate(-50%, -50%) scale(${scale}) rotate(${bank}deg) skewX(${flap * 0.4}deg)`;
    bird.style.filter = `drop-shadow(0 0 ${18 * (1 - t) + 4}px rgba(255,210,120,${0.55 * (1 - t)})) blur(${blur}px)`;
  }

  function finalMerge(t) {
    const target = getNavLogoRect();
    const endX = target.left + target.width / 2;
    const endY = target.top + target.height / 2;
    const scale = Math.max(target.width / 110, 0.32);
    bird.style.left = `${endX}px`;
    bird.style.top = `${endY}px`;
    bird.style.transform = `translate(-50%, -50%) scale(${scale})`;
    bird.style.opacity = String(1 - t * 0.6);
    bird.style.filter = 'none';

    // Begin revealing the real page underneath as the bird settles
    document.documentElement.style.setProperty('--tn-intro-progress', String(t));
    if (t > 0.4) document.documentElement.classList.remove('tn-intro-lock');
  }

  function bez(p0, p1, p2, p3, t) {
    const mt = 1 - t;
    return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
  }

  function finish() {
    if (finished) return;
    finished = true;
    if (rafId) cancelAnimationFrame(rafId);
    window.removeEventListener('resize', onResize);
    document.documentElement.classList.remove('tn-intro-lock');

    root.classList.add('tn-hidden');
    setTimeout(() => {
      root.remove();
      particles.geometry.dispose();
      particles.material.dispose();
      renderer.dispose();
      if (CFG.sessionOnce) sessionStorage.setItem(CFG.storageKey, '1');
      window.dispatchEvent(new CustomEvent('taxnest:introComplete'));
    }, 720);
  }

  rafId = requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && rafId) { cancelAnimationFrame(rafId); rafId = null; }
    else if (!document.hidden && !finished && rafId === null) { rafId = requestAnimationFrame(frame); }
  });
}

function completeInstantly(CFG) {
  document.documentElement.classList.remove('tn-intro-lock');
  window.dispatchEvent(new CustomEvent('taxnest:introComplete'));
}

// Auto-run on load unless the host page opts to call it manually
if (!window.TAXNEST_INTRO_MANUAL_START) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => playTaxNestCosmicIntro());
  } else {
    playTaxNestCosmicIntro();
  }
}
