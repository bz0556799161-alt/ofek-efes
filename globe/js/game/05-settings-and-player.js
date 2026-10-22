/* ============================================================================
   SPAWN fallback — used only to give the player object a valid initial
   position before any room has actually been chosen (nobody has "entered"
   yet at load time). The real entry point is always whatever room the
   person selects on the map, via the search box, or by clicking a room on
   the shell in exterior view - there is no fixed/forced entrance anymore.
   ============================================================================ */
const fallbackRoom = roomById["Ori"] || ROOMS[0];

/* ============================================================================
   SETTINGS — user-adjustable preferences and the gravity/time-of-day model.
   ============================================================================ */
const settings = {
  invertMouse: true,   // new default look direction; unchecking the box in
                        // the settings panel restores the original mapping
  northDeg: 30,         // declination of the structure's "north" pole
  hour: 11,             // 0-24, cycles once per structure rotation
  starBrightness: 1.0,  // multiplies both star point size and color intensity
  showAsterismLines: false, // the constellation stick-figure lines, in 3D and in the flat chart
  showEcliptic: true,    // the thick yellow band along the ecliptic (the zodiac wheel's own plane), painted on the star wall of whichever room it passes through
  maxStandSlopeDeg: 45,   // steepest surface (angle from true horizontal) the player can stand on without sliding - adjustable in the settings bar
  walkSpeedMult: 4.5,    // multiplies PLAYER_SPEED - adjustable in the settings bar; a bit above the slider's midpoint (range 0.4-8.0), per request
  lang: 'he',            // 'he' | 'en' - see applyLanguage()
  mapTiltDeg: 23.439291, // the mini 3D map's globe axial tilt, in degrees - defaults to Earth's own (matches the ecliptic pole used elsewhere)
  mapNorthUp: false,     // when true, ignore mapTiltDeg entirely - the mini map's globe spins upright, north pole straight up
  mapAlignEcliptic: false, // when true, rotates ONLY the mini-map's own camera (never the globe's true orientation) so the ecliptic plane (the yellow band) reads flat/horizontal in this view - see updateMiniMap()
  showEquatorGridOnMap: false, // a turquoise latitude/longitude graticule drawn on the mini-map's own globe (rotates with it, not with the fixed exterior) - see buildMiniEquatorGrid()
  showBody: true,        // first-person body visibility - toggle button in the settings panel
  mapGravityLock: false, // when true, the mini map's camera stays fixed relative to the surrounding white cube (the "building"), ignoring the globe's own spin - demonstrates that the structure rotates independently of the fixed exterior it sits in
  showEclipticOnMap: true, // separate from showEcliptic (the 3D/interior one) - the mini map can show or hide its own ecliptic ring independently
  showGround: true,      // the exterior view's fixed ground plane - toggle for testing (see buildGround)
  hideExteriorWall: true, // hides just the outer cube/box shell (not the ground plane) so the sphere itself is visible sitting on the exterior ground - helps show how gravity relates to the structure. See updateGroundVisibility() and the cube-click gating in the exterior click/dblclick handlers.
  showMapControls: true,   // hide/show the whole map-controls panel (tilt/north-up/ecliptic/grid/hour dial)
};

// a room's display name in the current language - constellations already
// have a real Latin/English name (nameLatin) stored per room, so English
// needs no separate translation pass, only the UI chrome does (UI_TEXT).
function dispName(room){
  if(!room) return '';
  return settings.lang==='en' ? (room.nameLatin||room.nameHe) : (room.nameHe||room.nameLatin);
}

const UI_TEXT = {
  he: {
    loading: 'בונה את המבנה הכדורי… (89 חדרים)',
    modeExterior: 'מבט מחוץ למבנה',
    modeInterior: 'מבט מתוך המבנה',
    mapHint: 'גרור כדי לסובב, לחץ על חדר כדי להיכנס',
    setMapTilt: 'נטיית הכדור במפה',
    setMapNorthUp: 'בטל נטיה — צפון תמיד למעלה',
    setMapAlignEcliptic: 'יישר כדור למישור המילקה',
    setShowEquatorGridOnMap: 'הצג רשת משוונית (טורקיז)',
    setShowEclipticOnMap: 'הצג מישור המילקה במפה',
    setMapGravity: 'הישמעות לכח כבידה',
    btnHideMapControls: 'הסתר הגדרות מפה',
    btnShowMapControls: 'הצג הגדרות מפה ⚙',
    btnToInterior: '🌐 מבט מתוך המבנה',
    btnToExterior: '🌐 מבט מחוץ למבנה',
    btnGround: '🟫 הצג קרקע חיצונית',
    btnStoneWall: '🧱 הצג קיר אבן חיצוני',
    btnLines: '✨ הצג / הסתר קווי חיבור בין כוכבים',
    btnEcliptic: '🟡 הצג / הסתר מישור המילקה',
    btnBody: '🧍 הצג דמות גוף',
    btnNoGravity: '🪂 ביטול כבידה',
    btnAdmin: '🔒 ניהול חדרים',
    setStarBrightness: 'בהירות כוכבים',
    setWalkSpeed: 'מהירות הליכה',
    setMaxSlope: 'שיפוע ללא החלקה',
    compassN: 'צפון', compassS: 'דרום', compassE: 'מזרח', compassW: 'מערב',
    setLang: 'שפה',
    langHe: 'עברית',
    langEn: 'English',
    searchPlaceholder: 'חיפוש קבוצת כוכבים…',
    btnSearch: '🔍 חיפוש',
    btnStarChart: '🌌 הצג תבנית כוכבים',
    starChartHint: 'ESC או קליק בכל מקום כדי לסגור',
    btnCloseChart: '✕ סגור',
    setChartArt: 'הצג ציורי קבוצות',
    setChartLines: 'הצג קווי חיבור',
    setChartRotation: 'סיבוב',
    roomLocked: n=>`החדר ${n} נעול`,
    enterDouble: n=>`לחיצה כפולה כדי להיכנס אל ${n}`,
    passThrough: n=>`לחץ כדי לעבור → ${n}`,
    starsCount: n=>`(${n} כוכבים)`,
    exteriorPrompt: 'בחר גבול במפה למטה, או לחץ פעמיים על אזור בכדור כדי להיכנס אליו',
  },
  en: {
    loading: 'Building the spherical structure… (89 rooms)',
    modeExterior: 'View from outside',
    modeInterior: 'View from inside',
    mapHint: 'Drag to rotate, click a room to enter it',
    setMapTilt: 'Globe map tilt',
    setMapNorthUp: 'Cancel tilt — north always up',
    setMapAlignEcliptic: 'Align sphere to the ecliptic plane',
    setShowEquatorGridOnMap: 'Show equator grid (turquoise)',
    setShowEclipticOnMap: 'Show the ecliptic plane on the map',
    setMapGravity: 'Obey gravity',
    btnHideMapControls: 'Hide map settings',
    btnShowMapControls: 'Show map settings ⚙',
    btnToInterior: '🌐 View from inside',
    btnToExterior: '🌐 View from outside',
    btnGround: '🟫 Show exterior ground',
    btnStoneWall: '🧱 Show exterior stone wall',
    btnLines: '✨ Show / hide star connection lines',
    btnEcliptic: '🟡 Show / hide the ecliptic plane',
    btnBody: '🧍 Show body',
    btnNoGravity: '🪂 Gravity off',
    btnAdmin: '🔒 Manage rooms',
    setStarBrightness: 'Star brightness',
    setWalkSpeed: 'Walk speed',
    setMaxSlope: 'Slope without sliding',
    compassN: 'N', compassS: 'S', compassE: 'E', compassW: 'W',
    setLang: 'Language',
    langHe: 'עברית',
    langEn: 'English',
    searchPlaceholder: 'Search for a constellation…',
    btnSearch: '🔍 Search',
    btnStarChart: '🌌 Show star pattern',
    starChartHint: 'ESC or click anywhere to close',
    btnCloseChart: '✕ Close',
    setChartArt: 'Show constellation art',
    setChartLines: 'Show connecting lines',
    setChartRotation: 'Rotation',
    roomLocked: n=>`The room ${n} is locked`,
    enterDouble: n=>`Double-click to enter ${n}`,
    passThrough: n=>`Click to pass through → ${n}`,
    starsCount: n=>`(${n} stars)`,
    exteriorPrompt: 'Pick a boundary on the map below, or double-click an area on the sphere to enter it',
  },
};

