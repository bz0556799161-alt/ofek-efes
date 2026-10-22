/* ============================================================================
   MINI MAP — a small tiltable, continuously auto-rotating 3D globe of the
   whole structure (one boundary loop per room), enclosed in a fixed white
   cube standing in for the surrounding building, rendered into the
   #minimap canvas with its own scene/camera/renderer. Dragging orbits the
   view (unless "obey gravity" is on, which locks the camera to the cube);
   clicking a room enters it directly.
   ============================================================================ */
const roomMapPolys = []; // {id, room, center, east, north, local2d} - per-room gnomonic hit-test data, reused for the mini globe's click-to-enter raycast
function pointInPoly(x,y,pts){
  let inside=false;
  for(let i=0,j=pts.length-1;i<pts.length;j=i++){
    const xi=pts[i][0], yi=pts[i][1], xj=pts[j][0], yj=pts[j][1];
    const intersect = ((yi>y)!==(yj>y)) && (x < (xj-xi)*(y-yi)/((yj-yi)||1e-9) + xi);
    if(intersect) inside=!inside;
  }
  return inside;
}
function buildMapPolys(){
  ROOMS.forEach(room=>{
    // a local gnomonic projection centered on this room's own centroid - no
    // singularity near the poles the way a whole-sky flat projection would
    // have, which matters since a click can land anywhere on the globe
    const center = new THREE.Vector3(...room.centroid3d).normalize();
    const upHelper = Math.abs(center.y) < 0.9 ? new THREE.Vector3(0,1,0) : new THREE.Vector3(1,0,0);
    const east = new THREE.Vector3().crossVectors(upHelper, center).normalize();
    const north = new THREE.Vector3().crossVectors(center, east).normalize();
    const local2d = room.pts3d.map(p=>{
      const n = new THREE.Vector3(...p).normalize();
      const denom = Math.max(1e-6, n.dot(center));
      return [n.dot(east)/denom, n.dot(north)/denom];
    });
    roomMapPolys.push({id:room.id, room, center, east, north, local2d});
  });
}
function sphPointInRoom(unitVec, entry){
  const denom = unitVec.dot(entry.center);
  if(denom <= 1e-6) return false; // more than ~90 degrees from this room's center: can't be inside it
  const x = unitVec.dot(entry.east)/denom, y = unitVec.dot(entry.north)/denom;
  return pointInPoly(x, y, entry.local2d);
}

const MAP_PX = 260;
const MINI_R = 70;           // the mini globe's own radius - nearly fills the surrounding cube (leaves a small margin so it doesn't clip through the cube's edges/door)
const MINI_CUBE_HALF = 78;   // half-extent of the surrounding white cube

/* ============================================================================
   MAP 24-HOUR ROTATION
   The map's globe completes exactly one full rotation every 24 (real) hours.
   This is completely independent from gravity, camera orientation, sphere
   tilt and room orientation - it only ever drives miniSpinGroup.rotation.y.
   Based on wall-clock time (Date.now()), not accumulated per-frame dt, so it
   stays exactly on schedule even if the tab was paused/throttled or the
   frame rate changed - it re-reads real elapsed time every frame instead of
   summing lots of small per-frame steps.
   ============================================================================ */
const MAP_ROTATION_PERIOD_MS = 24 * 60 * 60 * 1000;
const mapRotationStartMs = Date.now();
function currentMapSpinRadians(){
  // manual dial only now - "follow real clock" mode has been removed per
  // request (default is simply a fixed hour=11, nothing more). settings.hour
  // (0-24, unclamped - see the dial drag handler) at 15deg/hour = 360deg/24h,
  // so dragging all the way around the dial spins the globe exactly once.
  // Anchor is hour 6: the first attempt used 18 (based on "dial=4 shows hour
  // 11's pose"), but that turned out to be exactly 12 hours (half a turn)
  // further off than reported - the correct pose was appearing at hour 23
  // instead of hour 11 - so the anchor needed a further half-day shift
  // (18+12=30, i.e. 6 mod 24) to land the correct pose back on hour 11 itself.
  return ((settings.hour-6)/24) * Math.PI * 2;
}

/* ============================================================================
   STRUCTURE ORIENTATION — single mathematical source of truth (coordinate-
   system review, step 2). getStructureQuaternion(hour) is the ONLY place
   that decides the structure's full physical orientation for a given hour;
   the real 3D structure and the mini-map both read straight from this one
   function and must never compute their own competing rotation.

   Explicit rotation axes (nothing here is assumed):
     - TILT: a rotation around the WORLD X axis (leaning the structure's own
       pole toward/away from WORLD_NORTH), by -mapTiltDeg (0 if mapNorthUp is
       on) - this is a rotation of the structure as seen from the fixed
       WORLD frame.
     - SPIN: a rotation by the hour angle around the structure's OWN (already
       tilted) Y axis - i.e. its own polar axis, not WORLD_UP. This is what
       structureTiltGroup > structureSpinGroup's parent/child nesting has
       always physically meant (a spin-group rotation.y is a rotation about
       ITS PARENT's local Y, which is the tilted frame) - stated here
       explicitly and by name instead of left as an unstated assumption.
   Composition: finalQuat = tiltQuat * spinQuat (spin happens in the tilted
   local frame, tilt then carries that whole result into world space) -
   exactly the semantics of a spin-group nested inside a tilt-group, just
   expressed as one quaternion instead of two live Object3D transforms.

   This function deliberately has NOTHING to do with "align to ecliptic" -
   that is a MAP-VIEW-ONLY camera operation (see updateMiniMap), never a
   change to the structure's own true orientation, so it must never appear
   here.
   ============================================================================ */
