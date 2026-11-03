// The spherical structure, walked for real.
// Light comes only from the star bulbs. Every surface is a floor, a wall or a ceiling according to the
// real gravity: floors are walked on, walls are climbed on their pegs, ceilings are out of reach.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import RAPIER from "./vendor/rapier.es.js";

const TOUCH = matchMedia("(pointer: coarse)").matches;
const LITE = TOUCH || /lite/.test(location.search);
if (TOUCH) document.documentElement.classList.add("touch");
const $ = (id) => document.getElementById(id);

/* ---------------- tuning ---------------- */
const P = {
  radius: 0.25, standHH: 0.5, crouchHH: 0.2,        // capsule: 1.5 m standing, 0.9 m crouched
  eyeStand: 1.40, eyeCrouch: 0.86,
  walk: 1.5, run: 4.0, crouch: 0.8, backFactor: 0.7,
  accel: 11, decel: 13, airAccel: 2.0,
  jump: 3.9, gravity: 9.81,
  climb: 1.0, lean: 0.36, leanRoll: 0.15,
  fov: 74, fovRun: 80,
  floorMax: 40, ceilingMin: 140                       // degrees between a surface's normal and "up"
};
const B = (a) => new THREE.Vector3(a[0], a[2], -a[1]);   // Blender (Z up) -> three (Y up)
const UP = new THREE.Vector3(0, 1, 0);                    // the real gravity's up, in this room, now
const surfaceClass = (n) => {                              // 0 floor, 1 wall, 2 ceiling
  const a = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(n.dot(UP), -1, 1)));
  return a <= P.floorMax ? 0 : a >= P.ceilingMin ? 2 : 1;
};

/* ---------------- renderer, scene: no light but the bulbs ---------------- */
const renderer = new THREE.WebGLRenderer({ antialias: !LITE, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, TOUCH ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.AgXToneMapping; renderer.toneMappingExposure = 1.7;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(P.fov, innerWidth / innerHeight, 0.03, 120);
camera.rotation.order = "YXZ";
scene.add(camera);
let composer = null;
if (!LITE) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.18, 0.2, 0.96));
  composer.addPass(new OutputPass());
}
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); if (composer) composer.setSize(innerWidth, innerHeight);
});

/* ---------------- loading ---------------- */
const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
const load = (u) => new Promise((ok, bad) => loader.load(u, ok, undefined, bad));
const [, roomGltf, kidGltf, meta] = await Promise.all([
  RAPIER.init(), load("./assets/orion.glb?v=3"), load("./assets/kid.glb"), fetch("./assets/orion.json?v=3").then((r) => r.json())
]);

/* ---------------- the room ---------------- */
const room = roomGltf.scene;
room.traverse((o) => {
  if (!o.isMesh) return;
  const m = o.material;
  if (m && m.emissive && m.emissive.getHex() !== 0) { m.emissiveIntensity *= 0.16; return; }   // a bulb: soft glow
  o.receiveShadow = true; o.castShadow = false;
  if (m && m.map) m.roughness = 1;
});
scene.add(room);
$("room").textContent = meta.nameHe;

// the bulbs light the room: the brightest as real lights; two of them, the nearest to the boy, cast his shadow
const bulbs = meta.bulbs.map((b) => ({ p: B(b.p).addScaledVector(B(b.n), 0.08), c: new THREE.Color(...b.c), I: 9 * Math.pow(10, -0.4 * (b.mag - 1)) * b.glow }))
  .filter((b) => b.I > 0.25).sort((a, b) => b.I - a.I).slice(0, LITE ? 6 : 14);
const bulbLights = bulbs.map((b) => {
  const L = new THREE.PointLight(b.c, b.I, 11, 2); L.position.copy(b.p); scene.add(L); return L;
});
const shadowLights = [0, 1].map(() => {
  const L = new THREE.PointLight(0xffffff, 0, 11, 2); L.castShadow = true;
  L.shadow.mapSize.set(LITE ? 256 : 512, LITE ? 256 : 512); L.shadow.bias = -0.002; L.shadow.normalBias = 0.02; L.shadow.radius = 4;
  scene.add(L); return L;
});