function applyLanguage(){
  const t = UI_TEXT[settings.lang] || UI_TEXT.he;
  document.documentElement.lang = settings.lang;
  updateMiniDirectionLabelText(); // mini-map N/S/E/W standing labels - safe to call before the mini map exists, see its own guard
  updateExteriorDirLabelText(); // same, for the main exterior view's ground signs - safe to call before they exist, see its own guard
  if(typeof updateMapHourReadout==='function') updateMapHourReadout(); // otherwise the AM/PM text stays in the old language until the next animation frame
  const setTxt = (id, txt)=>{ const el = document.getElementById(id); if(el && txt!=null) el.textContent = txt; };
  setTxt('loadingOverlay', t.loading);
  setTxt('mapHint', t.mapHint);
  document.getElementById('searchInput').placeholder = t.searchPlaceholder;
  setTxt('btnSearch', t.btnSearch);
  setTxt('btnStarChart', t.btnStarChart);
  setTxt('btnGround', t.btnGround);
  setTxt('btnStoneWall', t.btnStoneWall);
  setTxt('btnLines', t.btnLines);
  setTxt('btnEcliptic', t.btnEcliptic);
  setTxt('btnBody', t.btnBody);
  setTxt('btnNoGravity', t.btnNoGravity);
  setTxt('btnAdmin', t.btnAdmin);
  setTxt('starChartHint', t.starChartHint);
  setTxt('btnCloseChart', t.btnCloseChart);
  updateModeTexts();
  // labels whose text sits in a span or in a text node next to an input
  document.querySelectorAll('#sliderPanel [data-i18n]').forEach(el=>{
    const key = el.getAttribute('data-i18n'); if(t[key]!=null) el.textContent = t[key];
  });
  document.querySelectorAll('#chartControls label[data-i18n], #mapControls label[data-i18n]').forEach(lbl=>{
    const key = lbl.getAttribute('data-i18n');
    const firstNode = lbl.firstChild;
    if(firstNode && firstNode.nodeType===Node.TEXT_NODE) firstNode.textContent = t[key] + '\n    ';
  });
  const showMapBtn = document.getElementById('btnShowMapControls'), hideMapBtn = document.getElementById('btnHideMapControls');
  if(showMapBtn) showMapBtn.textContent = t.btnShowMapControls;
  if(hideMapBtn) hideMapBtn.textContent = t.btnHideMapControls;
  setTxt('setLangHe', t.langHe);
  setTxt('setLangEn', t.langEn);

  // rebuild every baked-canvas-texture piece of text (room labels, door
  // nameplates) and anything currently on screen that shows a room name
  if(typeof rebuildLabels==='function') rebuildLabels();
  if(typeof rebuildDoorSigns==='function') rebuildDoorSigns();
  if(typeof buildSearchList==='function') buildSearchList();
  if(typeof refreshAdminList==='function') refreshAdminList();
  if(starChartActive){
    const r = cachedRoom || (typeof currentRoom==='function' ? currentRoom() : null) || fallbackRoom;
    if(r) drawStarChart(r);
  }
}
// the mode button names the mode you would switch TO; the small label at the
// bottom names the mode you are in now
function updateModeTexts(){
  const t = UI_TEXT[settings.lang] || UI_TEXT.he;
  const btn = document.getElementById('btnMode');
  if(btn) btn.textContent = (mode==='exterior') ? t.btnToInterior : t.btnToExterior;
  const lbl = document.getElementById('modeLabel');
  if(lbl) lbl.textContent = (mode==='exterior') ? t.modeExterior : t.modeInterior;
}

// RA (radians, atan2 form) of Orion's centroid, used as the hour-angle
// reference point: at hour=11 (the default), Orion's hour angle is exactly
// 0 - i.e. Orion is culminating/at the zenith, matching the requirement
// that a person standing under gravity at 11:00 looks "up" toward the core
// through Orion, with Taurus and Eridanus (its real sky neighbours) below it.
const ORION_RA = (function(){
  const c = (roomById["Ori"]||ROOMS[0]).centroid3d;
  return Math.atan2(c[2], c[0]);
})();

// the single global "up" direction (toward the core) used in gravity mode -
// recomputed whenever north/hour change, not per-frame per-position.
const gravityUp = new THREE.Vector3(0,-1,0);
function recomputeGravityUp(){
  const decZ = THREE.MathUtils.degToRad(settings.northDeg);
  const raZ = ORION_RA + THREE.MathUtils.degToRad((settings.hour-11)*15);
  const zenith = new THREE.Vector3(
    Math.cos(decZ)*Math.cos(raZ),
    Math.sin(decZ),
    Math.cos(decZ)*Math.sin(raZ)
  ).normalize();
  gravityUp.copy(zenith).negate(); // "up" points toward the core, same sign convention as -N
}
recomputeGravityUp();

/* ============================================================================
   PLAYER — "planet walker" controller: position constrained to the sphere
   surface, forward kept tangent to it, movement/look computed in the local
   tangent frame so WASD is always relative to where the player is facing
   regardless of where on the sphere they stand.
   ============================================================================ */
let mode = "exterior"; // "exterior" | "interior"
const orbit = {dist: FLOOR_R*3.2, yaw:0.7, pitch:0.4};

/* ============================================================================
   PLAYER — a real 3D capsule, free in WORLD space.

   Architecture (per the rewrite spec): WORLD -> WORLD GRAVITY -> SPHERICAL
   STRUCTURE -> ROOM VOLUME -> PLAYER CAPSULE -> BODY + CAMERA.

   player.pos is the capsule's FEET, a genuine free Vector3 in WORLD
   coordinates (NOT pinned to FLOOR_R, NOT room-local) - it can be anywhere:
   resting on the floor shell (r==FLOOR_R), mid-air inside a room's open
   volume (CEIL_R<r<FLOOR_R), or anywhere its own momentum has carried it.
   player.velocity is the capsule's real WORLD-space velocity; gravity is
   `velocity += WORLD_DOWN * GRAVITY * dt` every frame, unconditionally - the
   sphere is not a planet and there is no per-room "local up" any more.
   "Up" for the body/camera is always WORLD_UP; bodyYaw is a heading measured
   around that one fixed axis (0 = facing WORLD_NORTH), never a rotation of a
   room-local "forward" vector.

   The rotating structure (walls/floor/ceiling, spun by the hour dial via
   structureSpinGroup) is NOT the player's parent any more - camera/body stay
   permanent children of `scene`, always expressed in world space (see
   setMode()). Each physics step converts the player's WORLD position/
   velocity into the structure's CURRENT local frame (a pure rotation, via
   structureSpinGroup's live world quaternion) to test against the existing
   local wall/floor/ceiling geometry, then converts the resolved result back
   to world - so contact is recomputed fresh every frame against wherever the
   (possibly still-turning) structure currently is, and the player is never
   automatically carried along by that rotation. See stepPlayerPhysics().
   ============================================================================ */