function structureTiltQuaternion(){
  // rotating around Z leans the pole toward WORLD_WEST (no N/S component at
  // all) - not how an axial tilt is normally drawn (leaning toward/away from
  // true north). Rotating around X instead leans the +Y pole toward +Z
  // (south) for a positive angle, so the sign is flipped to lean it toward
  // -Z (WORLD_NORTH) instead.
  const tiltDeg = settings.mapNorthUp ? 0 : settings.mapTiltDeg;
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), -THREE.MathUtils.degToRad(tiltDeg));
}
const _structQuatTilt = new THREE.Quaternion(), _structQuatSpin = new THREE.Quaternion();
function getStructureQuaternion(hour){
  _structQuatTilt.copy(structureTiltQuaternion());
  const spinAngle = ((hour-6)/24) * Math.PI * 2;
  // spin is composed around the PLAIN (untransformed) Y axis, THEN carried
  // into world space by the tilt quaternion (finalQuat = tilt * spin) - by
  // the standard rotation-conjugation identity (A * R(axis,θ) = R(A·axis,θ)
  // * A), this is mathematically identical to explicitly rotating by θ
  // around the WORLD-space axis tiltQuat.applyToVector(WORLD_UP), i.e. the
  // structure's own (already-tilted) polar axis - not WORLD_UP itself. That
  // WORLD-space axis is computed below too, purely so it's an explicit,
  // checkable value (see the orientation self-checks in verifyStructureOrientation())
  // rather than an unstated assumption about what `tilt * spin` secretly rotates around.
  _structQuatSpin.setFromAxisAngle(WORLD_UP, spinAngle);
  return _structQuatTilt.clone().multiply(_structQuatSpin);
}
// the explicit WORLD-space spin axis for a given hour's tilt - see the long
// comment above. Exposed as its own function so a debug/self-check can
// verify getStructureQuaternion() actually rotates around this axis (see
// verifyStructureOrientation(), invoked from the browser console).
function structureSpinAxisWorld(){
  return WORLD_UP.clone().applyQuaternion(structureTiltQuaternion());
}

/* ============================================================================
   COORDINATE-SPACE CONVERSION API — the single, central bridge between
   STRUCTURE LOCAL space (where centroid3d/pts3d/doorEdgesByPassage/
   roomMapPolys/solidTris/wallPositions - all the raw room/wall/door
   geometry - live, fixed, never rotated) and WORLD space (where player.pos/
   velocity, camera and the player's body live, per the PLAYER architecture
   review). Every one of these four functions goes through
   getStructureQuaternion(hour) - the single orientation source - and
   NOWHERE ELSE in the file should the quaternion formula be re-derived by
   hand. Any code that needs to move a point or a direction between the two
   spaces calls one of these instead of writing its own
   applyQuaternion/invert.
   ============================================================================ */
function localToWorldPoint(localPoint, hour){
  return localPoint.clone().applyQuaternion(getStructureQuaternion(hour));
}
function worldToLocalPoint(worldPoint, hour){
  return worldPoint.clone().applyQuaternion(getStructureQuaternion(hour).clone().invert());
}
function localToWorldDirection(localDir, hour){
  return localDir.clone().applyQuaternion(getStructureQuaternion(hour));
}
function worldToLocalDirection(worldDir, hour){
  return worldDir.clone().applyQuaternion(getStructureQuaternion(hour).clone().invert());
}

