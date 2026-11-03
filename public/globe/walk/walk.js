// The spherical structure, walked for real: physics (Rapier), a character controller with
// acceleration, sprint, crouch, jump, lean, ladders and head motion, and the boy's Mixamo animations.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import RAPIER from "./vendor/rapier.es.js";

const TOUCH = matchMedia("(pointer: coarse)").matches;
const LITE = TOUCH || /lite/.test(location.search);   // phones and weak machines: no shadows, no glow
if (TOUCH) document.documentElement.classList.add("touch");
const $ = (id) => document.getElementById(id);

/* ---------------- tuning ---------------- */
const P = {
  radius: 0.27, standHH: 0.48, crouchHH: 0.18,      // capsule: 1.5 m standing, 0.9 m crouched
  eyeStand: 1.40, eyeCrouch: 0.86,                   // eye height above the feet
  walk: 1.55, run: 4.2, crouch: 0.85, back: 0.75,    // m/s (backwards is a fraction of the speed)
  accel: 11, decel: 13, airAccel: 2.2,
  jump: 4.0, gravity: 9.81,
  climb: 1.1, lean: 0.38, leanRoll: 0.16,
  fov: 74, fovRun: 81
};
// Blender is Z-up, glTF / three is Y-up
const B = (a) => new THREE.Vector3(a[0], a[2], -a[1]);

/* ---------------- renderer, scene ---------------- */
const renderer = new THREE.WebGLRenderer({ antialias: !LITE, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, TOUCH ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.AgXToneMapping; renderer.toneMappingExposure = 1.35;
renderer.shadowMap.enabled = !LITE; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020304);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.08;
scene.add(new THREE.HemisphereLight(0x8fa6c4, 0x1a1410, 0.12));
const camera = new THREE.PerspectiveCamera(P.fov, innerWidth / innerHeight, 0.03, 200);
camera.rotation.order = "YXZ";
scene.add(camera);
const torch = new THREE.SpotLight(0xdfe8ff, 26, 26, 0.48, 0.65, 2);
torch.position.set(0.15, -0.12, 0); torch.target.position.set(0.05, -0.3, -3);
torch.castShadow = !LITE; torch.shadow.mapSize.set(1024, 1024); torch.shadow.bias = -0.0004;
camera.add(torch, torch.target);
let torchOn = true;

let composer = null;
if (!LITE) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.22, 0.25, 0.95));
  composer.addPass(new OutputPass());
}
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); if (composer) composer.setSize(innerWidth, innerHeight);
});

/* ---------------- loading ---------------- */
const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
const load = (u) => new Promise((ok, bad) => loader.load(u, ok, undefined, bad));
const [_, roomGltf, kidGltf, meta] = await Promise.all([
  RAPIER.init(), load("./assets/orion.glb"), load("./assets/kid.glb"), fetch("./assets/orion.json").then((r) => r.json())
]);

/* ---------------- the room ---------------- */
const room = roomGltf.scene;
room.traverse((o) => {
  if (!o.isMesh) return;
  const m = o.material;
  if (m && m.emissive && m.emissiveIntensity > 0 && m.emissive.getHex() !== 0) {
    m.emissiveIntensity *= 0.18;                           // a soft glow, like plain small bulbs
    m.toneMapped = true;
  } else {
    o.receiveShadow = true; o.castShadow = !LITE;
    if (m && m.map) { m.metalness = Math.min(m.metalness, 0.45); m.roughness = 1; }
  }
});
scene.add(room);
// the strongest lamps light the room
meta.lights.sort((a, b) => b.e - a.e).slice(0, LITE ? 4 : 8).forEach((l) => {
  const L = new THREE.PointLight(new THREE.Color(...l.c), l.e * 0.3, 12, 2);
  L.position.copy(B(l.p)); scene.add(L);
});
$("room").textContent = meta.nameHe;

/* ---------------- physics ---------------- */
const world = new RAPIER.World({ x: 0, y: -P.gravity, z: 0 });
room.updateMatrixWorld(true);
room.traverse((o) => {
  if (!o.isMesh) return;
  const g = o.geometry, pos = g.attributes.position;
  if (g.boundingSphere === null) g.computeBoundingSphere();
  if (g.boundingSphere.radius < 0.2) return;               // bulbs, handles: no need to collide
  const v = new Float32Array(pos.count * 3), t = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) { t.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); v.set([t.x, t.y, t.z], i * 3); }
  const idx = g.index ? new Uint32Array(g.index.array) : Uint32Array.from({ length: pos.count }, (_, i) => i);
  world.createCollider(RAPIER.ColliderDesc.trimesh(v, idx));
});
const spawn = B(meta.spawn);
const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased()
  .setTranslation(spawn.x, spawn.y + P.standHH + P.radius + 0.08, spawn.z));