const CAPSULE_HEIGHT = EYE_HEIGHT * 1.12; // feet to top of head - a little headroom above the eyes
const player = {
  pos: new THREE.Vector3(...fallbackRoom.centroid3d), // WORLD space, capsule feet
  velocity: new THREE.Vector3(0,0,0),                 // WORLD space, world units/sec
  bodyYaw: 0,        // heading around the fixed WORLD_UP axis (0 = facing WORLD_NORTH)
  pitch: 0,          // look up/down
  walkPhase: 0,      // first-person body walk-cycle phase, see updatePlayerBodyAnimation
  walkBlend: 0,      // 0 = standing pose, 1 = full walk swing, eased between the two
  climbing: false,   // true while gripping a real boundary wall (E/Q) - see stepPlayerPhysics
  supportStable: false,   // true while standing on a surface no steeper than settings.maxStandSlopeDeg
  supportN: new THREE.Vector3(0,1,0), // WORLD space unit normal of that surface (pointing from the surface toward the player)
  supportDot: -2, supportSlopeDeg: null, // cos / degrees of the slope of whatever supports the player right now
  grounded: false,   // true iff this frame's collision resolution actually found floor supporting the capsule against WORLD_DOWN (real contact, not a room-local guess)
  wallStickNormal: new THREE.Vector3(0,1,0), // WORLD space "up" used in gravity-off mode (radial, toward the core); ignored otherwise
};

// ============================================================================
// GRAVITY OFF ("ביטול כבידה"). Ordinary gravity is the fixed WORLD_DOWN. With
// it off, the player walks on the outer stone wall of the structure (the
// shell at FLOOR_R, seen from inside): "up" is the radial direction toward the
// core at the player's own position, so the stone wall under the feet is a
// floor like any other and the very same standing / slope / collision model
// runs on it. The room walls stay solid (doors are used as usual); the star
// wall becomes the sky overhead. player.wallStickNormal holds that "up".
// ============================================================================
let noGravityMode = false;

// A fixed "forward" reference, perpendicular to the given up axis -
// WORLD_NORTH itself whenever up is WORLD_UP (an exact no-op projection,
// since WORLD_NORTH is already perpendicular to WORLD_UP - so normal-mode
// math below is completely unchanged), or WORLD_NORTH projected onto the
// plane perpendicular to a DIFFERENT up (wall-walk mode's current stick
// normal) so player.bodyYaw still measures a real, stable heading there
// too. Falls back to projecting WORLD_EAST instead on the rare occasion
// `up` is itself too close to parallel with WORLD_NORTH for that
// projection to stay meaningful (the same kind of fallback compass-heading
// math already uses near the poles).
function tangentHeadingRef(up){
  let ref = WORLD_NORTH.clone().addScaledVector(up, -WORLD_NORTH.dot(up));
  if(ref.lengthSq() < 0.01) ref = WORLD_EAST.clone().addScaledVector(up, -WORLD_EAST.dot(up));
  return ref.normalize();
}

// Keeps the direction the player is facing while their "up" turns from oldUp
// to newUp (parallel transport by the minimal rotation between them), then
// re-expresses it as bodyYaw about the new up.
const _tfQ = new THREE.Quaternion(), _tfSide = new THREE.Vector3();
function transportHeading(oldUp, newUp){
  const fwd = tangentHeadingRef(oldUp).applyAxisAngle(oldUp, player.bodyYaw);
  _tfQ.setFromUnitVectors(oldUp, newUp);
  fwd.applyQuaternion(_tfQ);
  const ref = tangentHeadingRef(newUp);
  _tfSide.crossVectors(newUp, ref);
  player.bodyYaw = Math.atan2(fwd.dot(_tfSide), fwd.dot(ref));
}
// gravity-off "up": toward the core from where the player stands (the structure
// spins about the origin, so the radial direction is the same in world space)
const _radUp = new THREE.Vector3();
function refreshRadialUp(){
  if(player.pos.lengthSq() < 1e-6) return;
  _radUp.copy(player.pos).normalize().negate();
  if(_radUp.dot(player.wallStickNormal) < 0.9999){
    transportHeading(player.wallStickNormal, _radUp);
    player.wallStickNormal.copy(_radUp);
  }
}
function setNoGravity(on){
  on = !!on;
  if(on === noGravityMode) { updateNoGravityButton(); return; }
  const oldUp = (noGravityMode ? player.wallStickNormal : WORLD_UP).clone();
  noGravityMode = on;
  const newUp = on ? player.pos.clone().normalize().negate() : WORLD_UP.clone();
  if(on) player.wallStickNormal.copy(newUp);
  if(oldUp.dot(newUp) < 0.9999) transportHeading(oldUp, newUp);
  player.supportStable = false; player.grounded = false;
  if(typeof resetCameraSeat==='function') resetCameraSeat();
  updateNoGravityButton();
}
function updateNoGravityButton(){
  const b = document.getElementById('btnNoGravity');
  if(b) b.classList.toggle('active', noGravityMode);
}

let pointerLocked = false;
let cachedRoom = null; // set below, near currentRoom()

function updateBodyVisibility(){
  // the first-person body only makes sense inside, looking down at
  // yourself - and only when the person hasn't hidden it via the settings
  // panel toggle.
  if(playerBodyGroup) playerBodyGroup.visible = (mode==="interior") && settings.showBody;
}
function setMode(m){
  mode = m;
  // interior: camera/body/follow-light become children of structureSpinGroup,
  // so as the structure spins/tilts with the hour, the room the player is
  // standing in - and with it, the felt direction of gravity and "up" - spins
  // and tilts right along with them, exactly like actually being inside a
  // rotating structure. exterior: they go back to being direct children of
  // `scene`, so the orbit camera stays fixed relative to the (also
  // world-fixed) exterior shell/ground, exactly like the mini-map's own
  // camera never moves with the globe it's orbiting. .attach() (not .add())
  // preserves each object's current WORLD transform across the reparent, so
  // there's no visual jump before the next frame's update overwrites it anyway.
  // camera/body/follow-light are now ALWAYS direct children of `scene`, in
  // both modes - the player capsule (see the big PLAYER comment above
  // player's declaration) is a genuine world-space entity, never a child of
  // the rotating structureSpinGroup, so there is nothing to reparent here any
  // more. This is exactly what "the structure keeps rotating, but the player
  // is not automatically carried along with it" requires: if camera/body
  // stayed children of structureSpinGroup, their LOCAL transform would be
  // silently re-interpreted every time the hour dial turned, which is the
  // old (now-removed) behavior.
  document.getElementById('crosshair').style.display = (m==="interior") ? "block":"none";
  updateModeTexts();
  updateModeGroups();
  if(m!=="interior" && document.pointerLockElement) document.exitPointerLock();
  updateBodyVisibility();
  // the reference desert ground only makes sense as a backdrop for the
  // exterior orbit view - inside the sphere its huge flat plane has no
  // business being visible.
  updateGroundVisibility();
  if(m!=="exterior") setExteriorHighlight(null); // clear any single-click room selection
  // the floor's outward (room-colored) vs inward (stone) faces now switch
  // automatically by FrontSide/BackSide culling based on which side of the
  // surface the camera is on - no mode-based visibility toggle needed here.
  if(m!=="interior" && starChartActive) setStarChartView(false); // leaving interior play closes the chart
  updateSkyOverlayVisibility(); // lines/art only ever show for the current room, and only while inside
}

/* ----------------------------------------------------------------------
   "Star chart" inspect view: a flat, static, 2D picture of the room's own
   patch of night sky (its ceiling star pattern), projected the same way a
   printed star chart / planisphere would show a constellation - centered
   gnomonic projection around the room's own centroid, so its shape is not
   distorted the way it would be dragged across a whole-sky map. Movement
   and mouse-look are frozen while it's open: this is meant to be read, not
   explored in 3D.
   ---------------------------------------------------------------------- */
let starChartActive = false;

// classic constellation art (Free Art License, from Stellarium's western
// sky culture), embedded as base64 above - preloaded once up front so it's
// ready the first time the flat star chart opens. These illustrations are
// ONLY ever shown inside that flat "star pattern" chart (never painted into
// the 3D room itself, so walking around never shows them) - the chart has
// its own on/off checkbox for them (chartShowArt, below), along with a
// checkbox for the connecting lines and a rotation slider.
const constellationArtCache = {};
let chartShowArt = true;
let chartRotationDeg = 0;
(function preloadConstellationArt(){
  if(!window.SPHERE_CONSTELLATION_ART) return;
  for(const rid in window.SPHERE_CONSTELLATION_ART){
    const e = window.SPHERE_CONSTELLATION_ART[rid];
    const img = new Image();
    img.onload = ()=>{
      if(starChartActive){
        const r = cachedRoom || currentRoom() || fallbackRoom;
        if(r && r.id===rid) drawStarChart(r);
      }
    };
    img.src = 'data:image/webp;base64,'+e.b64;
    constellationArtCache[rid] = {el: img, w:e.w, h:e.h, anchors:e.anchors};
  }
})();