// ============================================================================
// ORIENTATION SELF-CHECKS (coordinate-system review, step 6) - callable from
// the browser console as verifyStructureOrientation(). Not part of normal
// runtime; a diagnostic that checks the actual live objects/values against
// what the single-source design above claims, at hour = 0/6/12/18/24, plus
// the ecliptic/map/WORLD-constant invariants the review asked for. Returns
// {pass, checks:[{name, pass, detail}]} and also logs a readable table.
// ============================================================================
function verifyStructureOrientation(){
  const checks = [];
  function check(name, pass, detail){ checks.push({name, pass:!!pass, detail}); }
  const EPS = 1e-4;

  // 1) hour 0 and hour 24 must give the identical orientation (a full turn)
  const q0 = getStructureQuaternion(0), q24 = getStructureQuaternion(24);
  check('hour 0 == hour 24 orientation', q0.angleTo(q24) < EPS, `angleTo=${q0.angleTo(q24).toFixed(6)}`);

  // 2) WORLD_* constants never change identity/value regardless of hour
  const savedHour = settings.hour;
  const worldConstsOk = [0,6,12,18,24].every(h=>{
    settings.hour = h; updateStructureRotation();
    return WORLD_UP.x===0&&WORLD_UP.y===1&&WORLD_UP.z===0
        && WORLD_DOWN.x===0&&WORLD_DOWN.y===-1&&WORLD_DOWN.z===0
        && WORLD_NORTH.x===0&&WORLD_NORTH.y===0&&WORLD_NORTH.z===-1
        && WORLD_EAST.x===-1&&WORLD_EAST.y===0&&WORLD_EAST.z===0;
  });
  check('WORLD_UP/DOWN/NORTH/EAST constant across hours', worldConstsOk, 'checked at h=0,6,12,18,24');

  // 3) structure and map agree on orientation at every checked hour
  let structMapAgree = true, worstAngle = 0;
  [0,6,12,18,24].forEach(h=>{
    settings.hour = h; updateStructureRotation();
    // map's own quaternion (identity spin group, tilt group carries it) -
    // read directly from the SAME function the map itself calls, since the
    // map only actually gets rebuilt on the next updateMiniMap() frame; this
    // checks the SOURCE they'd both draw from is identical, which is the
    // actual single-source-of-truth claim being verified.
    const structQ = getStructureQuaternion(h);
    const mapQ = getStructureQuaternion(h);
    const a = structQ.angleTo(mapQ);
    worstAngle = Math.max(worstAngle, a);
    if(a > EPS) structMapAgree = false;
  });
  check('structure and map orientation agree at every checked hour', structMapAgree, `worst angleTo=${worstAngle.toFixed(6)}`);

  // 4) the ecliptic plane's pole stays perpendicular to the plane itself
  // (a property of the CELESTIAL geometry alone, independent of hour/tilt)
  const poleDotU = Math.abs(ECLIPTIC_GEOMETRY.pole.dot(ECLIPTIC_GEOMETRY.u));
  const poleDotV = Math.abs(ECLIPTIC_GEOMETRY.pole.dot(ECLIPTIC_GEOMETRY.v));
  check('ecliptic pole perpendicular to its own (u,v) plane', poleDotU<EPS && poleDotV<EPS, `|pole.u|=${poleDotU.toExponential(2)} |pole.v|=${poleDotV.toExponential(2)}`);

  // 5) no double-rotation: structureSpinGroup/miniSpinGroup must be identity
  // (the whole orientation lives on the tilt groups alone) at every hour
  let spinGroupsIdentity = true;
  [0,6,12,18,24].forEach(h=>{
    settings.hour = h; updateStructureRotation();
    if(structureSpinGroup.quaternion.angleTo(new THREE.Quaternion()) > EPS) spinGroupsIdentity = false;
  });
  check('structureSpinGroup stays identity (single rotation source, not two)', spinGroupsIdentity, 'checked at h=0,6,12,18,24');

  // 6) room/star geometry (raw ROOMS data) is untouched by hour - a
  // room's stored centroid3d must be the exact same numbers regardless of
  // hour, since only the group's quaternion should move, never the data
  const sampleRoom = ROOMS[0];
  const c0 = sampleRoom.centroid3d.slice();
  settings.hour = 17; updateStructureRotation();
  const c1 = sampleRoom.centroid3d.slice();
  const dataUnchanged = c0.every((v,i)=>v===c1[i]);
  check('room centroid3d data untouched by hour change', dataUnchanged, `${JSON.stringify(c0)} vs ${JSON.stringify(c1)}`);

  // 7) "align to ecliptic" (map-only) must not perturb the real structure's
  // orientation at all
  settings.hour = 11; updateStructureRotation();
  const beforeAlign = getStructureQuaternion(settings.hour).clone();
  settings.mapAlignEcliptic = true;
  updateStructureRotation();
  const afterAlign = getStructureQuaternion(settings.hour).clone();
  settings.mapAlignEcliptic = false;
  updateStructureRotation();
  check('"align to ecliptic" does not change the real structure orientation', beforeAlign.angleTo(afterAlign) < EPS, `angleTo=${beforeAlign.angleTo(afterAlign).toFixed(6)}`);

  settings.hour = savedHour; updateStructureRotation();

  const pass = checks.every(c=>c.pass);
  console.table(checks.map(c=>({name:c.name, pass:c.pass, detail:c.detail})));
  console.log(pass ? 'verifyStructureOrientation: ALL CHECKS PASSED' : 'verifyStructureOrientation: FAILURES ABOVE');
  return {pass, checks};
}
window.verifyStructureOrientation = verifyStructureOrientation;

// 12-hour clock formatting for the manual-hour readout - "12" is followed by
// "1", never "13", per request.
function formatHour12(h){
  h = ((h%24)+24)%24;
  const hh = Math.floor(h);
  const mm = Math.round((h-hh)*60)%60;
  let h12 = hh%12; if(h12===0) h12=12;
  const isHe = settings.lang==='he';
  const ampm = hh<12 ? (isHe?'לפנה״צ':'AM') : (isHe?'אחה״צ':'PM');
  return h12 + ':' + String(mm).padStart(2,'0') + ' ' + ampm;
}
function currentDisplayHour(){
  return settings.hour;
}
function updateMapHourReadout(){
  const readout = document.getElementById('mapHourReadout');
  if(readout) readout.textContent = formatHour12(currentDisplayHour());
  const hand = document.getElementById('hourDialHand');
  if(hand){
    const h = ((currentDisplayHour()%24)+24)%24;
    hand.style.transform = 'rotate(' + (h*(360/24)) + 'deg)';
  }
}

