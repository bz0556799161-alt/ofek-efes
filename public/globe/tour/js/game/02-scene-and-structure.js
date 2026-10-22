/* ============================================================================
   ENGINE / SCENE
   ============================================================================ */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07070a);
scene.fog = new THREE.FogExp2(0x07070a, 0.0009);

const camera = new THREE.PerspectiveCamera(65, innerWidth/innerHeight, 0.1, 3000);

/* ============================================================================
   STRUCTURE ROTATION — the whole constellation sphere (floor/walls/ceiling/
   doors/plaques/labels/stars/asterism lines/ecliptic band/atmosphere/the
   exterior selection highlight) is parented under structureSpinGroup, which
   in turn is a child of structureTiltGroup - the exact same two-group
   pattern the mini-map already uses (miniTiltGroup > miniSpinGroup), so the
   real structure now tilts and spins in lockstep with the mini-map's own
   preview globe (see updateStructureRotation() near updateMiniMap()).
   Anything that must stay fixed regardless of the hour/tilt - the exterior
   ground, the exterior N/S/E/W signs, the ambient/rim lights, the exterior
   orbit camera - is left a direct child of `scene` instead, exactly
   mirroring miniCubeGroup/mapCamera's independence from miniSpinGroup.
   The interior first-person camera, the player's own body, and the light
   that follows them are reparented dynamically in setMode(): a child of
   structureSpinGroup while inside (so the room they're standing in, and the
   felt direction of gravity, visibly rotate along with the structure), and
   back under `scene` directly while outside (so the exterior orbit camera
   free-orbits the fixed shell exactly like the mini-map's own camera does).
   ============================================================================ */
const structureTiltGroup = new THREE.Group();
const structureSpinGroup = new THREE.Group();
structureTiltGroup.add(structureSpinGroup);
scene.add(structureTiltGroup);

const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
document.getElementById('canvasHolder').appendChild(renderer.domElement);

// hemisphere light gives the giant sphere a readable "sky above / ground
// below" tint from every angle, inside or out, without needing dozens of
// per-room lights.
scene.add(new THREE.HemisphereLight(0xaebbdd, 0x4a4038, 1.15));
scene.add(new THREE.AmbientLight(0x656870, 0.75));
const rim = new THREE.DirectionalLight(0xd8dfee, 0.85);
rim.position.set(300,400,200);
scene.add(rim);
const rim2 = new THREE.DirectionalLight(0x998877, 0.4);
rim2.position.set(-250,-150,-300);
scene.add(rim2);
// a lamp that follows the player so the immediate floor/walls stay legibly
// lit up close, without paying for per-room lights across 89 rooms.
const followLight = new THREE.PointLight(0xffd9a0, 3.2, 170, 2);
scene.add(followLight);

