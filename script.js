import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

let scene, camera, renderer, composer, controls;
let flowerGroup;
let petals = [];
let stemMesh;
let particles, fireflies, fallingPetalsMesh;
let fallingPetalsData = [];
let isBlooming = false;
let bloomStart = 0;
let soundEnabled = true; // Default sound enabled
let audioStarted = false;

const clock = new THREE.Clock();
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const ui = document.getElementById("ui");
const message = document.getElementById("message");
const replayBtn = document.getElementById("replay-btn");
const statusText = document.getElementById("status-text");
const soundBtn = document.getElementById("sound-btn");
const bgMusic = document.getElementById("bg-music");

init();
animate();

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c0108);

  const isMobile = window.innerWidth < 600;
  camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, isMobile ? 3.2 : 2.8, isMobile ? 13.5 : 10.5);

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI / 2 + 0.1;
  controls.minDistance = 5;
  controls.maxDistance = 18;
  controls.target.set(0, -0.55, 0);

  const renderPass = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.05,
    0.55,
    0.55
  );

  composer = new EffectComposer(renderer);
  composer.addPass(renderPass);
  composer.addPass(bloomPass);

  scene.add(new THREE.AmbientLight(0xffc8dc, 0.42));

  const keyLight = new THREE.DirectionalLight(0xffeef5, 1.7);
  keyLight.position.set(2, 8, 7);
  scene.add(keyLight);

  const rimLight = new THREE.PointLight(0xff185c, 2.2, 18);
  rimLight.position.set(-4, 1, 3);
  scene.add(rimLight);

  flowerGroup = new THREE.Group();
  scene.add(flowerGroup);

  createFlower();
  createPetalDust();
  createFireflies();
  createFallingPetalsSystem();

  window.addEventListener("resize", onWindowResize);
  window.addEventListener("pointermove", onPointerMove, { passive: true });

  // Autoplay Trigger on First Interaction
  const handleFirstInteraction = () => {
    if (!audioStarted && soundEnabled) {
      bgMusic.play().then(() => {
        audioStarted = true;
        soundBtn.textContent = "♫";
        soundBtn.setAttribute("aria-pressed", "true");
      }).catch(err => console.log("Autoplay blocked:", err));
    }
  };

  window.addEventListener("click", handleFirstInteraction, { once: true });
  window.addEventListener("touchstart", handleFirstInteraction, { once: true });

  document.getElementById("bloom-btn").addEventListener("click", startBloom);
  replayBtn.addEventListener("click", resetBloom);
  soundBtn.addEventListener("click", toggleSound);

  statusText.textContent = "Waiting to bloom";
}

function createPetalGeometry(len, wid) {
  const geo = new THREE.PlaneGeometry(wid, len, 28, 28);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i);
    const t = (v.y + len / 2) / len;
    v.x *= 0.22 + Math.sin(t * Math.PI * 0.88) * 0.78;
    if (t > 0.80) v.x *= Math.max(0, (1 - t) * 5.2);
    v.z = Math.sin(t * Math.PI) * (wid * 0.42) - Math.pow(t, 2.5) * 0.30 + (v.x * v.x) * 0.23;
    pos.setXYZ(i, v.x, v.y + len / 2, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function createFlower() {
  const layers = [
    { count: 14, len: 4.35, wid: 2.18, color: 0x650016, rot: 1.38, delay: 0.05 },
    { count: 12, len: 3.85, wid: 1.95, color: 0x920827, rot: 1.12, delay: 0.28 },
    { count: 10, len: 3.25, wid: 1.68, color: 0xc30f3f, rot: 0.84, delay: 0.56 },
    { count: 8, len: 2.65, wid: 1.38, color: 0xf2386c, rot: 0.58, delay: 0.84 },
    { count: 6, len: 1.95, wid: 1.06, color: 0xff8aad, rot: 0.34, delay: 1.12 }
  ];

  layers.forEach((layer, layerIndex) => {
    const geo = createPetalGeometry(layer.len, layer.wid);
    const mat = new THREE.MeshStandardMaterial({
      color: layer.color,
      roughness: 0.28,
      side: THREE.DoubleSide
    });

    for (let i = 0; i < layer.count; i++) {
      const pivot = new THREE.Group();
      pivot.rotation.y = (i / layer.count) * Math.PI * 2 + layerIndex * 0.37;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.scale.setScalar(0.001);
      pivot.add(mesh);
      flowerGroup.add(pivot);

      petals.push({
        mesh,
        pivot,
        targetRot: layer.rot,
        delay: layer.delay + i * 0.045,
        sway: Math.random() * Math.PI * 2
      });
    }
  });

  const stemCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -4.15, 0),
    new THREE.Vector3(-0.08, -2.2, 0.02),
    new THREE.Vector3(0, 0, 0)
  ]);

  stemMesh = new THREE.Mesh(
    new THREE.TubeGeometry(stemCurve, 40, 0.065, 10, false),
    new THREE.MeshStandardMaterial({
      color: 0x2e8b57,
      roughness: 0.4,
      metalness: 0.1,
      emissive: 0x0c3b18,
      emissiveIntensity: 0.4
    })
  );
  stemMesh.scale.y = 0.001;
  flowerGroup.add(stemMesh);
}