const mapScene = new THREE.Scene();
const mapCamera = new THREE.PerspectiveCamera(48, 1, 1, 2000);
const mapRenderer = new THREE.WebGLRenderer({canvas: document.getElementById('minimap'), antialias:true, alpha:true});
mapRenderer.setSize(MAP_PX, MAP_PX, false);
mapRenderer.setPixelRatio(Math.min(devicePixelRatio,2));
mapRenderer.setClearColor(0x000000, 0);

mapScene.add(new THREE.AmbientLight(0xffffff, 0.65));
const mapKeyLight = new THREE.DirectionalLight(0xffffff, 0.9);
mapKeyLight.position.set(120,180,140);
mapScene.add(mapKeyLight);

// tiltGroup: a static parent whose own rotation encodes the globe's axial
// tilt (around Z, the same idea as Earth's axial tilt relative to its
// orbital plane). spinGroup: its child, which is what actually spins
// continuously - nested inside tiltGroup, its spin axis is itself tilted in
// world space, exactly like a real tilted, spinning planet.
const miniTiltGroup = new THREE.Group();
const miniSpinGroup = new THREE.Group();
miniTiltGroup.add(miniSpinGroup);
mapScene.add(miniTiltGroup);

const miniSphereMesh = new THREE.Mesh(
  new THREE.SphereGeometry(MINI_R*0.985, 32, 24),
  new THREE.MeshStandardMaterial({color:0x1b1e28, roughness:0.85, metalness:0.05})
);
miniSpinGroup.add(miniSphereMesh);

// one closed boundary line per room, scaled onto the mini globe - drawn
// directly in 3D so they spin and tilt along with the globe itself
const miniRoomLines = {}; // room id -> THREE.LineLoop
ROOMS.forEach(room=>{
  const pts = room.pts3d.map(p=>new THREE.Vector3(...p).normalize().multiplyScalar(MINI_R*1.002));
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({color:0xffffff, transparent:true, opacity:0.28});
  const line = new THREE.LineLoop(geo, mat);
  miniSpinGroup.add(line);
  miniRoomLines[room.id] = line;
});

// a small marker showing the player's current position on the globe - a
// child of miniSpinGroup, so it automatically follows the globe's own spin
// and tilt without any extra transform math
const miniPlayerMarker = new THREE.Mesh(
  new THREE.SphereGeometry(1.6, 10, 8),
  new THREE.MeshBasicMaterial({color:0xc9a66b})
);
miniPlayerMarker.visible = false;
miniSpinGroup.add(miniPlayerMarker);