/* ---------------- physics ---------------- */
const world = new RAPIER.World({ x: 0, y: -P.gravity, z: 0 });
room.updateMatrixWorld(true);
const doorNodes = {};
room.traverse((o) => {
  if (!o.isMesh) return;
  const nm = o.name || (o.parent && o.parent.name) || "";
  const dm = nm.match(/^door(handle)?_([A-Za-z]+)/);
  if (dm) { (doorNodes[dm[2]] = doorNodes[dm[2]] || []).push(o); return; }    // doors get their own moving collider
  const g = o.geometry, pos = g.attributes.position;
  if (!g.boundingSphere) g.computeBoundingSphere();
  if (g.boundingSphere.radius < 0.2) return;            // bulbs and bolts
  const v = new Float32Array(pos.count * 3), t = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) { t.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); v.set([t.x, t.y, t.z], i * 3); }
  const idx = g.index ? new Uint32Array(g.index.array) : Uint32Array.from({ length: pos.count }, (_, i) => i);
  world.createCollider(RAPIER.ColliderDesc.trimesh(v, idx, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES));
});
const spawn = B(meta.spawn);
const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased()
  .setTranslation(spawn.x, spawn.y + P.standHH + P.radius + 0.1, spawn.z));
const collider = world.createCollider(RAPIER.ColliderDesc.capsule(P.standHH, P.radius), body);
const ctrl = world.createCharacterController(0.02);
ctrl.enableAutostep(0.3, 0.15, false);
ctrl.enableSnapToGround(0.25);
ctrl.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(P.floorMax));
ctrl.setMinSlopeSlideAngle(THREE.MathUtils.degToRad(P.floorMax + 4));
ctrl.setSlideEnabled(true);
function ray(o, d, max) {
  const h = world.castRayAndGetNormal(new RAPIER.Ray(o, d), max, true, undefined, undefined, collider, body);
  return h ? { t: h.timeOfImpact ?? h.toi, n: new THREE.Vector3(h.normal.x, h.normal.y, h.normal.z) } : null;
}

/* ---------------- doors: they open on their hinges ---------------- */
const doors = (meta.doorInfo || []).map((d) => {
  const hinge = B(d.hinge), axis = B(d.axis).normalize(), n = B(d.n).normalize(), side = B(d.side).normalize();
  const pivot = new THREE.Group(); pivot.position.copy(hinge); scene.add(pivot);
  (doorNodes[d.to] || []).forEach((m) => pivot.attach(m));
  const c = B(d.c);
  const leafCenter = c.clone().addScaledVector(n, 0.075);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, axis, n));
  const col = world.createCollider(RAPIER.ColliderDesc.cuboid(0.45, 1.01, 0.04)
    .setTranslation(leafCenter.x, leafCenter.y, leafCenter.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
  const name = (meta.doors.find((x) => x.to === d.to) || {}).nameHe || d.to;
  return { to: d.to, name, pivot, axis, n, c, col, open: 0, target: 0, hatch: surfaceClass(n) === 0 };
});
function nearestDoor(pos) {
  let best = null, bd = 1.9;
  for (const d of doors) { const dd = d.c.distanceTo(pos); if (dd < bd) { bd = dd; best = d; } }
  return best;
}

/* ---------------- pegs: what can be climbed ---------------- */
const pegs = (meta.pegs || []).map((p) => ({ p: B(p.p), n: B(p.n).normalize() }));
function pegsNear(pos, r) { return pegs.filter((g) => g.p.distanceTo(pos) < r && surfaceClass(g.n) === 1); }