function createPetalDust() {
  const count = 260;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 12;
    pos[i * 3 + 1] = -1.8 + Math.random() * 7;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 8;
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  particles = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ color: 0xff91ad, size: 0.045, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending })
  );
  scene.add(particles);
}

function createFireflies() {
  const count = 90;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const phase = [];
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 17;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 10;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 8;
    phase.push(Math.random() * Math.PI * 2);
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  fireflies = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ color: 0xffd7e2, size: 0.035, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending })
  );
  fireflies.userData.phase = phase;
  scene.add(fireflies);
}

function createFallingPetalsSystem() {
  const count = 45;
  const group = new THREE.Group();
  const geo = createPetalGeometry(0.35, 0.18);
  const mat = new THREE.MeshStandardMaterial({ color: 0xff4d78, side: THREE.DoubleSide, transparent: true, opacity: 0 });

  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(geo, mat);
    const pData = {
      x: (Math.random() - 0.5) * 14,
      y: 4 + Math.random() * 6,
      z: (Math.random() - 0.5) * 8,
      speedY: 0.015 + Math.random() * 0.02,
      swaySpeed: 1 + Math.random() * 2
    };
    mesh.position.set(pData.x, pData.y, pData.z);
    group.add(mesh);
    fallingPetalsData.push({ mesh, ...pData });
  }
  fallingPetalsMesh = group;
  scene.add(fallingPetalsMesh);
}

function startBloom() {
  if (isBlooming) return;

  if (soundEnabled && bgMusic.paused) {
    bgMusic.play().catch(() => { });
  }

  ui.classList.add("hide");
  message.classList.remove("show");
  replayBtn.classList.remove("show");

  isBlooming = true;
  bloomStart = clock.getElapsedTime();
  statusText.textContent = "Blooming";
}

function resetBloom() {
  isBlooming = false;
  bloomStart = 0;

  petals.forEach(p => {
    p.mesh.scale.setScalar(0.001);
    p.mesh.rotation.x = 0;
  });

  stemMesh.scale.y = 0.001;

  fallingPetalsData.forEach(p => {
    p.mesh.material.opacity = 0;
    p.mesh.position.y = p.y;
  });

  ui.classList.remove("hide");
  message.classList.remove("show");
  replayBtn.classList.remove("show");
  statusText.textContent = "Waiting to bloom";
}

function animate() {
  requestAnimationFrame(animate);

  const t = clock.getElapsedTime();
  controls.update();

  if (isBlooming) {
    const elapsed = t - bloomStart;
    stemMesh.scale.y = easeOutCubic(Math.min(elapsed / 1.7, 1));

    petals.forEach(p => {
      const local = elapsed - p.delay;
      if (local <= 0) return;
      const ease = easeOutBack(Math.min(local / 1.45, 1));
      p.mesh.scale.setScalar(Math.max(0.001, ease));
      p.mesh.rotation.x = ease * p.targetRot;
    });

    if (elapsed > 3.5) {
      fallingPetalsData.forEach(p => {
        p.mesh.material.opacity = Math.min(p.mesh.material.opacity + 0.01, 0.75);
        p.mesh.position.y -= p.speedY;
        p.mesh.position.x += Math.sin(t * p.swaySpeed) * 0.008;
        p.mesh.rotation.x += 0.01;
        p.mesh.rotation.y += 0.015;

        if (p.mesh.position.y < -4) {
          p.mesh.position.y = 6;
        }
      });
    }

    if (elapsed > 4.2 && !message.classList.contains("show")) {
      message.classList.add("show");
      replayBtn.classList.add("show");
      statusText.textContent = "In full bloom";
    }
  }

  flowerGroup.rotation.y += 0.0015;
  composer.render();
}

function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }
function easeOutBack(x) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

function onPointerMove(event) {
  const glow = document.getElementById("cursor-glow");
  glow.style.left = `${event.clientX}px`;
  glow.style.top = `${event.clientY}px`;
}

function onWindowResize() {
  const isMobile = window.innerWidth < 600;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.position.z = isMobile ? 13.5 : 10.5;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  soundBtn.setAttribute("aria-pressed", String(soundEnabled));
  soundBtn.textContent = soundEnabled ? "♫" : "♩";

  if (soundEnabled) {
    bgMusic.play().catch(() => { });
  } else {
    bgMusic.pause();
  }
}