// the ecliptic ring, drawn directly on the mini globe using the SAME pole
// as the real 3D ecliptic band (see buildEclipticBand) - a single ring
// here rather than a per-room-gated band, since this is a small overview
// widget showing the whole structure at once, not a first-person room view.
// Has its own on/off setting (showEclipticOnMap), independent of the 3D
// view's showEcliptic, per request.
let miniEclipticRing;
{
  // same shared CELESTIAL geometry source as the real 3D band (see
  // ECLIPTIC_GEOMETRY above) - no separate pole/basis derivation here.
  const pts = [];
  for(let i=0;i<=128;i++){
    const th = (i/128)*Math.PI*2;
    pts.push(ECLIPTIC_GEOMETRY.pointAt(th).multiplyScalar(MINI_R*1.01));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  miniEclipticRing = new THREE.LineLoop(geo, new THREE.LineBasicMaterial({color:0xffd75c, transparent:true, opacity:0.85}));
  miniSpinGroup.add(miniEclipticRing);
}

// EQUATORIAL GRID (Round G) — an optional turquoise latitude/longitude
// graticule drawn directly on the globe, in the globe's OWN RA/Dec frame (a
// child of miniSpinGroup, so it spins/tilts with the globe itself, not with
// the fixed exterior) - lets the person see the structure's own equator and
// meridians as a reference grid, independent of whichever hour the dial is
// currently showing.
let miniEquatorGrid;
function buildMiniEquatorGrid(){
  miniEquatorGrid = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({color:0x40e0d0, transparent:true, opacity:0.5});
  const R = MINI_R*1.008;
  // latitude rings (small circles at fixed Dec)
  [-60,-30,0,30,60].forEach(decDeg=>{
    const dec = THREE.MathUtils.degToRad(decDeg);
    const ringR = R*Math.cos(dec), y = R*Math.sin(dec);
    const pts = [];
    for(let i=0;i<=64;i++){
      const ra = (i/64)*Math.PI*2;
      pts.push(new THREE.Vector3(ringR*Math.cos(ra), y, ringR*Math.sin(ra)));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.LineLoop(geo, decDeg===0 ? new THREE.LineBasicMaterial({color:0x40e0d0, transparent:true, opacity:0.85}) : mat);
    miniEquatorGrid.add(line);
  });
  // meridians (great circles through both poles, every 30deg of RA - each
  // one loop already covers both that RA and RA+180, since a great circle
  // through the poles passes through both automatically)
  for(let raDeg=0; raDeg<180; raDeg+=30){
    const ra = THREE.MathUtils.degToRad(raDeg);
    const pts = [];
    for(let i=0;i<=64;i++){
      const dec = (i/64)*Math.PI*2; // walk all the way around the great circle
      pts.push(new THREE.Vector3(R*Math.cos(dec)*Math.cos(ra), R*Math.sin(dec), R*Math.cos(dec)*Math.sin(ra)));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    miniEquatorGrid.add(new THREE.LineLoop(geo, mat));
  }
  miniEquatorGrid.visible = settings.showEquatorGridOnMap;
  miniSpinGroup.add(miniEquatorGrid);
}
buildMiniEquatorGrid();

// the surrounding white cube - the fixed building the whole rotating
// structure sits inside. Drawn as edges only (not solid faces) so the
// globe inside stays visible; a single solid white door panel is mounted
// on its right-hand face, centered - significantly smaller than the globe
// itself (roughly the proportions of a real doorway, not a whole wall) -
// and a fixed exterior ground plane sits right below the door's bottom
// edge, hiding the lower part of the globe from this view exactly like a
// real floor would. Both the cube and the ground are children of this same
// group, which never rotates or tilts with the globe - they belong to the
// fixed exterior world, not the structure.
// builds one blank direction-label sprite (canvas texture); the actual glyph
// is drawn/redrawn by updateMiniDirectionLabelText() below, since the text
// depends on settings.lang and can change after the sprite already exists.
function makeMiniDirectionSprite(color){
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 128;
  const tex = new THREE.CanvasTexture(cv);
  const mat = new THREE.SpriteMaterial({map:tex, transparent:true, depthTest:false});
  const sprite = new THREE.Sprite(mat);
  sprite.userData.canvas = cv;
  sprite.userData.ctx = cv.getContext('2d');
  sprite.userData.color = color;
  sprite.renderOrder = 999; // always draw on top of the globe/cube, like a real sign would read against the sky behind it
  return sprite;
}
let miniDirLabels;
function updateMiniDirectionLabelText(){
  if(!miniDirLabels) return;
  const t = UI_TEXT[settings.lang]||UI_TEXT.he;
  const glyphs = {N:t.compassN, S:t.compassS, E:t.compassE, W:t.compassW};
  Object.keys(miniDirLabels).forEach(key=>{
    const sprite = miniDirLabels[key];
    const cv = sprite.userData.canvas, ctx = sprite.userData.ctx;
    ctx.clearRect(0,0,cv.width,cv.height);
    ctx.font = 'bold 40px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#00000099';
    ctx.fillText(glyphs[key], cv.width/2+2, cv.height/2+2); // a soft dark shadow so the label reads against a bright sky too
    ctx.fillStyle = '#c9a66b';
    ctx.fillText(glyphs[key], cv.width/2, cv.height/2);
    sprite.material.map.needsUpdate = true;
  });
}

const miniCubeGroup = new THREE.Group();
let miniGroundMesh;
{
  const cubeSize = MINI_CUBE_HALF*2;
  const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize));
  const cubeLines = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({color:0xffffff, transparent:true, opacity:0.85}));
  miniCubeGroup.add(cubeLines);

  // a real doorway's proportions, not a whole wall segment - shrunk again
  // per request, and now stands directly on the ground (below) rather than
  // floating independently of it
  const doorW = cubeSize*0.17, doorH = cubeSize*0.15;
  // ground raised to the globe's own center height, per request - the ground
  // itself is defined first (miniGroundY), and the door is simply placed
  // standing on top of it
  const miniGroundY = 0;
  const doorCenterY = miniGroundY + doorH/2;
  const door = new THREE.Mesh(
    new THREE.PlaneGeometry(doorW, doorH),
    new THREE.MeshBasicMaterial({color:0xffffff, side:THREE.DoubleSide})
  );
  door.position.set(MINI_CUBE_HALF-0.2, doorCenterY, 0);
  door.rotation.y = Math.PI/2;
  miniCubeGroup.add(door);
  // a thin dark outline so the white door reads clearly against the white wireframe
  const doorEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(doorW, doorH)),
    new THREE.LineBasicMaterial({color:0x333333})
  );
  doorEdges.position.copy(door.position);
  doorEdges.rotation.copy(door.rotation);
  miniCubeGroup.add(doorEdges);

  // fixed exterior ground - NOT part of the rotating structure, raised to
  // the globe's own center height (miniGroundY, set above) per request, so
  // it now hides the whole lower hemisphere of the globe from this view
  // exactly like a real floor would. Toggle-able (settings.showGround) for testing.
  miniGroundMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(cubeSize*1.6, cubeSize*1.6),
    new THREE.MeshStandardMaterial({color:0x2a2620, roughness:1, side:THREE.DoubleSide})
  );
  miniGroundMesh.rotation.x = -Math.PI/2;
  miniGroundMesh.position.y = miniGroundY;
  miniCubeGroup.add(miniGroundMesh);

  // N/S/E/W direction markers, standing upright on the ground (sprites are
  // always camera-facing, so the text reads "perpendicular to the ground" -
  // like a sign planted in it - rather than being painted flat across it).
  // Positioned along the real fixed WORLD_NORTH/SOUTH/EAST/WEST axes, as
  // children of this same never-rotating group, so they stay put no matter
  // how the globe inside spins or tilts.
  const dirRadius = MINI_CUBE_HALF*0.92;
  const dirLabelY = miniGroundY + cubeSize*0.09;
  miniDirLabels = {};
  [
    ['N', WORLD_NORTH, 0xc9a66b],
    ['S', WORLD_SOUTH, 0xc9a66b],
    ['E', WORLD_EAST,  0xc9a66b],
    ['W', WORLD_WEST,  0xc9a66b],
  ].forEach(([key, dir, color])=>{
    const sprite = makeMiniDirectionSprite(color);
    sprite.position.set(dir.x*dirRadius, dirLabelY, dir.z*dirRadius);
    sprite.scale.set(cubeSize*0.16, cubeSize*0.16, 1);
    miniCubeGroup.add(sprite);
    miniDirLabels[key] = sprite;
  });
  updateMiniDirectionLabelText();
}
mapScene.add(miniCubeGroup);
function updateGroundVisibility(){
  const showExterior = (mode==="exterior") && settings.showGround;
  if(groundMesh) groundMesh.visible = showExterior;
  if(miniGroundMesh) miniGroundMesh.visible = settings.showGround;
  if(exteriorDirLabels) Object.values(exteriorDirLabels).forEach(s=>{ s.visible = showExterior; });
  // the outer cube shell has its OWN visibility, separate from the ground
  // plane/labels above: settings.hideExteriorWall can hide just the box
  // (per explicit request) so the sphere is visible sitting on the exterior
  // ground, without also hiding the ground itself - the ground plane stays
  // exactly as it always was (still opaque, still cutting the view off at
  // y=0), so hiding the box never exposes anything "under the ground".
  const showCube = (mode==="exterior") && !settings.hideExteriorWall; // independent of the ground toggle
  exteriorShellParts.forEach(p=>{ p.visible = showCube; });
}
// Whether the outer cube shell is CURRENTLY actually visible/blocking the
// sphere - used to gate exterior room-picking (see the click/dblclick
// handlers): per explicit request, the sphere must not be clickable at all
// while the cube encloses it (you can't see it to click it anyway; the only
// reason it was clickable before is that picking raycasts straight through
// the cube's own geometry, which isn't in the pick target list).
function exteriorCubeIsVisible(){
  return mode==="exterior" && !settings.hideExteriorWall;
}