const collider = world.createCollider(RAPIER.ColliderDesc.capsule(P.standHH, P.radius), body);
const ctrl = world.createCharacterController(0.015);
ctrl.enableAutostep(0.32, 0.18, false);
ctrl.enableSnapToGround(0.28);
ctrl.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(52));
ctrl.setMinSlopeSlideAngle(THREE.MathUtils.degToRad(58));
ctrl.setSlideEnabled(true);
const rayHit = (o, d, max) => {
  const h = world.castRay(new RAPIER.Ray(o, d), max, true, undefined, undefined, collider, body);
  return h ? (h.timeOfImpact ?? h.toi) : null;
};

/* ---------------- the boy ---------------- */
const kid = kidGltf.scene;
const box = new THREE.Box3().setFromObject(kid);
kid.scale.setScalar(1.5 / (box.max.y - box.min.y));
kid.traverse((o) => { if (o.isMesh) { o.castShadow = !LITE; o.frustumCulled = false; } });
scene.add(kid);
const mixer = new THREE.AnimationMixer(kid);
const clips = {};
for (const c of kidGltf.animations) {
  // keep the boy on his capsule: drop the hips' travel (root motion), keep the bounce
  for (const tr of c.tracks) {
    if (!/Hips\.position$/.test(tr.name)) continue;
    const v = tr.values, x0 = v[0], z0 = v[2];
    for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
  }
  clips[c.name] = mixer.clipAction(c);
}
const ONCE = ["jump", "jump_run", "land", "land_hard", "ladder_top", "stand_to_crouch", "crouch_to_stand", "door_in", "door_out", "opening"];
ONCE.forEach((n) => { if (clips[n]) { clips[n].setLoop(THREE.LoopOnce, 1); clips[n].clampWhenFinished = true; } });
let cur = null, oneShot = 0;
function play(name, fade = 0.22, scale = 1) {
  const a = clips[name]; if (!a) return;
  a.timeScale = scale;
  if (cur === a) return;
  a.reset().play();
  if (cur) cur.crossFadeTo(a, fade, false);
  cur = a;
}
function playOnce(name, hold = 0) { if (!clips[name]) return; cur = null; play(name, 0.12); oneShot = hold || clips[name].getClip().duration; }

/* ---------------- input ---------------- */
const keys = new Set();
let yaw = 0, pitch = -0.18, third = true, crouch = false, runToggle = false;
{ // face the star wall at the start
  const d = B(meta.lookAt).sub(spawn); yaw = Math.atan2(-d.x, -d.z);
}
addEventListener("keydown", (e) => {
  keys.add(e.code);
  if (e.code === "KeyC") crouch = !crouch;
  if (e.code === "KeyF") torchOn = !torchOn;
  if (e.code === "KeyV") third = !third;
  if (e.code === "Space") e.preventDefault();
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => keys.clear());
const canvas = renderer.domElement;
addEventListener("mousemove", (e) => {
  if (document.pointerLockElement !== canvas) return;
  yaw -= e.movementX * 0.0022; pitch -= e.movementY * 0.0022;
  pitch = Math.max(-1.45, Math.min(1.45, pitch));
});
canvas.addEventListener("click", () => { if (!TOUCH && started) canvas.requestPointerLock(); });

// touch: stick on the left, drag to look anywhere else, buttons
const stick = { x: 0, y: 0, id: null };
let lookId = null, lx = 0, ly = 0, touchJump = false;
if (TOUCH) {
  const st = $("stick"), kn = $("knob");
  st.addEventListener("touchstart", (e) => { stick.id = e.changedTouches[0].identifier; e.preventDefault(); }, { passive: false });
  addEventListener("touchmove", (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stick.id) {
        const r = st.getBoundingClientRect(); let dx = t.clientX - (r.left + 60), dy = t.clientY - (r.top + 60);
        const d = Math.hypot(dx, dy); if (d > 50) { dx *= 50 / d; dy *= 50 / d; }
        stick.x = dx / 50; stick.y = -dy / 50; kn.style.transform = `translate(${dx}px,${dy}px)`;
      } else if (t.identifier === lookId) {
        yaw -= (t.clientX - lx) * 0.005; pitch -= (t.clientY - ly) * 0.005; lx = t.clientX; ly = t.clientY;
        pitch = Math.max(-1.45, Math.min(1.45, pitch));
      }
    }
    e.preventDefault();
  }, { passive: false });
  addEventListener("touchstart", (e) => {
    for (const t of e.changedTouches) if (t.target === canvas && lookId === null) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; }
  });
  addEventListener("touchend", (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stick.id) { stick.id = null; stick.x = stick.y = 0; kn.style.transform = ""; }
      if (t.identifier === lookId) lookId = null;
    }
  });
  const tap = (id, fn) => $(id).addEventListener("touchstart", (e) => { e.preventDefault(); e.stopPropagation(); fn(); $(id).classList.toggle("on", !!fn.state?.()); }, { passive: false });
  tap("tJump", () => { touchJump = true; });
  const tc = () => { crouch = !crouch; }; tc.state = () => crouch; tap("tCrouch", tc);
  const tr = () => { runToggle = !runToggle; }; tr.state = () => runToggle; tap("tRun", tr);
  const tl = () => { torchOn = !torchOn; }; tl.state = () => torchOn; tap("tLight", tl);
  tap("tView", () => { third = !third; });
}