/* ---------------- the boy ---------------- */
const kid = kidGltf.scene;
kid.updateMatrixWorld(true);
const box = new THREE.Box3().setFromObject(kid, true);
const kScale = 1.5 / (box.max.y - box.min.y);
kid.scale.setScalar(kScale);
const footOffset = -box.min.y * kScale;                  // the model's origin is not at its soles
kid.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
scene.add(kid);
// a soft contact shadow under the feet, so he never looks like he floats
const blobTex = (() => {
  const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31); gr.addColorStop(0, "rgba(0,0,0,0.75)"); gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
})();
const blob = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.85), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
blob.renderOrder = 2; scene.add(blob);

const mixer = new THREE.AnimationMixer(kid);
const clips = {};
for (const c of kidGltf.animations) {
  for (const tr of c.tracks) {                           // drop the hips' travel (root motion), keep the bounce
    if (!/Hips\.position$/.test(tr.name)) continue;
    const v = tr.values, x0 = v[0], z0 = v[2];
    for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
  }
  clips[c.name] = mixer.clipAction(c);
}
["jump_up", "jump_run", "land", "land_hard", "ladder_top", "door_in", "door_out", "opening", "crouch_to_stand", "stand_to_crouch"].forEach((n) => {
  if (clips[n]) { clips[n].setLoop(THREE.LoopOnce, 1); clips[n].clampWhenFinished = true; }
});
let cur = null, lockT = 0;
function fadeTo(a, fade) {
  if (cur === a) return;
  a.reset().setEffectiveWeight(1).play();
  if (cur) cur.crossFadeTo(a, fade, false);
  cur = a;
}
function play(name, fade = 0.22, scale = 1) {
  const a = clips[name]; if (!a) return;
  a.timeScale = scale; fadeTo(a, fade);
}
function playOnce(name, hold, fade = 0.12) {              // a one-shot the walking won't interrupt for `hold` seconds
  const a = clips[name]; if (!a) return;
  a.timeScale = 1;
  if (cur === a) a.reset(); else fadeTo(a, fade);
  lockT = hold ?? a.getClip().duration;
}

/* ---------------- input ---------------- */
const keys = new Set();
let yaw = 0, pitch = -0.2, third = true, crouch = false, runToggle = false, useKey = false;
{ const d = B(meta.lookAt).sub(spawn); yaw = Math.atan2(-d.x, -d.z); }
addEventListener("keydown", (e) => {
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === "KeyC") crouch = !crouch;
  if (e.code === "KeyV") third = !third;
  if (e.code === "KeyE" || e.code === "KeyF") useKey = true;
  if (e.code === "Space") e.preventDefault();
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => keys.clear());
const canvas = renderer.domElement;
addEventListener("mousemove", (e) => {
  if (document.pointerLockElement !== canvas) return;
  yaw -= e.movementX * 0.0022; pitch = Math.max(-1.45, Math.min(1.45, pitch - e.movementY * 0.0022));
});
canvas.addEventListener("click", () => { if (!TOUCH && started) canvas.requestPointerLock(); });
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
        yaw -= (t.clientX - lx) * 0.005; pitch = Math.max(-1.45, Math.min(1.45, pitch - (t.clientY - ly) * 0.005)); lx = t.clientX; ly = t.clientY;
      }
    }
    e.preventDefault();
  }, { passive: false });
  addEventListener("touchstart", (e) => { for (const t of e.changedTouches) if (t.target === canvas && lookId === null) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; } });
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
  tap("tLight", () => { useKey = true; });
  tap("tView", () => { third = !third; });
}

