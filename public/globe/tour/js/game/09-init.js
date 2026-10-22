/* ============================================================================
   INIT
   ============================================================================ */
function buildSearchList(){
  const dl = document.getElementById('roomList');
  const names = ROOMS.map(r=>dispName(r)).sort((a,b)=>a.localeCompare(b, settings.lang==='en'?'en':'he'));
  dl.innerHTML = names.map(n=>`<option value="${n}"></option>`).join('');
}
function findRoomByName(text){
  const q = (text||'').trim();
  if(!q) return null;
  const exact = ROOMS.find(r=>dispName(r)===q || r.nameHe===q || r.nameLatin===q || r.id===q);
  if(exact) return exact;
  const ql = q.toLowerCase();
  const partial = ROOMS.find(r=>(r.nameHe&&r.nameHe.includes(q)) || r.nameLatin.toLowerCase().includes(ql));
  return partial || null;
}

/* ---- default hour and slope limit ----
   Orion is the room the "view from inside" button enters. With gravity fixed
   (WORLD_DOWN) and the structure tilted/spun by the hour, a room near the
   celestial equator is steep at every hour: Orion's flattest surface is ~57
   degrees from horizontal, and at the old default hour (11:00) it was ~88
   degrees, i.e. a vertical wall - entering it meant sliding straight off. So
   the structure starts at the hour where Orion is flattest, and the default
   no-slide slope limit starts just above that angle (both remain adjustable). */
(function chooseDefaults(){
  const room = roomById['Ori']; if(!room) return;
  const dir = new THREE.Vector3(...room.centroid3d).normalize();
  let bestH = settings.hour, bestD = -1;
  for(let h=0; h<24; h+=0.25){
    const d = Math.abs(dir.dot(worldToLocalDirection(WORLD_UP, h).normalize()));
    if(d > bestD){ bestD = d; bestH = h; }
  }
  settings.hour = bestH;
  const slopeDeg = THREE.MathUtils.radToDeg(Math.acos(Math.min(1, bestD)));
  settings.maxStandSlopeDeg = Math.max(settings.maxStandSlopeDeg, Math.ceil(slopeDeg) + 3);
  recomputeGravityUp();
})();

function init(){
  buildMapPolys(); // first: walls need each room's real polygon to know which side of every edge is its interior
  buildFloors();
  buildWalls();
  buildDoors();
  buildCeilings();
  buildStars();
  buildAsterismLines();
  buildEclipticBand();
  buildCollisionSegs();
  buildSolidTris();
  buildLabels();
  buildAtmosphere();
  buildGround();
  buildExteriorDirLabels();
  buildExteriorShell();
  buildSearchList();
  buildExteriorHighlight();
  setMode(mode);
  applyLanguage();
  document.getElementById('loadingOverlay').style.display='none';
  animate();
}