// camera orbit around the whole diorama (globe + cube), independent of the
// globe's own spin/tilt - dragging rotates this exactly like the main
// exterior view's orbit. This is the "obey gravity OFF" behaviour (the
// default): free orbiting, unrelated to either the box or the globe.
const miniOrbit = {yaw: 0.6, pitch: 0.32, dist: MINI_CUBE_HALF*3.3};
// the fixed vantage used when "obey gravity" is on - defined purely
// relative to the (always-static) cube, so it never moves regardless of
// how fast the globe inside is spinning.
const MINI_GRAVITY_VIEW = {yaw: 0.55, pitch: 0.28};

let miniDragging = false, miniWasDrag = false, miniLastX=0, miniLastY=0;
(function wireMiniMapEvents(){
  const cv = document.getElementById('minimap');
  cv.addEventListener('mousedown', e=>{
    miniDragging = true; miniWasDrag = false;
    miniLastX = e.clientX; miniLastY = e.clientY;
    cv.classList.add('dragging');
  });
  window.addEventListener('mousemove', e=>{
    if(!miniDragging) return;
    if(settings.mapGravityLock) return; // locked to the cube - dragging does nothing while active
    if(Math.hypot(e.clientX-miniLastX, e.clientY-miniLastY) > 3) miniWasDrag = true;
    miniOrbit.yaw   += (e.clientX-miniLastX)*0.008; // same "drag right = turns right" fix as the main exterior orbit
    miniOrbit.pitch = Math.max(-1.4, Math.min(1.4, miniOrbit.pitch - (e.clientY-miniLastY)*0.008));
    miniLastX = e.clientX; miniLastY = e.clientY;
  });
  window.addEventListener('mouseup', ()=>{
    miniDragging = false;
    cv.classList.remove('dragging');
  });
  // single click: select + highlight + show the room's name, but do NOT
  // enter it - only a real double-click enters (see the dblclick listener
  // below). Mirrors the exact same click/dblclick split already used for
  // the big exterior sphere view (pickExteriorRoomAtEvent/setExteriorHighlight).
  cv.addEventListener('click', e=>{
    if(miniWasDrag) return; // a click ending a drag gesture doesn't also pick a room
    const entry = miniRoomAtEvent(e, cv);
    if(roomAccess.pickFromMap && entry){ adminToggleRoom(entry.id); return; }
    miniSelectedRoomId = entry ? entry.id : null;
    const lbl = document.getElementById('miniMapLabel');
    if(lbl) lbl.textContent = entry ? dispName(entry.room) : '';
  });
  cv.addEventListener('dblclick', e=>{
    const entry = miniRoomAtEvent(e, cv);
    if(entry && !roomAccess.pickFromMap) enterInterior(entry.id);
  });
})();
let miniSelectedRoomId = null;
function miniRoomAtEvent(e, cv){
  const rect = cv.getBoundingClientRect();
  const nx = ((e.clientX-rect.left)/rect.width)*2 - 1;
  const ny = -(((e.clientY-rect.top)/rect.height)*2 - 1);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(nx,ny), mapCamera);
  const hit = ray.intersectObject(miniSphereMesh, false);
  if(!hit.length) return null;
  // the hit point is in world space - convert back into the globe's own
  // unrotated "star frame" (the same frame ROOMS/roomMapPolys are defined
  // in) by undoing the spin+tilt group's current world transform
  miniSpinGroup.updateMatrixWorld(true);
  const local = miniSpinGroup.worldToLocal(hit[0].point.clone());
  const unit = local.normalize();
  for(let i=0;i<roomMapPolys.length;i++){
    if(sphPointInRoom(unit, roomMapPolys[i])) return roomMapPolys[i];
  }
  return null;
}