function drawStarChart(room){
  const cv = document.getElementById('starChartCanvas');
  const S = cv.width;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#03040a';
  ctx.fillRect(0,0,S,S);

  const center = new THREE.Vector3(...room.centroid3d).normalize();
  const upHelper = Math.abs(center.y) < 0.9 ? new THREE.Vector3(0,1,0) : new THREE.Vector3(1,0,0);
  const east0 = new THREE.Vector3().crossVectors(upHelper, center).normalize();
  const north0 = new THREE.Vector3().crossVectors(center, east0).normalize();
  // user-controlled 2D rotation of the whole chart (setChartRotation slider) -
  // just spins the (east,north) tangent-plane basis used for every
  // projection below, so the boundary/lines/art/stars all turn together
  const rot = (chartRotationDeg||0) * (Math.PI/180);
  const cosR = Math.cos(rot), sinR = Math.sin(rot);
  const east = east0.clone().multiplyScalar(cosR).add(north0.clone().multiplyScalar(sinR));
  const north = north0.clone().multiplyScalar(cosR).sub(east0.clone().multiplyScalar(sinR));
  function project(v){
    const n = v.clone().normalize();
    const denom = Math.max(1e-6, n.dot(center));
    return [n.dot(east)/denom, n.dot(north)/denom];
  }

  const boundary2d = room.pts3d.map(p=>project(new THREE.Vector3(...p)));
  let maxExt = 0.001;
  boundary2d.forEach(([x,y])=>{ maxExt = Math.max(maxExt, Math.abs(x), Math.abs(y)); });
  maxExt *= 1.3; // margin around the boundary
  const scale = (S*0.42)/maxExt;
  const cx = S/2, cy = S/2;
  const toPx = ([x,y])=>[cx+x*scale, cy-y*scale];

  // classic constellation artwork (public-domain-style line drawings,
  // Stellarium's western sky culture), warped onto the chart using the
  // real star positions it's anchored to - drawn first/behind everything
  // else, like a background print the lines and stars sit on top of.
  // This flat chart is the ONLY place these illustrations ever appear, and
  // its own checkbox (chartShowArt) turns them on/off here.
  if(chartShowArt){
    const art = constellationArtCache[room.id];
    if(art && art.el.complete && art.el.naturalWidth>0 && art.anchors.length>=2){
      let bestPair=null, bestD=-1;
      for(let i=0;i<art.anchors.length;i++) for(let j=i+1;j<art.anchors.length;j++){
        const a=art.anchors[i], b=art.anchors[j];
        const d = Math.hypot(a.px-b.px, a.py-b.py);
        if(d>bestD){ bestD=d; bestPair=[a,b]; }
      }
      const [a1,a2] = bestPair;
      const anchorPx = (a)=>{
        const ra=a.ra*(Math.PI/12), dec=a.dec*(Math.PI/180);
        const v = new THREE.Vector3(Math.cos(dec)*Math.cos(ra), Math.sin(dec), Math.cos(dec)*Math.sin(ra));
        return toPx(project(v));
      };
      const [t1x,t1y] = anchorPx(a1), [t2x,t2y] = anchorPx(a2);
      const imgDx = a2.px-a1.px, imgDy = a2.py-a1.py;
      const imgLen = Math.hypot(imgDx,imgDy) || 1;
      const tgtLen = Math.hypot(t2x-t1x, t2y-t1y);
      const scaleArt = tgtLen/imgLen;
      const theta = Math.atan2(t2y-t1y, t2x-t1x) - Math.atan2(imgDy, imgDx);
      ctx.save();
      ctx.translate(t1x,t1y);
      ctx.rotate(theta);
      ctx.scale(scaleArt, scaleArt);
      ctx.globalAlpha = 0.5;
      ctx.drawImage(art.el, -a1.px, -a1.py, art.w, art.h);
      ctx.restore();
    }
  }

  // room boundary, drawn like a chart panel border
  ctx.beginPath();
  boundary2d.forEach(([x,y],i)=>{
    const [px,py] = toPx([x,y]);
    if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
  });
  ctx.closePath();
  ctx.fillStyle = 'rgba(201,166,107,0.05)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(201,166,107,0.55)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // the classic constellation stick-figure lines, connecting the real asterism
  // stars - drawn under the stars themselves so the shape reads immediately
  const lines = settings.showAsterismLines ? ((window.SPHERE_ASTERISM_LINES && window.SPHERE_ASTERISM_LINES[room.id]) || []) : [];
  ctx.strokeStyle = 'rgba(220,225,255,0.55)';
  ctx.lineWidth = 1.6;
  lines.forEach(([ra1,dec1,ra2,dec2])=>{
    const v1 = new THREE.Vector3(Math.cos(dec1*Math.PI/180)*Math.cos(ra1*Math.PI/12), Math.sin(dec1*Math.PI/180), Math.cos(dec1*Math.PI/180)*Math.sin(ra1*Math.PI/12));
    const v2 = new THREE.Vector3(Math.cos(dec2*Math.PI/180)*Math.cos(ra2*Math.PI/12), Math.sin(dec2*Math.PI/180), Math.cos(dec2*Math.PI/180)*Math.sin(ra2*Math.PI/12));
    const [p1x,p1y] = toPx(project(v1)), [p2x,p2y] = toPx(project(v2));
    ctx.beginPath(); ctx.moveTo(p1x,p1y); ctx.lineTo(p2x,p2y); ctx.stroke();
  });

  const list = (window.SPHERE_STARS && window.SPHERE_STARS[room.id]) || [];
  list.forEach(star=>{
    const raH=star[0], decD=star[1], mag=star[2], ci=star[3], isMain=star[4]===1;
    const ra = raH*(Math.PI/12), dec = decD*(Math.PI/180);
    const v = new THREE.Vector3(Math.cos(dec)*Math.cos(ra), Math.sin(dec), Math.cos(dec)*Math.sin(ra));
    const [x,y] = project(v);
    const [px,py] = toPx([x,y]);
    const magT = Math.max(0.32, Math.min(1, (6.3-mag)/6.6));
    const [r,g,b] = bvToRGB(ci);
    // the real asterism stars are always bold and near-full-brightness,
    // clearly bigger than the surrounding field, regardless of magnitude -
    // these are the stars that actually trace the constellation's shape
    const t = isMain ? Math.max(magT, 0.78) : magT * 0.45;
    const wMix = 0.15+0.35*t;
    const bright = 0.35 + 0.65*settings.starBrightness; // same curve as the 3D shader, tunable from settings
    const cr = Math.round(Math.min(1,(r*(1-wMix)+wMix)*bright)*255), cg = Math.round(Math.min(1,(g*(1-wMix)+wMix)*bright)*255), cb = Math.round(Math.min(1,(b*(1-wMix)+wMix)*bright)*255);
    const radius = (isMain ? (3.2 + t*7.0) : (1.1 + t*2.2)) * Math.max(0.5, settings.starBrightness);
    const grad = ctx.createRadialGradient(px,py,0,px,py,radius*3.4);
    grad.addColorStop(0, `rgba(${cr},${cg},${cb},0.95)`);
    grad.addColorStop(0.35, `rgba(${cr},${cg},${cb},0.4)`);
    grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(px,py,radius*3.4,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
    ctx.beginPath(); ctx.arc(px,py,radius,0,Math.PI*2); ctx.fill();
  });

  const capT = UI_TEXT[settings.lang] || UI_TEXT.he;
  const bothNames = (settings.lang==='en')
    ? (room.nameHe ? room.nameLatin+' — '+room.nameHe : room.nameLatin)
    : (room.nameHe ? room.nameHe+' — '+room.nameLatin : room.nameLatin);
  document.getElementById('starChartCaption').textContent = bothNames + ' ' + capT.starsCount(list.length);
}
function setStarChartView(on){
  if(on === starChartActive) return;
  starChartActive = on;
  document.getElementById('btnStarChart').classList.toggle('active', starChartActive);
  document.getElementById('starChartOverlay').style.display = on ? 'flex' : 'none';
  if(on){
    if(mode!=="interior") setMode("interior"); // enters at cachedRoom/fallback automatically
    if(document.pointerLockElement) document.exitPointerLock();
    const room = cachedRoom || currentRoom() || fallbackRoom;
    drawStarChart(room);
  }
}

// Which surface holds a player up at the given (structure-LOCAL) direction?
// Gravity is the fixed WORLD_DOWN, so a room hanging overhead is upside-down:
// its outer floor shell is above the player and the STAR WALL is the ground.
// Returns the radius to stand at, the surface normal (pointing into the room)
// in LOCAL space, and its cos-slope against true horizontal - whichever of
// the two shells has the gentler slope.
function restingSurfaceAt(dirLocalIn){
  const dir = dirLocalIn.clone().normalize();
  const upL = worldToLocalDirection(WORLD_UP, settings.hour).normalize();
  const floorSupport = -dir.dot(upL), starWallSupport = dir.dot(upL);
  const onStar = starWallSupport > floorSupport;
  return { radius: onStar ? CEIL_R : FLOOR_R, normal: dir.clone().multiplyScalar(onStar ? 1 : -1), dot: Math.max(floorSupport, starWallSupport) };
}
function applyRestingSupport(res){
  player.supportN.copy(localToWorldDirection(res.normal, settings.hour));
  player.supportDot = res.dot;
  player.supportStable = res.dot >= Math.cos(THREE.MathUtils.degToRad(settings.maxStandSlopeDeg));
}


// Where in a room to stand on entering: the room's centroid, unless the
// ground there is steeper than the no-slide limit - then the flattest spot
// of the room that is clear of its walls (a big room tilts a lot across its
// extent, so some part of it is usually standable even when its centroid is not).

function bestSpawnDirection(room){
  const c = new THREE.Vector3(...room.centroid3d).normalize();
  const limitCos = Math.cos(THREE.MathUtils.degToRad(settings.maxStandSlopeDeg));
  const supportAt = d=>restingSurfaceAt(d).dot;
  const clearAt = (d, clearance)=>{
    const res = restingSurfaceAt(d);
    const w = nearestWallInfo(d.clone().setLength(res.radius));
    return !w || w.dist >= clearance;
  };
  if(supportAt(c) >= limitCos + 0.06 && clearAt(c, BODY_NEAR_RADIUS)) return c;
  const poly = roomPolyById[room.id];
  if(!poly) return c;
  let minX=1e9,maxX=-1e9,minY=1e9,maxY=-1e9;
  poly.local2d.forEach(([x,y])=>{ minX=Math.min(minX,x); maxX=Math.max(maxX,x); minY=Math.min(minY,y); maxY=Math.max(maxY,y); });
  const N = 28, v = new THREE.Vector3();
  // the whole visible body (not just the capsule) must be clear of the walls, then relax if no spot qualifies
  for(const clearance of [BODY_NEAR_RADIUS, PLAYER_RADIUS*3, PLAYER_RADIUS*1.5]){
    let best = null, bestScore = -1e9;
    for(let i=0;i<=N;i++) for(let j=0;j<=N;j++){
      const x = minX + (maxX-minX)*i/N, y = minY + (maxY-minY)*j/N;
      v.copy(poly.center).addScaledVector(poly.east, x).addScaledVector(poly.north, y).normalize();
      if(!sphPointInRoom(v, poly) || !clearAt(v, clearance)) continue;
      const dot = supportAt(v);
      // flatter is better; among near-equal spots prefer the one nearer the centroid
      const score = dot - 0.25*v.angleTo(c);
      if(score > bestScore){ bestScore = score; best = v.clone(); }
    }
    if(best) return best;
  }
  return c;
}

// generalized: enters whichever room id was chosen (map click, search, or a
// click on the shell in exterior view). falls back to the last-known room,
// or the fallback spawn room, if no id is given.
function enterInterior(roomId){
  const room = (roomId && roomById[roomId]) || cachedRoom || fallbackRoom;
  if(typeof canEnterRoom==='function' && !canEnterRoom(room.id)){ showRoomLocked(room.id); return false; }
  // room.centroid3d is STRUCTURE LOCAL data (fixed, never rotated - see the
  // COORDINATE-SPACE CONVERSION API comment). Compute the spawn point
  // entirely in LOCAL space first (resting on the real floor shell, radius
  // FLOOR_R), THEN convert that one final point to WORLD space via the
  // structure's CURRENT orientation - never write LOCAL data straight into
  // player.pos, which is WORLD space.
  // The player is placed at rest, standing, on the surface that actually
  // holds them up in this room (the floor, or the star wall in an upside-down
  // room) - never dropped in from the ceiling.
  const spawnDir = bestSpawnDirection(room);
  const res = restingSurfaceAt(spawnDir);
  const localSpawn = spawnDir.clone().setLength(res.radius);
  player.pos.copy(localToWorldPoint(localSpawn, settings.hour));
  applyRestingSupport(res);
  player.velocity.set(0,0,0);
  player.pitch = 0;
  player.climbing = false;
  noGravityMode = false; // a fresh room entry always starts in ordinary (floor) gravity
  player.wallStickNormal.copy(WORLD_UP);
  updateNoGravityButton();
  resetCameraSeat(); // pick the third-person camera seat afresh in the new room

  // Face away from the nearest wall, not a blind fixed WORLD_NORTH. bodyYaw
  // was never set here before - it just kept whatever value it already had,
  // so a lot of rooms spawned the player facing directly into a wall at
  // point-blank range (WORLD_NORTH has nothing to do with any given room's
  // actual layout). With wall collision now properly solid (see
  // resolveWallCollision3D), that silently made movement feel "stuck" the
  // instant you pressed forward - this fixes the cause, not the symptom.
  // Computed entirely in LOCAL space (nearestWallInfo works in the
  // structure's local frame, like the rest of collision), then the single
  // resulting direction is converted to WORLD once, same conversion-API
  // pattern as everywhere else.
  const localSpawnForFacing = worldToLocalPoint(player.pos, settings.hour);
  const wallInfo = nearestWallInfo(localSpawnForFacing);
  if(wallInfo){
    const closestX = wallInfo.x1 + (wallInfo.x2-wallInfo.x1)*wallInfo.t;
    const closestY = wallInfo.y1 + (wallInfo.y2-wallInfo.y1)*wallInfo.t;
    const closestZ = wallInfo.z1 + (wallInfo.z2-wallInfo.z1)*wallInfo.t;
    const awayLocal = new THREE.Vector3(localSpawnForFacing.x-closestX, localSpawnForFacing.y-closestY, localSpawnForFacing.z-closestZ);
    if(awayLocal.lengthSq() > 1e-8){
      const awayWorld = localToWorldDirection(awayLocal.normalize(), settings.hour);
      // flatten onto the WORLD horizontal plane (perpendicular to WORLD_UP) -
      // bodyYaw is a pure heading, it doesn't carry a vertical component
      const flat = awayWorld.clone().addScaledVector(WORLD_UP, -awayWorld.dot(WORLD_UP));
      if(flat.lengthSq() > 1e-8){
        flat.normalize();
        player.bodyYaw = Math.atan2(-flat.dot(WORLD_EAST), flat.dot(WORLD_NORTH));
      }
    }
  }

  cachedRoom = room;
  setMode("interior");
  renderer.domElement.requestPointerLock();
}
function goHome(){ if(noGravityMode) setNoGravity(false); setMode("exterior"); }
// the right-hand button groups follow the mode: ground / stone wall outside,
// the star, body and gravity controls inside
function updateModeGroups(){
  const out = document.getElementById('grpOutside'), inn = document.getElementById('grpInside');
  if(out) out.style.display = (mode==='exterior') ? 'flex' : 'none';
  if(inn) inn.style.display = (mode==='interior') ? 'flex' : 'none';
}

/* ---- exterior orbit controls ---- */
let dragging=false, lastX=0, lastY=0;
let dragStartX=0, dragStartY=0, wasDrag=false; // distinguishes a rotate-drag from a real click, see click handler below
renderer.domElement.addEventListener('mousedown', e=>{
  if(mode==="exterior"){ dragging=true; lastX=e.clientX; lastY=e.clientY; dragStartX=e.clientX; dragStartY=e.clientY; wasDrag=false; }
  // right-click releases the pointer lock (same as Escape). Handled here too,
  // on 'mousedown' with button 2, not just on 'contextmenu' below - some
  // browsers swallow the 'contextmenu' event entirely while the pointer is
  // locked (no native menu to show), which was silently defeating the
  // contextmenu-only handler and left the cursor hidden.
  if(e.button===2 && document.pointerLockElement) document.exitPointerLock();
});
window.addEventListener('mouseup', ()=>dragging=false);
window.addEventListener('mousemove', e=>{
  if(mode==="exterior" && dragging){
    if(Math.hypot(e.clientX-dragStartX, e.clientY-dragStartY) > 4) wasDrag = true;
    // dragging right should turn the view right (the visible surface tracks
    // the mouse, like spinning a trackball) - this was backwards (verified
    // by projecting a fixed world point through the camera before/after),
    // so the sign here is now "+", not "-".
    orbit.yaw   += (e.clientX-lastX)*0.005;
    orbit.pitch = Math.max(0.08, Math.min(1.45, orbit.pitch - (e.clientY-lastY)*0.005));
    lastX=e.clientX; lastY=e.clientY;
  }
  if(mode==="interior" && pointerLocked && !starChartActive){
    // settings.invertMouse only ever meant "invert looking up/down" (a
    // flight-sim-style vertical preference) - it must NOT also flip
    // left/right turning. It used to multiply the horizontal term too in
    // both branches below, which silently reversed mouse-left/right turning
    // whenever vertical invert was on (which defaults on) - that was the
    // "left/right still isn't right" bug. Horizontal turning is now always
    // computed with a fixed, non-invertable sign; only the vertical
    // pitch term reads settings.invertMouse.
    const invertV = settings.invertMouse ? -1 : 1;
    // heading is a plain world-frame yaw around the fixed WORLD_UP axis - see
    // the big PLAYER comment above. The camera's own orientation (see
    // stepPlayerPhysics) is built from Euler(pitch, bodyYaw, 0, 'YXZ'), whose
    // yaw already turns the camera right for a DEcreasing angle (the
    // standard three.js/PointerLock convention), which is what makes
    // mouse-right correctly turn the view right.
    player.bodyYaw -= e.movementX*0.0022;
    // loosened from the old ±1.25 clamp (~72°) to almost straight up/down -
    // that limit was cutting off the view of the ceiling ("the core wall")
    player.pitch = Math.max(-1.55, Math.min(1.55, player.pitch - invertV * e.movementY*0.0022));
  }
});
renderer.domElement.addEventListener('wheel', e=>{
  if(mode==="exterior"){
    orbit.dist = Math.max(FLOOR_R*1.3, Math.min(FLOOR_R*8, orbit.dist + e.deltaY*(FLOOR_R*0.0025)));
  }
}, {passive:true});
document.addEventListener('pointerlockchange', ()=>{
  pointerLocked = document.pointerLockElement === renderer.domElement;
});

// right-click is a shortcut to release the pointer lock, same as Escape
renderer.domElement.addEventListener('contextmenu', e=>{
  e.preventDefault();
  if(document.pointerLockElement) document.exitPointerLock();
});

const pickRaycaster = new THREE.Raycaster();
const SCREEN_CENTER = new THREE.Vector2(0,0);

// step the player through a door: move them just past it, into whichever
// room they weren't already standing in.

// doorEdgesByPassage[passageIndex] holds one edge PER ROOM that borders the
// passage (normally 2: one contributed by each neighbouring room), and each
// room walked its own boundary polygon independently, in its own winding
// order (see buildWalls()). The same physical opening can therefore come
// back as v0->v1 from one room and the identical segment as v1->v0 from the
// other - this has nothing to do with which room it is (no room, on either
// side of any given door, is guaranteed to walk "the same way"), so it is
// not safe to fix by flipping a specific room's contribution by name. Averaging
// index-wise (v0-of-A with v0-of-B) in that case pairs opposite corners of
// the opening together, which can collapse doorMid/along to the same point
// (and crossDir to a zero vector) instead of averaging the real endpoints of
// the opening. This aligns every edge in the group onto one common direction
// - chosen by nearest-endpoint matching against the first edge, never by
// room name/order - before anything is averaged, so the result no longer
// depends on which order the two rooms happened to be pushed into the array.
function alignedDoorEdges(edges){
  if(!edges || edges.length<2) return edges;
  const ref = edges[0];
  return edges.map((e,i)=>{
    if(i===0) return e;
    const distSame = e.v0.distanceTo(ref.v0) + e.v1.distanceTo(ref.v1);
    const distFlip = e.v0.distanceTo(ref.v1) + e.v1.distanceTo(ref.v0);
    return (distFlip < distSame)
      ? { v0:e.v1, v1:e.v0, top0:e.top1, top1:e.top0, roomId:e.roomId }
      : e;
  });
}
// step the player through a door: a real physical opening in a wall, not an
// arbitrary teleport - the destination is computed from the door's own real
// geometry (doorEdgesByPassage, the same quad the wall/collision mesh is
// built from) plus the player capsule, not a point picked independent of
// either. Body direction is preserved as-is (same real-world facing before
// and after), the player stays at the same real-world height (both floors
// are the same FLOOR_R shell), and velocity is cleared since arriving on
// solid ground through a doorway is not a fall.
function passThroughDoor(passageIndex){
  const p = PASSAGES[passageIndex];
  if(!p) return;
  const roomA = roomById[p.a], roomB = roomById[p.b];
  const otherRoom = (cachedRoom && cachedRoom.id===p.a) ? roomB : roomA;
  if(typeof canEnterRoom==='function' && !canEnterRoom(otherRoom.id)){ showRoomLocked(otherRoom.id); return; }
  const site = doorSites[passageIndex];
  if(!site) return;
  // The door's own real geometry (LOCAL space): its centre on the floor line
  // and the unit direction INTO each of the two rooms it joins (perpendicular
  // to the wall). The destination is simply the doorway's centre, stepped
  // into the other room along that room's own direction.
  const crossDirLocal = site.sideDir[otherRoom.id].clone();
  const doorMid = site.center.clone();
  // Landing spot: the first point on the far side that really is inside the
  // other room's own polygon with the whole capsule clear of every wall. Tried
  // straight through the door first (growing step), then slid sideways along
  // the door; the choice is made by the geometry itself (room membership +
  // measured wall clearance), not by a fixed offset.
  const STEP = PLAYER_RADIUS*2 + 1.5;
  const needClear = PLAYER_RADIUS + 1.0;
  const alongDir = new THREE.Vector3().crossVectors(doorMid.clone().normalize(), crossDirLocal).normalize();
  const otherEntry = roomPolyById[otherRoom.id];
  let newFeetLocal = null, bestFeet = null, bestClear = -1;
  outer:
  for(const lat of [0, 2.5, -2.5, 5, -5]){
    for(let st=STEP; st<=STEP+14; st+=1.0){
      const cand0 = doorMid.clone().addScaledVector(crossDirLocal, st).addScaledVector(alongDir, lat);
      const cand = cand0.clone().setLength(restingSurfaceAt(cand0).radius); // stands on whichever shell really supports the player there (floor, or the star wall in an upside-down room)
      if(otherEntry && !sphPointInRoom(cand.clone().normalize(), otherEntry)) continue;
      const w = nearestWallSurface3D(cand);
      const clear = w ? w.dist : 99;
      if(clear > bestClear){ bestClear = clear; bestFeet = cand; }
      if(clear >= needClear){ newFeetLocal = cand; break outer; }
    }
  }
  if(!newFeetLocal) newFeetLocal = bestFeet || (()=>{ const c = doorMid.clone().addScaledVector(crossDirLocal, STEP); return c.setLength(restingSurfaceAt(c).radius); })();
  applyRestingSupport(restingSurfaceAt(newFeetLocal));

  // ---- the ONE conversion: LOCAL destination -> WORLD, only now ----
  player.pos.copy(localToWorldPoint(newFeetLocal, settings.hour));
  player.velocity.set(0,0,0);
  player.climbing = false;

  // body direction/gaze is preserved as-is; only nudged if it was pointing
  // almost exactly backward through the doorway (walking through in reverse
  // reads oddly otherwise). player.bodyYaw and curFwd are WORLD-space
  // quantities, so the comparison direction (crossDir, "which way is
  // through the door") must be converted to WORLD too before comparing -
  // comparing a WORLD heading against a raw LOCAL direction was exactly the
  // same class of space mismatch as the position bug above.
  const crossDirWorld = localToWorldDirection(crossDirLocal, settings.hour);
  const curFwd = WORLD_NORTH.clone().applyAxisAngle(WORLD_UP, player.bodyYaw);
  if(curFwd.dot(crossDirWorld) < -0.3){
    player.bodyYaw = Math.atan2(-crossDirWorld.dot(WORLD_EAST), crossDirWorld.dot(WORLD_NORTH));
  }
  cachedRoom = otherRoom;
  roomCheckTimer = 0.35;
}

// a reusable outline drawn slightly above the shell surface to mark whichever
// room a single click in exterior view selected - highlight-only, does not
// enter the room (see the click/dblclick split below).
let exteriorHighlightLine = null, exteriorSelectedRoomId = null;
function buildExteriorHighlight(){
  const geo = new THREE.BufferGeometry();
  exteriorHighlightLine = new THREE.LineLoop(geo, new THREE.LineBasicMaterial({color:0xc9a66b, transparent:true, opacity:0.95}));
  exteriorHighlightLine.visible = false;
  exteriorHighlightLine.renderOrder = 10;
  structureSpinGroup.add(exteriorHighlightLine);
}
function setExteriorHighlight(roomId){
  exteriorSelectedRoomId = roomId;
  if(!exteriorHighlightLine) return;
  if(!roomId || !roomById[roomId]){ exteriorHighlightLine.visible = false; return; }
  const room = roomById[roomId];
  const positions = new Float32Array(room.pts3d.length*3);
  room.pts3d.forEach((p,i)=>{
    const v = new THREE.Vector3(...p).normalize().multiplyScalar(FLOOR_R*1.006);
    positions[i*3]=v.x; positions[i*3+1]=v.y; positions[i*3+2]=v.z;
  });
  exteriorHighlightLine.geometry.dispose();
  exteriorHighlightLine.geometry = new THREE.BufferGeometry();
  exteriorHighlightLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
  exteriorHighlightLine.visible = true;
}

function pickExteriorRoomAtEvent(e){
  const mouseN = new THREE.Vector2(
    (e.clientX/innerWidth)*2-1,
    -(e.clientY/innerHeight)*2+1
  );
  pickRaycaster.setFromCamera(mouseN, camera);
  const hit = pickRaycaster.intersectObject(floorMesh, false)[0];
  return hit ? roomIdForFloorVertex(hit.face.a) : null;
}

// raycasts from the crosshair and returns the door directly ahead, but only
// if nothing (a wall) is in the way first - doors aren't included in the
// wall's own occlusion, so without this check a door far away in another
// room, behind the wall the crosshair is actually resting on, could still
// register as "hit" and wrongly prompt to pass through it. A reach-distance
// cap is just as important: with no cap, looking at open sky (no nearby
// wall to stop the ray at all) lets the ray sail on and hit whatever door
// happens to line up far across the whole structure, in a totally
// unrelated, non-adjacent room - a real "why can I walk into Hydra from
// Aries" bug, not just an occlusion one.
const DOOR_REACH = 28; // world units - widened after 16 still read as "only works standing right up against it" in real play; a comfortably generous walking-up distance at this room scale (FLOOR_R=200, WALL_HEIGHT≈33.6)
// A strict pixel-perfect raycast from the exact crosshair pixel kept
// reading as "doors don't work"/"can't pass between rooms" in real play -
// aiming dead-center on a specific door panel from a moving first-person
// camera is genuinely fiddly, and any tiny miss (or the ray grazing the
// boundary wall mesh right next to the door) silently returned nothing.
// This is deliberately far more forgiving: instead of one exact ray, it
// checks every door within reach and roughly in front of the player (a
// wide facing cone, not a single pixel), picks whichever is most
// dead-ahead, and only then confirms the boundary wall isn't genuinely
// standing between the player and it.
const DOOR_FACING_COS = 0.4; // ~66 degrees half-angle - widened further, generous, not pixel-precise
// closest point on the door's actual planar quad (both along the wall AND
// up its height) to a given point - using only the base edge (floor level)
// badly mismatched the player's actual eye height (EYE_HEIGHT is tall
// relative to how close a player naturally stands - a door only ~1-3 units
// away at floor level sits almost straight down from a standing eye, so
// requiring the look direction to line up with that floor-level point
// made "facing" fail even when someone was plainly looking right at the
// door). Working in the quad's own (e1,e2) basis and clamping both axes
// finds the point that actually matches both the player's sideways position
// AND their eye height along the door, which is what "looking at the door"
// really means.
function closestPointOnQuad(p, quad){
  const rel = p.clone().sub(quad.v0);
  const u = THREE.MathUtils.clamp(rel.dot(quad.e1), 0, quad.w);
  const v = THREE.MathUtils.clamp(rel.dot(quad.e2), 0, quad.h);
  return quad.v0.clone().add(quad.e1.clone().multiplyScalar(u)).add(quad.e2.clone().multiplyScalar(v));
}
const _doorRayQuat = new THREE.Quaternion();
function doorAheadOfCrosshair(){
  // camera is now a permanent WORLD-space child of `scene` (see setMode()),
  // so camera.position/quaternion ARE the world-space eye/look direction
  // directly - no local->world conversion needed for the two real raycasts.
  // doorMeshes themselves are still children of the (rotating)
  // structureSpinGroup, built in ITS local frame, so the fallback quad test
  // below (closestPointOnQuad, which works in that local frame) needs the
  // eye converted the other way, into structure-local space.
  const eyeWorld = camera.position;
  const lookDirWorld = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
  structureSpinGroup.getWorldQuaternion(_doorRayQuat).invert(); // world -> local
  const eye = eyeWorld.clone().applyQuaternion(_doorRayQuat);
  const lookDir = lookDirWorld.clone().applyQuaternion(_doorRayQuat);
  const _doorFwdQuat = _doorRayQuat.clone().invert(); // local -> world, for the occlusion raycast below

  // Only consider doors that actually belong to the room the player is
  // currently standing in. Several small rooms can meet right at a shared
  // corner (especially near the poles), and with a generous reach + wide
  // facing cone a door belonging to two OTHER neighbouring rooms can end up
  // technically within reach and roughly ahead even though it has nothing
  // to do with the room the player is in - this would let a click at just
  // the wrong corner teleport the player into an unrelated, non-adjacent
  // room. Restricting to the current room's own passages first is a hard
  // correctness guarantee, not a fuzzy one, and it costs nothing for the
  // normal case (a room's own doors are always in this list).
  const hereId = (cachedRoom && cachedRoom.id) || (currentRoom() && currentRoom().id);
  const roomDoorMeshes = hereId
    ? doorMeshes.filter(m=>{
        const pg = PASSAGES[m.userData.passageIndex];
        return pg && (pg.a===hereId || pg.b===hereId);
      })
    : doorMeshes;

  // Primary check: a real raycast straight down the crosshair against the
  // door panels' actual geometry. This is what "looking at the door" means
  // in an FPS view, and - unlike a facing-cone-to-nearest-point check - it
  // can never fail for a player who is plainly aiming right at the door,
  // even when standing close to a corner of a large panel (a nearest-point
  // check can pick a corner that isn't in the look direction at all, and
  // wrongly report "not facing it" even though the crosshair is squarely on
  // the door). Door panels are large (span the whole wall segment between
  // two rooms), so this is easy to land on whenever the right wall is in view.
  pickRaycaster.set(eyeWorld, lookDirWorld);
  pickRaycaster.far = DOOR_REACH;
  const directHits = pickRaycaster.intersectObjects(roomDoorMeshes, false);
  pickRaycaster.far = Infinity;
  if(directHits.length){
    return {object: directHits[0].object};
  }

  // Fallback: the player is close to and roughly facing a door but not
  // pixel-precisely aimed at it (e.g. looking slightly to one side while
  // walking up). Forgiving reach + wide facing cone against the door's
  // actual planar quad (both along the wall AND up its height, matched to
  // eye height, not just the floor-level base edge).
  let best = null, bestScore = -Infinity;
  for(let i=0;i<roomDoorMeshes.length;i++){
    const mesh = roomDoorMeshes[i];
    const quad = mesh.userData.quad;
    if(!quad) continue;
    const nearPt = closestPointOnQuad(eye, quad);
    const toDoor = nearPt.clone().sub(eye);
    const eyeDist = toDoor.length();
    if(eyeDist > DOOR_REACH) continue;
    const dirToDoor = eyeDist>1e-6 ? toDoor.multiplyScalar(1/eyeDist) : lookDir;
    const facing = dirToDoor.dot(lookDir);
    if(facing < DOOR_FACING_COS) continue;
    // occlusion: make sure the boundary wall (not this door) isn't
    // genuinely standing between the player and this particular door. The
    // margin held back from the target is deliberately generous (not just
    // enough to dodge the door's own geometry) - near tightly-packed
    // boundaries (e.g. several small rooms meeting near a pole), a ray aimed
    // at a door can graze a neighboring wall segment's edge right next to
    // it, which at a small margin registered as a false "blocked", making a
    // door the player was plainly looking straight at silently fail.
    if(wallMesh){
      const dirToDoorWorld = dirToDoor.clone().applyQuaternion(_doorFwdQuat);
      pickRaycaster.set(eyeWorld, dirToDoorWorld);
      pickRaycaster.far = Math.max(0.1, eyeDist - 2.0);
      const blockers = pickRaycaster.intersectObject(wallMesh, false);
      pickRaycaster.far = Infinity;
      if(blockers.length) continue;
    }
    const score = facing - eyeDist*0.01; // prefer whichever is most dead-ahead, then closest
    if(score > bestScore){ bestScore = score; best = mesh; }
  }
  return best ? {object: best} : null;
}

renderer.domElement.addEventListener('click', e=>{
  if(mode==="interior" && !pointerLocked){ renderer.domElement.requestPointerLock(); return; }
  if(mode==="interior" && pointerLocked){
    // doors are solid objects you interact with - aim the crosshair at one
    // and click to step through into the room on the other side.
    const hit = doorAheadOfCrosshair();
    if(hit) passThroughDoor(hit.object.userData.passageIndex);
    return;
  }
  if(mode==="exterior" && floorMesh && !exteriorCubeIsVisible()){
    // a click that ends a rotate-drag gesture must NOT be treated as picking
    // a room - this used to open whatever room happened to be under the
    // cursor when the mouse was released after spinning the sphere.
    if(wasDrag){ wasDrag = false; return; }
    // single click only selects/highlights + labels the room; it takes a
    // real double-click (below) to actually enter it.
    const roomId = pickExteriorRoomAtEvent(e);
    if(roomAccess.pickFromMap && roomId){ adminToggleRoom(roomId); return; }
    setExteriorHighlight(roomId);
  }
});
renderer.domElement.addEventListener('dblclick', e=>{
  if(mode!=="exterior" || !floorMesh || exteriorCubeIsVisible()) return;
  const roomId = pickExteriorRoomAtEvent(e);
  if(roomId && !roomAccess.pickFromMap) enterInterior(roomId);
});

const keys = {};
window.addEventListener('keydown', e=>{
  keys[e.code]=true;
  if(e.code==="Escape" && starChartActive){ setStarChartView(false); return; }
  if(e.code==="Escape" && document.pointerLockElement) document.exitPointerLock();
  if(e.code==="Space" && mode==="interior") e.preventDefault(); // don't let the page scroll while jumping
});
window.addEventListener('keyup', e=>keys[e.code]=false);

/* ---- collision: push player away from nearby (non-gapped) boundary walls ---- */
// flat typed array of wall segment endpoints for a cheap per-frame proximity test
const collSegs = [];
// index (in units of segments, i.e. collSegs.length/6 at the split point) at
// which the wall-only segments end and the door segments begin - set by
// buildCollisionSegs(). Lets climbing tell "a real boundary wall" apart from
// "a door", per the user's explicit "רק אם זה קיר של גבול בין חדרים" request.
let wallOnlySegCount = 0;
// NOTE: must run from init(), AFTER buildWalls()/buildDoors() have actually
// populated wallPositions/doorEdgesByPassage - this used to be an IIFE that
// ran immediately at parse time (before those arrays existed), silently
// leaving collision completely empty. Now a real function, called from init().
function buildCollisionSegs(){
  for(let i=0;i<wallPositions.length;i+=18){ // 2 tris * 3 verts * 3 floats = 18 per quad
    collSegs.push(wallPositions[i],wallPositions[i+1],wallPositions[i+2],  // v0
                  wallPositions[i+3],wallPositions[i+4],wallPositions[i+5]); // v1
  }
  wallOnlySegCount = collSegs.length/6;
  // doors are solid too - you can't just walk through the gap, you have to
  // click the door (see passThroughDoor) to pass into the next room.
  Object.values(doorEdgesByPassage).forEach(edges=>{
    edges.forEach(seg=>{
      collSegs.push(seg.v0.x,seg.v0.y,seg.v0.z, seg.v1.x,seg.v1.y,seg.v1.z);
    });
  });
}
// This used to be 1.4, a leftover from the old procedural body (which was
// built narrow). The real GLB model is wider than that: measured directly
// off the loaded rig in its standing pose, shoulder-to-shoulder (LeftArm to
// RightArm world distance) is ~3.47 units, i.e. a ~1.73 half-width - bigger
// than the old 1.4 collision radius. With the smaller radius, the capsule
// (and therefore player.pos, which everything else - including the third-
// person camera's own wall pullback - is derived from) could stop centered
// close enough to a wall that the visibly WIDER mesh still clipped through
// it, exactly what was reported. The collision radius has to bound the
// actual visible body, not an arbitrary smaller number, so it's raised to
// 2.0 - the measured 1.73 half-width plus a small margin for sleeve/fabric
// geometry that extends slightly past the bare shoulder-joint position.
// Doors are unaffected by this: they are already fully solid to ordinary
// walking regardless of radius (see buildSolidTris above) - the only way
// through one is the explicit click/passThroughDoor() interaction, so a
// wider capsule cannot make any doorway newly impassable.
const PLAYER_RADIUS = 2.0;
const THIRD_PERSON_CAM_RADIUS = PLAYER_RADIUS*1.1; // how far to pull the third-person camera off a wall it would otherwise clip into
const _camFwdQuat = new THREE.Quaternion(), _camInvQuat = new THREE.Quaternion(), _camLocalPos = new THREE.Vector3(); // scratch for resolveCameraWallPush's local-frame conversion, see the camera block in updateInterior