window.addEventListener('resize', ()=>{
  camera.aspect = innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

document.getElementById('btnStarChart').onclick = ()=> setStarChartView(!starChartActive);
document.getElementById('btnCloseChart').onclick = ()=> setStarChartView(false);
document.getElementById('starChartOverlay').addEventListener('click', e=>{
  if(e.target.id==='starChartOverlay') setStarChartView(false); // click on the backdrop, not the canvas/button
});

/* ---- right-hand menu: every option is a toggle button styled like the
   search button (outline in the accent colour while active) ---- */
(function wireMenu(){
  const $ = id=>document.getElementById(id);
  // look direction: inverted by default, no option to change it
  settings.invertMouse = true;

  // mode switch: the button names the mode you would go to
  $('btnMode').addEventListener('click', ()=>{
    if(mode==='exterior'){
      const id = (typeof defaultEntryRoomId==='function') ? defaultEntryRoomId() : 'Ori';
      if(id) enterInterior(id);
    } else {
      goHome();
    }
  });

  // outside view
  const bGround = $('btnGround'), bWall = $('btnStoneWall');
  bGround.classList.toggle('active', settings.showGround);
  bWall.classList.toggle('active', !settings.hideExteriorWall);
  bGround.addEventListener('click', ()=>{
    settings.showGround = !settings.showGround;
    bGround.classList.toggle('active', settings.showGround);
    updateGroundVisibility();
  });
  bWall.addEventListener('click', ()=>{
    settings.hideExteriorWall = !settings.hideExteriorWall;
    bWall.classList.toggle('active', !settings.hideExteriorWall);
    updateGroundVisibility();
  });

  // inside view
  const bLines = $('btnLines'), bEcl = $('btnEcliptic'), bBody = $('btnBody'), bNoGrav = $('btnNoGravity');
  bLines.classList.toggle('active', settings.showAsterismLines);
  bEcl.classList.toggle('active', settings.showEcliptic);
  bBody.classList.toggle('active', settings.showBody);
  bLines.addEventListener('click', ()=>{
    settings.showAsterismLines = !settings.showAsterismLines;
    bLines.classList.toggle('active', settings.showAsterismLines);
    const chartCb = $('setChartLines'); // the star chart's own checkbox is the same underlying setting
    if(chartCb) chartCb.checked = settings.showAsterismLines;
    updateSkyOverlayVisibility();
    if(starChartActive) drawStarChart(cachedRoom || currentRoom() || fallbackRoom);
  });
  bEcl.addEventListener('click', ()=>{
    settings.showEcliptic = !settings.showEcliptic;
    bEcl.classList.toggle('active', settings.showEcliptic);
    updateSkyOverlayVisibility();
  });
  bBody.addEventListener('click', ()=>{
    settings.showBody = !settings.showBody;
    bBody.classList.toggle('active', settings.showBody);
    updateBodyVisibility();
  });
  bNoGrav.addEventListener('click', ()=>{
    if(mode!=='interior') return;
    setNoGravity(!noGravityMode);
  });

  // the three sliders
  const brightness = $('setStarBrightness'), walkSpeed = $('setWalkSpeed');
  brightness.value = settings.starBrightness;
  walkSpeed.value = settings.walkSpeedMult;
  brightness.addEventListener('input', ()=>{
    const v = parseFloat(brightness.value);
    if(!isNaN(v)){
      settings.starBrightness = v;
      if(starMaterial) starMaterial.uniforms.uBrightness.value = v;
    }
  });
  walkSpeed.addEventListener('input', ()=>{
    const v = parseFloat(walkSpeed.value);
    if(!isNaN(v)) settings.walkSpeedMult = v;
  });
  const slopeEl = $('setMaxSlope'), slopeVal = $('setMaxSlopeVal');
  slopeEl.value = settings.maxStandSlopeDeg;
  slopeVal.textContent = settings.maxStandSlopeDeg + '°';
  slopeEl.addEventListener('input', ()=>{
    const v = parseFloat(slopeEl.value);
    if(!isNaN(v)){ settings.maxStandSlopeDeg = v; slopeVal.textContent = v + '°'; }
  });

  // language
  const langHe = $('setLangHe'), langEn = $('setLangEn');
  function updateLangButtons(){
    langHe.classList.toggle('active', settings.lang==='he');
    langEn.classList.toggle('active', settings.lang==='en');
  }
  updateLangButtons();
  langHe.addEventListener('click', ()=>{ if(settings.lang!=='he'){ settings.lang='he'; updateLangButtons(); applyLanguage(); } });
  langEn.addEventListener('click', ()=>{ if(settings.lang!=='en'){ settings.lang='en'; updateLangButtons(); applyLanguage(); } });
})();

/* ---- mini map's own controls: axial tilt (default Earth's), a north-up
   override, and the "obey gravity" camera-lock toggle ---- */
(function wireMiniMapControls(){
  const tilt = document.getElementById('setMapTilt');
  const northUp = document.getElementById('setMapNorthUp');
  const gravBtn = document.getElementById('setMapGravity');
  if(!tilt || !northUp || !gravBtn) return;
  tilt.value = settings.mapTiltDeg;
  northUp.checked = settings.mapNorthUp;
  tilt.disabled = settings.mapNorthUp;
  gravBtn.checked = settings.mapGravityLock;
  tilt.addEventListener('input', ()=>{
    const v = parseFloat(tilt.value);
    if(!isNaN(v)) settings.mapTiltDeg = v;
  });
  northUp.addEventListener('change', ()=>{
    settings.mapNorthUp = northUp.checked;
    tilt.disabled = settings.mapNorthUp;
  });
  gravBtn.addEventListener('change', ()=>{ settings.mapGravityLock = gravBtn.checked; });
  // ecliptic-on-map toggle (section 10) - deliberately its own separate
  // setting from the 3D interior view's settings.showEcliptic, per the spec;
  // updateMiniMap(dt) just reads settings.showEclipticOnMap every frame.
  const eclOnMap = document.getElementById('setShowEclipticOnMap');
  if(eclOnMap){
    eclOnMap.checked = settings.showEclipticOnMap;
    eclOnMap.addEventListener('change', ()=>{ settings.showEclipticOnMap = eclOnMap.checked; });
  }
  // "align to ecliptic" - a map-VIEW-only camera rotation (see
  // updateMiniMap()), never a change to the globe's true orientation; the
  // tilt slider/north-up checkbox are just disabled meanwhile so they don't
  // read as "doing something" while this camera-level override is active.
  const alignEcl = document.getElementById('setMapAlignEcliptic');
  const mapTiltInput = document.getElementById('setMapTilt');
  const mapNorthUpInput = document.getElementById('setMapNorthUp');
  if(alignEcl){
    alignEcl.checked = settings.mapAlignEcliptic;
    alignEcl.addEventListener('change', ()=>{
      settings.mapAlignEcliptic = alignEcl.checked;
      if(mapTiltInput) mapTiltInput.disabled = settings.mapAlignEcliptic;
      if(mapNorthUpInput) mapNorthUpInput.disabled = settings.mapAlignEcliptic;
    });
  }
  // turquoise equatorial grid toggle (Round G)
  const eqGrid = document.getElementById('setShowEquatorGridOnMap');
  if(eqGrid){
    eqGrid.checked = settings.showEquatorGridOnMap;
    eqGrid.addEventListener('change', ()=>{ settings.showEquatorGridOnMap = eqGrid.checked; });
  }
  // hide/show the whole map-controls panel (Round G)
  const hideMapBtn = document.getElementById('btnHideMapControls');
  const showMapBtn = document.getElementById('btnShowMapControls');
  const mapControlsPanel = document.getElementById('mapControls');
  const mapHintEl = document.getElementById('mapHint');
  function setMapControlsVisible(v){
    settings.showMapControls = v;
    if(mapControlsPanel) mapControlsPanel.style.display = v ? 'flex' : 'none';
    if(showMapBtn) showMapBtn.style.display = v ? 'none' : 'block';
    if(mapHintEl) mapHintEl.classList.toggle('hidden', !v); // the "drag to rotate" hint belongs to the settings panel
  }
  if(hideMapBtn) hideMapBtn.addEventListener('click', ()=> setMapControlsVisible(false));
  if(showMapBtn) showMapBtn.addEventListener('click', ()=> setMapControlsVisible(true));
  // clicking the hour readout itself lets you type a specific hour directly
  // (per request), instead of only dragging the dial
  const hourReadoutEl = document.getElementById('mapHourReadout');
  if(hourReadoutEl){
    hourReadoutEl.style.cursor = 'pointer';
    hourReadoutEl.addEventListener('click', ()=>{
      const raw = window.prompt('הזן שעה (למשל 14 או 14:30):', formatHour12(currentDisplayHour()));
      if(raw==null) return;
      const m = raw.trim().match(/^(\d{1,2})(?::(\d{1,2}))?\s*(AM|PM|am|pm|לפנה["״]?צ|אחה["״]?צ)?$/);
      if(!m) return;
      let h = parseInt(m[1],10), mm = m[2]?parseInt(m[2],10):0;
      const suffix = (m[3]||'').toLowerCase();
      if(suffix.startsWith('pm') || suffix.startsWith('אחה')){ if(h<12) h+=12; }
      else if(suffix.startsWith('am') || suffix.startsWith('לפנה')){ if(h===12) h=0; }
      if(isNaN(h)) return;
      settings.hour = h + (isNaN(mm)?0:mm)/60;
      updateMapHourReadout();
    });
  }

  // manual 24-hour dial: a round clock-style dial instead of a linear
  // slider, so it can be spun around as many times as wanted (settings.hour
  // is never clamped to 0-24 - it just keeps accumulating, and only gets
  // wrapped for display/spin purposes, both of which are naturally
  // periodic anyway). "Follow real clock" mode has been removed per
  // request - the default is simply a fixed hour=11 until the person drags
  // the dial themselves.
  const hourDial = document.getElementById('hourDial');
  if(hourDial){
    hourDial.style.opacity = 1;

    // angle measured from the dial's own center, 0 at the top (12 o'clock),
    // increasing clockwise - matches how the hand itself is drawn/rotated.
    function angleFromEvent(e){
      const rect = hourDial.getBoundingClientRect();
      const cx = rect.left + rect.width/2, cy = rect.top + rect.height/2;
      return Math.atan2(e.clientX-cx, -(e.clientY-cy));
    }
    let dragging = false, lastAngle = 0;
    function startDrag(e){
      dragging = true;
      lastAngle = angleFromEvent(e);
      e.preventDefault();
    }
    function moveDrag(e){
      if(!dragging) return;
      const a = angleFromEvent(e);
      // shortest signed angular step from lastAngle to a, so spinning all
      // the way around (multiple times, in either direction) accumulates
      // smoothly instead of jumping back through zero.
      let delta = a - lastAngle;
      while(delta > Math.PI) delta -= Math.PI*2;
      while(delta < -Math.PI) delta += Math.PI*2;
      settings.hour += delta * (24/(Math.PI*2));
      lastAngle = a;
      recomputeGravityUp();
      updateMapHourReadout();
    }
    function endDrag(){ dragging = false; }
    hourDial.addEventListener('mousedown', startDrag);
    window.addEventListener('mousemove', moveDrag);
    window.addEventListener('mouseup', endDrag);
    hourDial.addEventListener('touchstart', e=>startDrag(e.touches[0]), {passive:false});
    window.addEventListener('touchmove', e=>{ if(dragging){ moveDrag(e.touches[0]); e.preventDefault(); } }, {passive:false});
    window.addEventListener('touchend', endDrag);

    updateMapHourReadout();
  }
})();

/* ---- star-chart's own controls: art on/off, connecting lines on/off (the
   SAME shared setting as the 3D view / settings panel), and a rotation
   slider for the flat chart itself ---- */
(function wireChartControls(){
  const chartArt = document.getElementById('setChartArt');
  const chartLines = document.getElementById('setChartLines');
  const chartRot = document.getElementById('setChartRotation');
  if(!chartArt || !chartLines || !chartRot) return;
  chartArt.checked = chartShowArt;
  chartLines.checked = settings.showAsterismLines;
  chartRot.value = chartRotationDeg;
  function redraw(){
    if(!starChartActive) return;
    const room = cachedRoom || currentRoom() || fallbackRoom;
    drawStarChart(room);
  }
  chartArt.addEventListener('change', ()=>{ chartShowArt = chartArt.checked; redraw(); });
  chartLines.addEventListener('change', ()=>{
    settings.showAsterismLines = chartLines.checked;
    // keep the settings-panel checkbox in sync too, since this is the same setting
    const panelCb = document.getElementById('setShowAsterismLines');
    if(panelCb) panelCb.checked = settings.showAsterismLines;
    updateSkyOverlayVisibility();
    redraw();
  });
  chartRot.addEventListener('input', ()=>{
    chartRotationDeg = parseFloat(chartRot.value)||0;
    redraw();
  });
})();

/* ---- standalone search toggle (moved out of settings: a dedicated button
   that reveals/hides the search field itself, active state = visible) ---- */
(function wireSearchToggle(){
  const btn = document.getElementById('btnSearch');
  const box = document.getElementById('searchBox');
  let searchVisible = false;
  box.style.display = 'none';
  btn.addEventListener('click', ()=>{
    searchVisible = !searchVisible;
    btn.classList.toggle('active', searchVisible);
    box.style.display = searchVisible ? 'block' : 'none';
    if(searchVisible) document.getElementById('searchInput').focus();
  });
})();

/* ---- search box: Enter jumps straight into the matched room ---- */
(function wireSearch(){
  const input = document.getElementById('searchInput');
  input.addEventListener('keydown', e=>{
    if(e.key!=='Enter') return;
    const room = findRoomByName(input.value);
    if(room) enterInterior(room.id);
  });
})();

// three.js, earcut and the room data are all inlined directly into this
// file (no CDN, no sibling file, no network needed) - this check is just
// a safety net in case the file got corrupted/truncated in transit.
window.addEventListener('load', ()=>{
  if(typeof THREE==="undefined" || typeof earcut==="undefined" || !window.SPHERE_ROOMS){
    document.getElementById('loadingOverlay').textContent = "שגיאה: נראה שהקובץ נפגם או נחתך בהעברה (הוא אמור להיות כ-800KB בשלמותו) - נסה להוריד/לשמור אותו שוב.";
    return;
  }
  init();
});