/* ---------------- sound ---------------- */
let AC = null;
function audioStart() {
  if (AC) return;
  AC = new (window.AudioContext || window.webkitAudioContext)();
  const g = AC.createGain(); g.gain.value = 0.05; g.connect(AC.destination);
  [43, 86.3, 129].forEach((f, i) => { const o = AC.createOscillator(); o.frequency.value = f; const og = AC.createGain(); og.gain.value = [1, 0.35, 0.12][i]; o.connect(og).connect(g); o.start(); });
}
function clank(loud, freq = 1200, len = 0.12) {
  if (!AC) return;
  const n = Math.floor(AC.sampleRate * len), buf = AC.createBuffer(1, n, AC.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
  const s = AC.createBufferSource(); s.buffer = buf;
  const bp = AC.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = freq * (0.75 + Math.random() * 0.5); bp.Q.value = 3.5;
  const g = AC.createGain(); g.gain.value = 0.25 * loud;
  const dl = AC.createDelay(); dl.delayTime.value = 0.09; const fb = AC.createGain(); fb.gain.value = 0.28;
  s.connect(bp).connect(g).connect(AC.destination); g.connect(dl).connect(fb).connect(dl); fb.connect(AC.destination);
  s.start();
}

/* ---------------- start ---------------- */
let started = false;
$("go").disabled = false; $("go").textContent = "להיכנס";
$("go").onclick = () => { started = true; $("start").style.display = "none"; audioStart(); if (!TOUCH) canvas.requestPointerLock(); };
let hintT = 0;
function hint(text, secs = 2.2) { $("hint").textContent = text; $("hint").classList.add("on"); hintT = secs; }

/* ---------------- the loop ---------------- */
const vel = new THREE.Vector3();
let vy = 0, grounded = false, airTime = 0, fallSpeed = 0, jumped = false;
let hh = P.standHH, eyeH = P.eyeStand, bobPhase = 0, bobAmp = 0, dip = 0, dipV = 0, leanCur = 0, fovCur = P.fov, lastStep = 0;
let climb = null;
const clock = new THREE.Clock();
const fwd = new THREE.Vector3(), right = new THREE.Vector3();
window.__walk = { body, world, get climb() { return climb; }, get state() { return { vel: vel.toArray().map(v => +v.toFixed(2)), vy: +vy.toFixed(2), grounded, yaw: +yaw.toFixed(2), keys: [...keys], rot: +kid.rotation.y.toFixed(2) }; } };     // for testing

function frame() {
  const dt = Math.min(clock.getDelta(), 1 / 30);
  if (started) update(dt);
  mixer.update(dt);
  (composer || renderer).render(scene, camera);
  requestAnimationFrame(frame);
}
function moveBody(p, m) {
  ctrl.computeColliderMovement(collider, m);
  const c = ctrl.computedMovement();
  body.setNextKinematicTranslation({ x: p.x + c.x, y: p.y + c.y, z: p.z + c.z });
  return c;
}

function update(dt) {
  let ix = 0, iz = 0;
  if (keys.has("KeyW") || keys.has("ArrowUp")) iz += 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) iz -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) ix += 1;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) ix -= 1;
  if (TOUCH) { ix += stick.x; iz += stick.y; }
  const jumpKey = keys.has("Space") || touchJump; touchJump = false;
  const running = (keys.has("ShiftLeft") || keys.has("ShiftRight") || runToggle) && iz > 0.3 && !crouch;
  fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw)); right.set(Math.cos(yaw), 0, -Math.sin(yaw));
  const p = body.translation();
  const pos = new THREE.Vector3(p.x, p.y, p.z);

  // ---- doors (E) ----
  if (useKey) {
    useKey = false;
    const d = nearestDoor(pos);
    if (d) {
      d.target = d.target ? 0 : 1;
      if (d.target) { playOnce(d.hatch ? "opening" : "door_out", 1.2); hint(`הדלת ל${d.name} נפתחת · החדר שמאחוריה עוד נבנה`); clank(1.2, 380, 0.3); }
      else clank(1.4, 300, 0.25);
    } else hint("אין כאן דלת");
  }
  for (const d of doors) {
    if (d.open === d.target) continue;
    d.open = THREE.MathUtils.clamp(d.open + Math.sign(d.target - d.open) * dt / 0.9, 0, 1);
    const e = d.open * d.open * (3 - 2 * d.open);
    d.pivot.quaternion.setFromAxisAngle(d.axis, -e * THREE.MathUtils.degToRad(100));
    d.col.setEnabled(d.open < 0.08);
  }

  // ---- climbing on pegs: walk into a wall that has pegs ----
  if (!climb) {
    const near = pegsNear(pos, 0.95);
    if (near.length && iz > 0.5) {
      const n = near[0].n, flat = new THREE.Vector3(n.x, 0, n.z);
      if (flat.lengthSq() > 0.01 && fwd.dot(flat.normalize()) < -0.35) {
        climb = { n: n.clone() }; vy = 0; vel.set(0, 0, 0); play("ladder", 0.2);
        hint("טיפוס ביתדות · W/S למעלה ולמטה, A/D לצדדים, רווח לעזוב");
      }
    }
  }
  if (climb) {
    const n = climb.n;
    const wallUp = UP.clone().addScaledVector(n, -UP.dot(n)).normalize();
    const wallSide = new THREE.Vector3().crossVectors(wallUp, n).normalize();
    const hands = pos.clone().addScaledVector(wallUp, 0.5);
    const near = pegsNear(hands, 1.0);
    const wantUp = iz * P.climb, wantSide = ix * P.climb * 0.6;
    const above = pegsNear(hands.clone().addScaledVector(wallUp, 0.45), 0.7).length > 0;
    const m = new THREE.Vector3();
    if (near.length) {
      const g = near.reduce((a, b) => (a.p.distanceTo(hands) < b.p.distanceTo(hands) ? a : b));
      const dist = pos.clone().sub(g.p).dot(n);
      m.addScaledVector(n, (0.33 - dist) * Math.min(1, 10 * dt));
      if (wantUp > 0 && !above) {                          // the top of the pegs: over onto the floor above, if there is one
        const over = pos.clone().addScaledVector(wallUp, 1.2).addScaledVector(n, -0.6);
        const fl = ray({ x: over.x, y: over.y + 0.5, z: over.z }, { x: 0, y: -1, z: 0 }, 2.0);
        if (fl && surfaceClass(fl.n) === 0) {
          body.setTranslation({ x: over.x, y: over.y + 0.5 - fl.t + hh + P.radius + 0.05, z: over.z }, true);
          climb = null; playOnce("ladder_top", 0.9, 0.15); clank(1, 900);
          world.step(); return;
        }
      } else m.addScaledVector(wallUp, wantUp * dt);
      m.addScaledVector(wallSide, wantSide * dt);
    } else m.addScaledVector(wallUp, -1.5 * dt);            // no pegs under the hands: slip down
    moveBody(p, m);
    const speed = Math.abs(wantUp) + Math.abs(wantSide);
    play("ladder", 0.15, speed < 0.05 ? 0.0001 : (wantUp >= 0 ? 1 : -1) * Math.max(0.3, speed / P.climb));
    if (speed > 0.05 && Math.floor((bobPhase += dt * speed * 3) / Math.PI) !== lastStep) { lastStep = Math.floor(bobPhase / Math.PI); clank(0.6, 1600, 0.06); }
    grounded = ctrl.computedGrounded();
    if (jumpKey || (iz < 0 && grounded)) {
      climb = null; vel.copy(n).multiplyScalar(jumpKey ? 1.8 : 0.4); vel.y = 0; vy = jumpKey ? 2.2 : 0;
    }
  } else {
    // ---- walking ----
    const wish = new THREE.Vector3().addScaledVector(fwd, iz).addScaledVector(right, ix);
    if (wish.lengthSq() > 1) wish.normalize();
    let speed = crouch ? P.crouch : running ? P.run : P.walk;
    if (iz < -0.2) speed *= P.backFactor;
    const target = wish.multiplyScalar(speed);
    const a = grounded ? (target.lengthSq() > 0.01 ? P.accel : P.decel) : P.airAccel;
    vel.x += (target.x - vel.x) * Math.min(1, a * dt);
    vel.z += (target.z - vel.z) * Math.min(1, a * dt);
    vy -= P.gravity * dt;
    if (grounded && jumpKey && !crouch) {
      vy = P.jump; grounded = false; jumped = true;
      playOnce(Math.hypot(vel.x, vel.z) > 2.6 ? "jump_run" : "jump_up", 0.5, 0.1);
    }
    const wantHH = crouch ? P.crouchHH : P.standHH;
    if (wantHH !== hh) {
      if (wantHH > hh) {
        const up = ray({ x: p.x, y: p.y + hh + P.radius - 0.02, z: p.z }, { x: 0, y: 1, z: 0 }, (wantHH - hh) * 2 + 0.05);
        if (up) { crouch = true; hint("אין כאן מקום לעמוד"); }
      }
      const nh = crouch ? P.crouchHH : P.standHH;
      if (nh !== hh) { const d = nh - hh; collider.setHalfHeight(nh); body.setTranslation({ x: p.x, y: p.y + d, z: p.z }, true); p.y += d; hh = nh; }
    }
    const was = grounded;
    const c = moveBody(p, { x: vel.x * dt, y: vy * dt, z: vel.z * dt });
    grounded = ctrl.computedGrounded();
    if (grounded) {
      if (!was && airTime > 0.2) {
        dipV -= Math.min(4, fallSpeed * 0.5);
        if (fallSpeed > 8) playOnce("land_hard", 1.0);
        else if (fallSpeed > 5.5 && !jumped) playOnce("land", 0.5);
        else lockT = 0;                                     // an ordinary jump: just walk on
        clank(Math.min(1.6, 0.6 + fallSpeed / 6), 700);
      }
      vy = Math.max(vy, -1); airTime = 0; fallSpeed = 0; jumped = false;
    } else { airTime += dt; fallSpeed = Math.max(fallSpeed, -vy); }
    if (vy > 0 && c.y < vy * dt * 0.5) vy = 0;            // head against a ceiling
  }
  world.step();

  // ---- animation ----
  const sp = Math.hypot(vel.x, vel.z);
  const lf = vel.x * fwd.x + vel.z * fwd.z, lr = vel.x * right.x + vel.z * right.z;
  if (lockT > 0) lockT -= dt;
  else if (!climb) {
    if (!grounded && airTime > (jumped ? 0.7 : 0.25)) play("fall", 0.35);
    else if (!grounded) { /* the take-off pose holds */ }
    else if (crouch) {
      if (sp < 0.15) play("crouch_idle");
      else if (Math.abs(lr) > Math.abs(lf)) play(lr > 0 ? "crouch_right" : "crouch_left", 0.25, sp / 0.9);
      else play("crouch_walk", 0.25, (lf >= 0 ? 1 : -1) * sp / 0.9);
    } else if (sp < 0.15) play("idle", 0.3);
    else {
      const fast = sp > 2.4, side = Math.abs(lr) > Math.abs(lf) * 1.2;
      if (side) play(fast ? (lr > 0 ? "run_right" : "run_left") : (lr > 0 ? "walk_right" : "walk_left"), 0.25, sp / (fast ? 3.8 : 1.4));
      else if (lf < 0) play(fast ? "run_back" : "walk_back", 0.25, sp / (fast ? 3.3 : 1.1));
      else play(fast ? "run" : "walk", 0.25, sp / (fast ? 4.0 : 1.5));
    }
  }

  // ---- the boy, his shadow, the camera ----
  const np = body.translation();
  const feet = new THREE.Vector3(np.x, np.y - hh - P.radius, np.z);
  kid.position.set(feet.x, feet.y + footOffset - 0.02, feet.z);
  const faceYaw = climb ? Math.atan2(climb.n.x, climb.n.z) : yaw + Math.PI;
  let dyaw = faceYaw - kid.rotation.y; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
  kid.rotation.y += dyaw * (1 - Math.exp(-12 * dt));
  kid.visible = third;
  const down = ray({ x: feet.x, y: feet.y + 0.3, z: feet.z }, { x: 0, y: -1, z: 0 }, 3);
  blob.visible = third && !!down && !climb;
  if (down) {
    blob.position.set(feet.x, feet.y + 0.3 - down.t + 0.012, feet.z);
    blob.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), down.n);
    blob.material.opacity = THREE.MathUtils.clamp(1 - (down.t - 0.3) / 1.5, 0, 1);
  }
  const order = bulbs.map((b, i) => [i, b.p.distanceToSquared(feet) / (b.I + 0.1)]).sort((a, b) => a[1] - b[1]);
  bulbLights.forEach((L, i) => { L.intensity = bulbs[i].I; });
  shadowLights.forEach((S, k) => {
    const i = order[k] ? order[k][0] : -1;
    if (i < 0) { S.intensity = 0; return; }
    S.position.copy(bulbs[i].p); S.color.copy(bulbs[i].c); S.intensity = bulbs[i].I; bulbLights[i].intensity = 0;
  });

  const moving = grounded && sp > 0.2 && !climb;
  bobAmp += ((moving ? Math.min(1, sp / P.run) * (crouch ? 0.6 : 1) : 0) - bobAmp) * Math.min(1, 8 * dt);
  if (!climb) bobPhase += dt * (moving ? 2.1 + sp * 1.25 : 0);
  if (moving && Math.floor(bobPhase / Math.PI) !== lastStep) { lastStep = Math.floor(bobPhase / Math.PI); clank(Math.min(1.2, 0.35 + sp / 3)); }
  dipV += (-dip * 60 - dipV * 9) * dt; dip += dipV * dt;
  const wantLean = (keys.has("KeyQ") ? -1 : 0) + (keys.has("KeyR") ? 1 : 0);
  leanCur += (wantLean * (sp < 2 ? 1 : 0) - leanCur) * Math.min(1, 9 * dt);
  eyeH += ((crouch ? P.eyeCrouch : P.eyeStand) - eyeH) * Math.min(1, 10 * dt);
  fovCur += ((sp > 3 ? P.fovRun : P.fov) - fovCur) * Math.min(1, 5 * dt);
  if (Math.abs(camera.fov - fovCur) > 0.05) { camera.fov = fovCur; camera.updateProjectionMatrix(); }
  const head = feet.clone().add(new THREE.Vector3(0, eyeH + dip * 0.12, 0));
  head.addScaledVector(right, leanCur * P.lean + Math.sin(bobPhase) * 0.022 * bobAmp);
  head.y += Math.abs(Math.cos(bobPhase)) * 0.045 * bobAmp - 0.02 * bobAmp;
  if (third) {
    const back = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).normalize();
    const pivot = head.clone().addScaledVector(right, 0.35).add(new THREE.Vector3(0, 0.12, 0));
    const hit = ray({ x: pivot.x, y: pivot.y, z: pivot.z }, { x: back.x, y: back.y, z: back.z }, 2.2);
    camera.position.copy(pivot).addScaledVector(back, hit ? Math.max(0.25, hit.t - 0.15) : 2.2);
  } else camera.position.copy(head);
  camera.rotation.set(pitch, yaw, -leanCur * P.leanRoll + Math.sin(bobPhase) * 0.004 * bobAmp);

  if (hintT > 0) { hintT -= dt; if (hintT <= 0) $("hint").classList.remove("on"); }
  if (!climb && hintT <= 0) {
    const d = nearestDoor(pos);
    if (d) hint(`E · לפתוח את הדלת ל${d.name}`, 0.6);
    else if (pegsNear(pos, 0.95).length) hint("יתדות · כדי לטפס התקרב לקיר והמשך ללכת קדימה", 0.6);
  }
}
play("idle", 0);
requestAnimationFrame(frame);