/* ---------------- sound: steps on steel, the hum of the motor ---------------- */
let AC = null, hum = null;
function audioStart() {
  if (AC) return;
  AC = new (window.AudioContext || window.webkitAudioContext)();
  const g = AC.createGain(); g.gain.value = 0.05; g.connect(AC.destination);
  [43, 86.3, 129].forEach((f, i) => { const o = AC.createOscillator(); o.frequency.value = f; const og = AC.createGain(); og.gain.value = [1, 0.35, 0.12][i]; o.connect(og).connect(g); o.start(); });
  hum = g;
}
function step(loud) {
  if (!AC) return;
  const t = AC.currentTime, n = AC.sampleRate * 0.12, buf = AC.createBuffer(1, n, AC.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
  const s = AC.createBufferSource(); s.buffer = buf;
  const bp = AC.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 900 + Math.random() * 700; bp.Q.value = 3.5;
  const g = AC.createGain(); g.gain.value = 0.25 * loud;
  const dl = AC.createDelay(); dl.delayTime.value = 0.09; const fb = AC.createGain(); fb.gain.value = 0.28;   // the hollow ring of the room
  s.connect(bp).connect(g).connect(AC.destination); g.connect(dl).connect(fb).connect(dl); fb.connect(AC.destination);
  s.start(t);
}

/* ---------------- start ---------------- */
let started = false;
$("go").disabled = false; $("go").textContent = TOUCH ? "להיכנס" : "להיכנס (לחיצה)";
$("go").onclick = () => {
  started = true; $("start").style.display = "none"; audioStart();
  if (!TOUCH) canvas.requestPointerLock();
};
document.addEventListener("pointerlockchange", () => {
  if (!TOUCH && started && document.pointerLockElement !== canvas) { /* paused: a click returns */ }
});
let hintT = 0;
function hint(text, secs = 2.2) { $("hint").textContent = text; $("hint").classList.add("on"); hintT = secs; }

/* ---------------- the loop ---------------- */
const vel = new THREE.Vector3();            // horizontal velocity
let vy = 0, grounded = false, airTime = 0, fallSpeed = 0;
let hh = P.standHH, eyeH = P.eyeStand, bobPhase = 0, bobAmp = 0, dip = 0, dipV = 0, leanCur = 0, fovCur = P.fov;
let ladder = null, lastStep = 0;
const clock = new THREE.Clock();
const tmp = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3();

function nearLadder(pos) {
  for (const L of meta.ladders) {
    const c = B(L.x), n = B(L.inward);
    const dx = pos.x - c.x, dz = pos.z - c.z;
    if (Math.hypot(dx, dz) < 0.75 && pos.y - (hh + P.radius) < B(L.door_c).y + 0.3) return { c, n, top: B(L.door_c).y - 0.85, L };
  }
  return null;
}

function frame() {
  const dt = Math.min(clock.getDelta(), 1 / 30);
  if (started) update(dt);
  mixer.update(dt);
  (composer || renderer).render(scene, camera);
  requestAnimationFrame(frame);
}

function update(dt) {
  // ---- wanted direction, in the yaw plane ----
  let ix = 0, iz = 0;
  if (keys.has("KeyW") || keys.has("ArrowUp")) iz += 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) iz -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) ix += 1;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) ix -= 1;
  if (TOUCH) { ix += stick.x; iz += stick.y; }
  const mag = Math.min(1, Math.hypot(ix, iz));
  const running = (keys.has("ShiftLeft") || keys.has("ShiftRight") || runToggle) && iz > 0.3 && !crouch;
  fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw)); right.set(Math.cos(yaw), 0, -Math.sin(yaw));
  const wish = new THREE.Vector3().addScaledVector(fwd, iz).addScaledVector(right, ix);
  if (wish.lengthSq() > 1) wish.normalize();
  let speed = crouch ? P.crouch : running ? P.run : P.walk;
  if (iz < -0.2) speed *= running ? 1 : P.back / 0.75 * 0.75;
  const target = wish.multiplyScalar(speed * (TOUCH ? mag : 1));

  const p = body.translation();
  const pos = new THREE.Vector3(p.x, p.y, p.z);

  // ---- ladders: walk into the pegs to climb ----
  const lad = nearLadder(pos);
  if (!ladder && lad && iz > 0.5 && fwd.dot(lad.n) < -0.4) { ladder = lad; vy = 0; vel.set(0, 0, 0); play("ladder", 0.2); hint("טיפוס ביתדות · W למעלה, S למטה, רווח לקפוץ"); }
  if (ladder) {
    const goal = ladder.c.clone().addScaledVector(ladder.n, 0.36);
    const climb = iz * P.climb;
    const move = new THREE.Vector3((goal.x - pos.x) * 8 * dt, climb * dt, (goal.z - pos.z) * 8 * dt);
    ctrl.computeColliderMovement(collider, move);
    const m = ctrl.computedMovement();
    body.setNextKinematicTranslation({ x: p.x + m.x, y: p.y + m.y, z: p.z + m.z });
    play("ladder", 0.15, climb >= 0 ? Math.max(0.15, Math.abs(climb) / P.climb) : -Math.max(0.15, Math.abs(climb) / P.climb));
    if (Math.abs(climb) < 0.05) clips.ladder.timeScale = 0;
    const feet = p.y - hh - P.radius;
    if (feet > ladder.top) { hint("כאן נמצאת הדלת. החדר שמאחוריה עוד נבנה."); }
    if (keys.has("Space") || touchJump || (iz < 0 && ctrl.computedGrounded())) {
      ladder = null; vy = keys.has("Space") || touchJump ? 2.5 : 0; vel.copy(fwd).multiplyScalar(-1.2); touchJump = false;
    }
    grounded = false; bobAmp *= 0.9;
  } else {
    // ---- walking ----
    const a = grounded ? (target.lengthSq() > 0.01 ? P.accel : P.decel) : P.airAccel;
    vel.x += (target.x - vel.x) * Math.min(1, a * dt);
    vel.z += (target.z - vel.z) * Math.min(1, a * dt);
    vy -= P.gravity * dt;
    if (grounded && (keys.has("Space") || touchJump) && !crouch) {
      vy = P.jump; grounded = false; playOnce(vel.length() > 3 ? "jump_run" : "jump_up", 0.35);
    }
    touchJump = false;
    // crouch: shrink the capsule from the top; stand only if there is room above
    const wantHH = crouch ? P.crouchHH : P.standHH;
    if (Math.abs(wantHH - hh) > 0.001) {
      if (wantHH > hh) {
        const up = rayHit({ x: p.x, y: p.y + hh + P.radius - 0.02, z: p.z }, { x: 0, y: 1, z: 0 }, (wantHH - hh) * 2 + 0.05);
        if (up !== null) { crouch = true; hint("אין מקום לעמוד כאן"); }
      }
      const nh = crouch ? P.crouchHH : P.standHH;
      if (nh !== hh) { const d = nh - hh; collider.setHalfHeight(nh); body.setTranslation({ x: p.x, y: p.y + d, z: p.z }, true); p.y += d; hh = nh; }
    }
    ctrl.computeColliderMovement(collider, { x: vel.x * dt, y: vy * dt, z: vel.z * dt });
    const m = ctrl.computedMovement();
    const was = grounded;
    grounded = ctrl.computedGrounded();
    body.setNextKinematicTranslation({ x: p.x + m.x, y: p.y + m.y, z: p.z + m.z });
    if (grounded) {
      if (!was && airTime > 0.25) {          // landing: the knees take it
        dipV -= Math.min(4, fallSpeed * 0.55);
        if (fallSpeed > 7) playOnce("land_hard", 0.9); else if (fallSpeed > 3.5) playOnce("land", 0.45);
        step(1.4);
      }
      vy = Math.max(vy, -1); airTime = 0; fallSpeed = 0;
    } else { airTime += dt; fallSpeed = Math.max(fallSpeed, -vy); }
    // hitting a ceiling
    if (vy > 0 && m.y < vy * dt * 0.5) vy = 0;
  }
  world.step();

  // ---- animation choice ----
  const sp = Math.hypot(vel.x, vel.z);
  const loc = new THREE.Vector3(vel.x, 0, vel.z);
  const lf = loc.dot(fwd), lr = loc.dot(right);
  if (oneShot > 0) oneShot -= dt;
  else if (!ladder) {
    if (!grounded && airTime > 0.35) play(vy < -1.5 ? "fall" : "fall", 0.3);
    else if (crouch) {
      if (sp < 0.15) play("crouch_idle");
      else if (Math.abs(lr) > Math.abs(lf)) play(lr > 0 ? "crouch_right" : "crouch_left", 0.25, sp / 0.9);
      else play("crouch_walk", 0.25, (lf >= 0 ? 1 : -1) * sp / 0.9);
    } else if (sp < 0.15) play("idle", 0.3);
    else {
      const fast = sp > 2.6, side = Math.abs(lr) > Math.abs(lf) * 1.2;
      if (side) play(fast ? (lr > 0 ? "run_right" : "run_left") : (lr > 0 ? "walk_right" : "walk_left"), 0.25, sp / (fast ? 4 : 1.5));
      else if (lf < 0) play(fast ? "run_back" : "walk_back", 0.25, sp / (fast ? 3.5 : 1.3));
      else play(fast ? "run" : "walk", 0.25, sp / (fast ? 4.2 : 1.5));
    }
  }

  // ---- the body and the camera ----
  const np = body.translation();
  const feet = new THREE.Vector3(np.x, np.y - hh - P.radius, np.z);
  kid.position.copy(feet);
  const faceYaw = ladder ? Math.atan2(-ladder.n.x, -ladder.n.z) + Math.PI : yaw + Math.PI;
  kid.rotation.y = THREE.MathUtils.lerp(kid.rotation.y, faceYaw, 1 - Math.exp(-12 * dt)) ;
  kid.visible = third;

  // head bob from the step cycle, landing dip (spring), lean, run fov
  const moving = grounded && sp > 0.2;
  bobAmp += ((moving ? Math.min(1, sp / P.run) * (crouch ? 0.6 : 1) : 0) - bobAmp) * Math.min(1, 8 * dt);
  bobPhase += dt * (moving ? 2.1 + sp * 1.25 : 0);
  if (moving && Math.floor(bobPhase / Math.PI) !== lastStep) { lastStep = Math.floor(bobPhase / Math.PI); step(Math.min(1.2, 0.35 + sp / 3)); }
  dipV += (-dip * 60 - dipV * 9) * dt; dip += dipV * dt;
  const wantLean = (keys.has("KeyE") ? 1 : 0) - (keys.has("KeyQ") ? 1 : 0);
  leanCur += (wantLean * (sp < 2 ? 1 : 0) - leanCur) * Math.min(1, 9 * dt);
  eyeH += ((crouch ? P.eyeCrouch : P.eyeStand) - eyeH) * Math.min(1, 10 * dt);
  fovCur += ((sp > 3 ? P.fovRun : P.fov) - fovCur) * Math.min(1, 5 * dt);
  if (Math.abs(camera.fov - fovCur) > 0.05) { camera.fov = fovCur; camera.updateProjectionMatrix(); }

  const head = feet.clone().add(new THREE.Vector3(0, eyeH + dip * 0.12, 0));
  head.addScaledVector(right, leanCur * P.lean + Math.sin(bobPhase) * 0.022 * bobAmp);
  head.y += Math.abs(Math.cos(bobPhase)) * 0.045 * bobAmp - 0.02 * bobAmp;
  if (third) {
    // over the shoulder: behind the boy, a little to the right, orbiting with the mouse
    const back = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).normalize();
    const pivot = head.clone().addScaledVector(right, 0.38).add(new THREE.Vector3(0, 0.12, 0));
    const want = 2.3;
    const hit = rayHit({ x: pivot.x, y: pivot.y, z: pivot.z }, { x: back.x, y: back.y, z: back.z }, want);
    const d = hit === null ? want : Math.max(0.25, hit - 0.15);
    camera.position.copy(pivot).addScaledVector(back, d);
  } else camera.position.copy(head);
  camera.rotation.set(pitch, yaw, -leanCur * P.leanRoll + Math.sin(bobPhase) * 0.004 * bobAmp);
  torch.visible = torchOn;

  if (hintT > 0) { hintT -= dt; if (hintT <= 0) $("hint").classList.remove("on"); }
  if (!ladder && nearLadder(pos) && !hintT) hint("יתדות · לטיפוס התקרב והמשך ללכת קדימה", 1.2);
}
play("idle", 0);
requestAnimationFrame(frame);