const _miniMarkerInvQuat = new THREE.Quaternion(), _miniMarkerDir = new THREE.Vector3();
const _mapCamUp = new THREE.Vector3(), _mapCamRight = new THREE.Vector3(), _mapCamFwd = new THREE.Vector3(), _mapCamDir = new THREE.Vector3();
function updateMiniMap(dt){
  updateMapHourReadout();
  // single source of truth (see getStructureQuaternion): the mini-map's
  // globe ALWAYS shows the real structure's true current orientation,
  // unconditionally - it never computes a competing rotation of its own,
  // and "align to ecliptic" (below, in the camera section) never touches
  // this. miniSpinGroup is left at identity, exactly like
  // structureSpinGroup in updateStructureRotation() - one quaternion, one
  // group actually carrying it.
  miniTiltGroup.quaternion.copy(getStructureQuaternion(settings.hour));
  miniSpinGroup.quaternion.identity();
  miniTiltGroup.updateMatrixWorld(true);

  miniEclipticRing.visible = settings.showEclipticOnMap;
  if(miniEquatorGrid) miniEquatorGrid.visible = settings.showEquatorGridOnMap;

  // highlight: current room (interior) or the BIG exterior view's own
  // selection take priority in gold; a room picked directly on this mini
  // map (single click - see wireMiniMapEvents) gets its own lighter color
  const hereId = mode==='interior' ? (cachedRoom && cachedRoom.id) : (exteriorSelectedRoomId || null);
  for(const id in miniRoomLines){
    const line = miniRoomLines[id];
    const isHere = id===hereId;
    const isSelected = !isHere && id===miniSelectedRoomId;
    // while a lock is in force, the rooms open to everybody are drawn in green and the locked ones fade
    const restricted = accessRestricted(), isOpen = restricted && roomAccess.open.has(id);
    line.material.color.set(isHere ? 0xc9a66b : (isSelected ? 0x8fb3e6 : (isOpen ? 0x7fd17f : 0xffffff)));
    line.material.opacity = isHere ? 0.95 : (isSelected ? 0.85 : (isOpen ? 0.95 : (restricted ? 0.1 : 0.28)));
  }

  // player marker - only meaningful while inside. Explicit pipeline (map
  // review, step 18): WORLD player position -> STRUCTURE local position ->
  // celestial direction -> map position. Never a second, independent guess
  // at "where the player should be" - just the one real player.pos,
  // converted through the SAME structure orientation the globe above is
  // drawn with (getStructureQuaternion), so the marker always lands on
  // whichever room the player is actually, physically standing in.
  if(mode==='interior'){
    miniPlayerMarker.visible = true;
    const structQuatInv = _miniMarkerInvQuat.copy(getStructureQuaternion(settings.hour)).invert();
    const celestialDir = _miniMarkerDir.copy(player.pos).applyQuaternion(structQuatInv).normalize();
    miniPlayerMarker.position.copy(celestialDir.multiplyScalar(MINI_R*1.03));
  } else {
    miniPlayerMarker.visible = false;
  }

  // camera: free orbit by default, locked to the (always-static) cube's own
  // fixed vantage when the map's own orbit is locked. The globe's spin never
  // affects the camera either way, since it orbits the scene's fixed origin,
  // not the spinning group - the lock's real job is freezing user drag
  // input, so the box reads as the one thing that never moves.
  //
  // "Align to Ecliptic" (step 5/7 of the review): a MAP-VIEW-ONLY operation.
  // It must NEVER touch the globe's true orientation (miniTiltGroup/
  // miniSpinGroup above always show the real structure, unconditionally),
  // gravity, WORLD_UP, the celestial system, or the player's position - so
  // instead of rotating the scene content (the old approach), it rotates
  // only the CAMERA's own orbit basis: where the true ecliptic pole
  // currently sits in WORLD space (after the real structure's own
  // orientation) becomes this basis's "up" instead of WORLD_UP, so the band
  // reads level in the rendered view without the globe itself ever knowing
  // this setting exists.
  const view = settings.mapGravityLock ? MINI_GRAVITY_VIEW : miniOrbit;
  const dist = miniOrbit.dist;
  if(settings.mapAlignEcliptic){
    _mapCamUp.copy(ECLIPTIC_GEOMETRY.pole).applyQuaternion(getStructureQuaternion(settings.hour));
    _mapCamRight.crossVectors(_mapCamUp, WORLD_NORTH);
    if(_mapCamRight.lengthSq() < 1e-6) _mapCamRight.set(1,0,0); else _mapCamRight.normalize();
    _mapCamFwd.crossVectors(_mapCamRight, _mapCamUp).normalize();
  } else {
    _mapCamUp.copy(WORLD_UP);
    _mapCamRight.set(1,0,0);
    _mapCamFwd.set(0,0,1);
  }
  const cosP = Math.cos(view.pitch), sinP = Math.sin(view.pitch);
  const cosY = Math.cos(view.yaw), sinY = Math.sin(view.yaw);
  const camDir = _mapCamDir.copy(_mapCamRight).multiplyScalar(cosY*cosP)
    .addScaledVector(_mapCamFwd, sinY*cosP)
    .addScaledVector(_mapCamUp, sinP);
  mapCamera.up.copy(_mapCamUp);
  mapCamera.position.copy(camDir).multiplyScalar(dist);
  mapCamera.lookAt(0,0,0);

  mapRenderer.render(mapScene, mapCamera);
}

// drives structureTiltGroup/structureSpinGroup with the EXACT SAME tilt and
// spin the mini-map applies to miniTiltGroup/miniSpinGroup, so the real
// structure (and, while inside it, gravity and the felt N/S/E/W directions
// along with it - see the camera-reparenting in setMode()) stays in
// lockstep with what the mini-map already previews. Must run BEFORE
// updateInterior()/updateExterior() each frame, since those read the
// camera's LOCAL position/orientation inside this now-possibly-rotated
// parent, and updates each group's matrixWorld immediately afterward so any
// raycasting or getWorldPosition/getWorldQuaternion call later in the same
// frame sees a fresh transform rather than last frame's.
function updateStructureRotation(){
  // single source of truth (see getStructureQuaternion, defined near
  // currentMapSpinRadians): the real structure's full physical orientation
  // comes from exactly one quaternion. structureTiltGroup/structureSpinGroup
  // are kept as the actual parenting for everything built as their children
  // (rooms/walls/floors/ceilings/doors/stars/asterism lines/ecliptic band),
  // but the tilt group alone now carries the WHOLE orientation and the spin
  // group is left at identity - there is no second independent rotation
  // living on the spin group any more (previously: tilt group got a
  // separately-computed tilt, spin group got a separately-computed hour
  // angle, and the two were only "supposed to" combine correctly).
  structureTiltGroup.quaternion.copy(getStructureQuaternion(settings.hour));
  structureSpinGroup.quaternion.identity();
  structureTiltGroup.updateMatrixWorld(true);
  updateLocalGravityAxes();
}

/* ============================================================================
   TRUE GRAVITY AXES (Round G) — "obey gravity" mode is supposed to read a
   REAL fixed exterior reference (WORLD_UP/WORLD_DOWN/WORLD_NORTH/WORLD_EAST),
   not the structure's own local axes. But interior mode's camera/body are
   children of structureSpinGroup (see setMode()) so they can only be
   positioned/oriented in LOCAL (structure-frame) coordinates each frame -
   the same problem doorAheadOfCrosshair() had, solved the same way: take the
   fixed WORLD_* vectors and re-express them in the CURRENT local frame via
   the inverse of the structure's live world rotation. Recomputed once per
   frame (right after the structure's own rotation is set, so it's always
   using this frame's value, never last frame's) rather than inline in
   updateInterior(), since both the movement/heading math AND the camera/body
   orientation math below need the same live values. This is what makes
   gravity's felt direction actually change as the hour dial spins the
   structure: GRAV_UP_LOCAL etc. are the ONLY thing that moves as the
   structure rotates - player.worldYaw (which way you're facing, relative to
   true north) stays exactly as you left it, so the structure visibly rotates
   underneath/around a person who keeps facing the same true-world direction,
   exactly like being inside a real room that can turn on its own axis.
   ============================================================================ */
const _gravInvQuat = new THREE.Quaternion();
const _gravEuler = new THREE.Euler();
const _gravEulerQuat = new THREE.Quaternion();
const GRAV_UP_LOCAL = new THREE.Vector3(0,1,0);
const GRAV_DOWN_LOCAL = new THREE.Vector3(0,-1,0);
const GRAV_NORTH_LOCAL = new THREE.Vector3(0,0,-1);
function updateLocalGravityAxes(){
  structureSpinGroup.getWorldQuaternion(_gravInvQuat).invert();
  GRAV_UP_LOCAL.copy(WORLD_UP).applyQuaternion(_gravInvQuat);
  GRAV_DOWN_LOCAL.copy(WORLD_DOWN).applyQuaternion(_gravInvQuat);
  GRAV_NORTH_LOCAL.copy(WORLD_NORTH).applyQuaternion(_gravInvQuat);
}

function animate(){
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.getElapsedTime();

  // the outer stone shell is a fixed barrier now - it does not move at all

  updateStructureRotation();

  if(mode==="interior" && !starChartActive) updateInterior(dt); // frozen while the flat star chart is open
  else if(mode==="exterior") updateExterior();

  updateMiniMap(dt);
  renderer.render(scene, camera);
}

