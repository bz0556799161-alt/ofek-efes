/* ============================================================================
   BUILD: floor patches (89 rooms, earcut-triangulated, flat-shaded, one mesh)
   ============================================================================ */
function hsl2rgb(h,s,l){
  const c=(1-Math.abs(2*l-1))*s, x=c*(1-Math.abs((h/60)%2-1)), m=l-c/2;
  let r,g,b;
  if(h<60){r=c;g=x;b=0;} else if(h<120){r=x;g=c;b=0;} else if(h<180){r=0;g=c;b=x;}
  else if(h<240){r=0;g=x;b=c;} else if(h<300){r=x;g=0;b=c;} else {r=c;g=0;b=x;}
  return [r+m,g+m,b+m];
}
function roomColor(i){
  // muted, desaturated hue sweep across all rooms - "industrial star atlas",
  // not a colorful game palette.
  const h = (i*137.508) % 360; // golden-angle spread = well-distributed hues
  return hsl2rgb(h, 0.22, 0.30);
}

function earcutTriangulate(pts2d){
  const flat = [];
  pts2d.forEach(p=>{flat.push(p[0],p[1]);});
  let idx = [];
  try { idx = earcut(flat); } catch(e){ idx = []; }
  if(!idx || idx.length < 3){
    // fallback: simple fan triangulation from vertex 0 (works for star-shaped polys)
    idx = [];
    for(let k=1;k<pts2d.length-1;k++){ idx.push(0,k,k+1); }
  }
  return idx;
}

const floorPositions = [];
const floorNormals = [];
const floorColors = [];
const roomTriRanges = []; // {id, start, count} into floorPositions (in vertices) for picking/highlight later
let floorMesh; // exposed for exterior click raycasting (pick a room on the shell)

function pushFlatTri(va,vb,vc,color){
  const n = new THREE.Vector3().subVectors(vb,va).cross(new THREE.Vector3().subVectors(vc,va)).normalize();
  const mid = va.clone().add(vb).add(vc).multiplyScalar(1/3);
  if(n.dot(mid) < 0) n.negate();
  [va,vb,vc].forEach(v=>{
    floorPositions.push(v.x,v.y,v.z);
    floorNormals.push(n.x,n.y,n.z);
    floorColors.push(color[0],color[1],color[2]);
  });
}

// earcut is free to connect a room's boundary with long interior diagonals
// (e.g. across a big constellation like Orion or Hydra). A flat triangle
// drawn straight across such a diagonal cuts a visible chord well inside
// the sphere instead of following its curvature - close up (the player
// stands only ~2m off this surface) that shows up as the floor sagging
// away underfoot. Recursively split any triangle with a long edge into
// four, re-projecting new vertices onto the sphere each time, until every
// edge is short enough that the chord/arc gap is negligible.
const MAX_FLOOR_EDGE = 16;
const MAX_SUBDIV_DEPTH = 5;
function pushSphereTri(va,vb,vc,color,depth){
  const eAB=va.distanceTo(vb), eBC=vb.distanceTo(vc), eCA=vc.distanceTo(va);
  if(depth<=0 || Math.max(eAB,eBC,eCA) <= MAX_FLOOR_EDGE){
    pushFlatTri(va,vb,vc,color);
    return;
  }
  const mab = va.clone().add(vb).normalize().multiplyScalar(FLOOR_R);
  const mbc = vb.clone().add(vc).normalize().multiplyScalar(FLOOR_R);
  const mca = vc.clone().add(va).normalize().multiplyScalar(FLOOR_R);
  pushSphereTri(va,mab,mca,color,depth-1);
  pushSphereTri(mab,vb,mbc,color,depth-1);
  pushSphereTri(mca,mbc,vc,color,depth-1);
  pushSphereTri(mab,mbc,mca,color,depth-1);
}

function buildFloors(){
  ROOMS.forEach((room, ri)=>{
    const idx = earcutTriangulate(room.pts2d);
    const color = roomColor(ri);
    const startVert = floorPositions.length/3;
    for(let k=0;k<idx.length;k+=3){
      const a=room.pts3d[idx[k]], b=room.pts3d[idx[k+1]], c=room.pts3d[idx[k+2]];
      if(!a||!b||!c) continue;
      const va=new THREE.Vector3(...a), vb=new THREE.Vector3(...b), vc=new THREE.Vector3(...c);
      pushSphereTri(va,vb,vc,color,MAX_SUBDIV_DEPTH);
    }
    roomTriRanges.push({id:room.id, start:startVert, count:floorPositions.length/3-startVert});
  });

  // One winding for the whole shell: a triangle whose counter-clockwise
  // (front) face looks toward the core is flipped, so every front face looks
  // OUT. Which material is drawn from which side below then follows from the
  // geometry alone.
  for(let i=0;i<floorPositions.length;i+=9){
    const ax=floorPositions[i], ay=floorPositions[i+1], az=floorPositions[i+2];
    const bx=floorPositions[i+3], by=floorPositions[i+4], bz=floorPositions[i+5];
    const cx=floorPositions[i+6], cy=floorPositions[i+7], cz=floorPositions[i+8];
    const nx=(by-ay)*(cz-az)-(bz-az)*(cy-ay), ny=(bz-az)*(cx-ax)-(bx-ax)*(cz-az), nz=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
    if(nx*(ax+bx+cx)+ny*(ay+by+cy)+nz*(az+bz+cz) < 0){
      for(const arr of [floorPositions, floorNormals, floorColors]){
        for(let k=0;k<3;k++){ const t=arr[i+3+k]; arr[i+3+k]=arr[i+6+k]; arr[i+6+k]=t; }
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(floorPositions,3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(floorNormals,3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(floorColors,3));
  const mat = new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.95, metalness:0.05, side:THREE.DoubleSide});
  floorMesh = new THREE.Mesh(geo, mat);
  structureSpinGroup.add(floorMesh);
}
// given a vertex index into the merged floor geometry, find which room it belongs to
function roomIdForFloorVertex(vIdx){
  for(let i=0;i<roomTriRanges.length;i++){
    const r = roomTriRanges[i];
    if(vIdx>=r.start && vIdx<r.start+r.count) return r.id;
  }
  return null;
}

/* ============================================================================
   BUILD: ceilings — a cap over every room at the same radius the walls end
   at (FLOOR_R - WALL_HEIGHT), so each room (together with its boundary
   walls) is a fully sealed enclosure. This is what actually blocks the view
   of the (invisible, unbuilt) core: tall boundary walls alone only block the
   sideways view into neighbouring rooms - looking straight up in a wide room
   would otherwise still show open space clear across to the far side of the
   hollow sphere. The ceiling closes that opening off completely.
   ============================================================================ */
const CEIL_R = FLOOR_R - WALL_HEIGHT;
const ceilingPositions = [], ceilingNormals = [], ceilingColors = [];
function pushCeilFlatTri(va,vb,vc,color){
  const n = new THREE.Vector3().subVectors(vb,va).cross(new THREE.Vector3().subVectors(vc,va)).normalize();
  const mid = va.clone().add(vb).add(vc).multiplyScalar(1/3);
  if(n.dot(mid) > 0) n.negate(); // ceiling normal faces inward/downward - toward the room, not the core
  [va,vb,vc].forEach(v=>{
    ceilingPositions.push(v.x,v.y,v.z);
    ceilingNormals.push(n.x,n.y,n.z);
    ceilingColors.push(color[0],color[1],color[2]);
  });
}
function pushCeilSphereTri(va,vb,vc,color,depth){
  const eAB=va.distanceTo(vb), eBC=vb.distanceTo(vc), eCA=vc.distanceTo(va);
  if(depth<=0 || Math.max(eAB,eBC,eCA) <= MAX_FLOOR_EDGE){
    pushCeilFlatTri(va,vb,vc,color);
    return;
  }
  const mab = va.clone().add(vb).normalize().multiplyScalar(CEIL_R);
  const mbc = vb.clone().add(vc).normalize().multiplyScalar(CEIL_R);
  const mca = vc.clone().add(va).normalize().multiplyScalar(CEIL_R);
  pushCeilSphereTri(va,mab,mca,color,depth-1);
  pushCeilSphereTri(mab,vb,mbc,color,depth-1);
  pushCeilSphereTri(mca,mbc,vc,color,depth-1);
  pushCeilSphereTri(mab,mbc,mca,color,depth-1);
}
function buildCeilings(){
  ROOMS.forEach((room, ri)=>{
    const idx = earcutTriangulate(room.pts2d); // identical triangulation to the floor
    const base = roomColor(ri);
    // night sky, not a second floor: mostly a near-black navy, with just a whisper
    // of the room's own base hue so each room's sky keeps a faint identity
    const color = [
      0.012 + base[0]*0.05,
      0.014 + base[1]*0.05,
      0.030 + base[2]*0.06
    ];
    for(let k=0;k<idx.length;k+=3){
      const a=room.pts3d[idx[k]], b=room.pts3d[idx[k+1]], c=room.pts3d[idx[k+2]];
      if(!a||!b||!c) continue;
      const va=new THREE.Vector3(...a).normalize().multiplyScalar(CEIL_R);
      const vb=new THREE.Vector3(...b).normalize().multiplyScalar(CEIL_R);
      const vc=new THREE.Vector3(...c).normalize().multiplyScalar(CEIL_R);
      pushCeilSphereTri(va,vb,vc,color,MAX_SUBDIV_DEPTH);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(ceilingPositions,3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(ceilingNormals,3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(ceilingColors,3));
  const mat = new THREE.MeshStandardMaterial({
    vertexColors:true, roughness:0.95, metalness:0.05, side:THREE.DoubleSide,
    emissive:0x02030a, emissiveIntensity:1.0 // reads as a lit night sky even in dim scene light
  });
  const mesh = new THREE.Mesh(geo, mat);
  structureSpinGroup.add(mesh);
}

/* ============================================================================
   STARFIELD — the "core" ceiling is painted with the real night sky: every
   star from window.SPHERE_STARS (HYG catalogue, mag <= 6.0) is placed by its
   true RA/Dec, converted with the standard RA/Dec-to-unit-vector formula
   used throughout this file, at radius CEIL_R so it sits
   on the ceiling dome. Because SPHERE_STARS was pre-grouped by real IAU
   constellation membership (matching each room id 1:1, with Serpens already
   split into Ser1/Ser2 by boundary), every star renders inside the actual
   room whose ceiling patch covers that point in the sky - no per-room
   clipping needed, the geometry does it for us.
   ============================================================================ */
function makeStarSpriteTexture(){
  const S = 32;
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const ctx = cv.getContext('2d');
  const grad = ctx.createRadialGradient(S/2,S/2,0, S/2,S/2,S/2);
  grad.addColorStop(0.00,'rgba(255,255,255,1)');
  grad.addColorStop(0.20,'rgba(255,255,255,0.95)');
  grad.addColorStop(0.45,'rgba(255,255,255,0.35)');
  grad.addColorStop(1.00,'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,S,S);
  return new THREE.CanvasTexture(cv);
}
// Approximates real stellar color from the B-V color index (the HYG catalogue's
// "ci" column) - a standard formula (after Mitchell Charity's "what color are
// the stars") mapping color temperature to RGB, so an orange giant like
// Betelgeuse actually renders orange and a hot blue star actually renders blue,
// instead of every star just being white/grey scaled by brightness.
function bvToRGB(bv){
  bv = Math.max(-0.4, Math.min(2.0, (typeof bv==="number" && !isNaN(bv)) ? bv : 0.65));
  let r,g,b;
  if(bv < 0.00){ const t=(bv+0.40)/0.40; r=0.61+0.11*t+0.1*t*t; }
  else if(bv < 0.40){ const t=bv/0.40; r=0.83+0.17*t; }
  else { r=1.00; }
  if(bv < 0.00){ const t=(bv+0.40)/0.40; g=0.70+0.07*t+0.1*t*t; }
  else if(bv < 0.40){ const t=bv/0.40; g=0.87+0.11*t; }
  else if(bv < 1.60){ const t=(bv-0.40)/1.20; g=0.98-0.16*t; }
  else { const t=(bv-1.60)/0.40; g=0.82-0.5*t*t; }
  if(bv < 0.40){ b=1.00; }
  else if(bv < 1.50){ const t=(bv-0.40)/1.10; b=1.00-0.47*t+0.1*t*t; }
  else { const t=Math.min(1,(bv-1.50)/0.44); b=0.63-0.6*t*t; }
  return [Math.max(0,Math.min(1,r)), Math.max(0,Math.min(1,g)), Math.max(0,Math.min(1,b))];
}
let starMaterial = null; // exposed so the settings brightness slider can live-update it
function buildStars(){
  if(!window.SPHERE_STARS) return;
  // Every star is a small flat glowing quad lying ON the star wall (tangent to
  // it, a hair above), i.e. painted on it: it is occluded by the walls and the
  // body like any other surface and cannot be sliced by the ground the way a
  // screen-facing point sprite was once the star wall became the ground.
  const positions = [], centers = [], uvs = [], colors = [], indices = [];
  const STAR_R = CEIL_R + 0.08;
  const n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), helper = new THREE.Vector3();
  let vi = 0;
  for(const rid in window.SPHERE_STARS){
    const list = window.SPHERE_STARS[rid];
    for(let i=0;i<list.length;i++){
      const raH = list[i][0], decD = list[i][1], mag = list[i][2], ci = list[i][3];
      const isMain = list[i][4] === 1; // one of the real asterism stars that draw the constellation's shape
      const ra = raH * (Math.PI/12);
      const dec = decD * (Math.PI/180);
      n.set(Math.cos(dec)*Math.cos(ra), Math.sin(dec), -Math.cos(dec)*Math.sin(ra)); // ASTRONOMICAL HANDEDNESS MIRROR - same sign flip as the raw room data
      helper.set(Math.abs(n.y) < 0.9 ? 0 : 1, Math.abs(n.y) < 0.9 ? 1 : 0, 0);
      e1.crossVectors(helper, n).normalize();
      e2.crossVectors(n, e1);
      const magT = THREE.MathUtils.clamp((6.3 - mag)/6.6, 0.32, 1.0);
      const [cr,cg,cb] = bvToRGB(ci);
      let t, half;
      if(isMain){
        // the handful of stars per room that actually trace the recognizable
        // shape - bold and near-full-brightness regardless of true magnitude
        t = Math.max(magT, 0.78);
        half = 0.7 + t*0.9;
      } else {
        // everything else: dimmer and smaller, so the shape-defining stars
        // read clearly by contrast rather than blending into the crowd
        t = magT * 0.5;
        half = 0.22 + t*0.8;
      }
      const wMix = 0.15 + 0.35*t;
      const col = [cr*(1-wMix)+wMix, cg*(1-wMix)+wMix, cb*(1-wMix)+wMix];
      const cx = n.x*STAR_R, cy = n.y*STAR_R, cz = n.z*STAR_R;
      [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(([u,v])=>{
        positions.push(cx + (e1.x*u + e2.x*v)*half, cy + (e1.y*u + e2.y*v)*half, cz + (e1.z*u + e2.z*v)*half);
        centers.push(cx, cy, cz);
        uvs.push((u+1)/2, (v+1)/2);
        colors.push(col[0], col[1], col[2]);
      });
      indices.push(vi, vi+1, vi+2, vi, vi+2, vi+3);
      vi += 4;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
  geo.setAttribute('center', new THREE.Float32BufferAttribute(centers,3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs,2));
  geo.setAttribute('starColor', new THREE.Float32BufferAttribute(colors,3));
  geo.setIndex(indices);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      pointTex: { value: makeStarSpriteTexture() },
      uBrightness: { value: settings.starBrightness } // live-tunable from the brightness slider
    },
    vertexShader: `
      attribute vec3 center;
      attribute vec3 starColor;
      uniform float uBrightness;
      varying vec3 vColor;
      varying vec2 vUv;
      void main(){
        vColor = starColor;
        vUv = uv;
        // the slider also grows/shrinks each star about its own centre
        vec3 p = center + (position - center) * (0.55 + 0.45*uBrightness);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D pointTex;
      uniform float uBrightness;
      varying vec3 vColor;
      varying vec2 vUv;
      void main(){
        vec4 tex = texture2D(pointTex, vUv);
        vec3 col = clamp(vColor * (0.35 + 0.65*uBrightness), 0.0, 1.0);
        gl_FragColor = vec4(col, 1.0) * tex;
        if(gl_FragColor.a < 0.01) discard;
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  });
  starMaterial = mat;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  structureSpinGroup.add(mesh);
}

// the classic constellation stick-figure lines (same asterism data as the flat
// star chart), drawn faintly on the ceiling itself so the recognizable shape
// is visible while just walking around and looking up, not only in the chart.
// one small mesh PER ROOM (not one merged mesh for the whole sky) - a
// merged mesh can't be partially hidden, and every room's lines being
// visible simultaneously from anywhere (even from a totally different room,
// or from outside the whole structure) turned into unreadable clutter, the
// same problem the 3D constellation art below ran into. Visibility of each
// room's mesh is driven by updateSkyOverlayVisibility(): only the room the
// player is actually standing in (and only while inside the structure) is
// ever shown.
const asterismLineMeshesByRoom = {};
function buildAsterismLines(){
  if(!window.SPHERE_ASTERISM_LINES) return;
  const STAR_R = CEIL_R + 0.14; // on the star wall, a hair above the stars
  for(const rid in window.SPHERE_ASTERISM_LINES){
    const positions = [];
    window.SPHERE_ASTERISM_LINES[rid].forEach(([ra1,dec1,ra2,dec2])=>{
      [[ra1,dec1],[ra2,dec2]].forEach(([raH,decD])=>{
        const ra = raH*(Math.PI/12), dec = decD*(Math.PI/180);
        positions.push(
          STAR_R*Math.cos(dec)*Math.cos(ra),
          STAR_R*Math.sin(dec),
          -STAR_R*Math.cos(dec)*Math.sin(ra) // ASTRONOMICAL HANDEDNESS MIRROR - same sign flip as the raw room data
        );
      });
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
    // depthTest off + high renderOrder: these are a schematic sky overlay, not
    // physical ceiling geometry, so they shouldn't z-fight (and lose) against
    // the nearby tall boundary walls, which sit at almost the same radius as
    // the ceiling near a room's edge and were swallowing/flickering the lines.
    const mat = new THREE.LineBasicMaterial({color:0xaeb8ff, transparent:true, opacity:0.55, depthTest:true, depthWrite:false});
    const lines = new THREE.LineSegments(geo, mat);
    lines.renderOrder = 5;
    lines.visible = false; // updateSkyOverlayVisibility() turns on only the active room's
    lines.userData.roomId = rid;
    structureSpinGroup.add(lines);
    asterismLineMeshesByRoom[rid] = lines;
  }
}

// shows the current room's schematic lines/art ONLY while standing inside
// it - never all 89 rooms' worth at once, and never from the exterior view
// or the start screen, where they used to clutter the whole sphere.
function updateSkyOverlayVisibility(){
  const activeId = (mode==='interior' && cachedRoom) ? cachedRoom.id : null;
  for(const rid in asterismLineMeshesByRoom){
    asterismLineMeshesByRoom[rid].visible = settings.showAsterismLines && (rid===activeId);
  }
  if(eclipticMesh) eclipticMesh.visible = settings.showEcliptic && mode==='interior';
}

/* ----------------------------------------------------------------------
   ECLIPTIC BAND - a thick yellow ribbon painted on the star wall (same
   radius as the ceiling stars), tracing the ecliptic: the sun's own path
   through the sky, i.e. the plane of the zodiac wheel - NOT the galactic
   plane/Milky Way. The ecliptic pole (J2000) sits at RA 270 deg,
   Dec 66.560709 deg (90 minus the mean obliquity of the ecliptic,
   23.439291 deg), so the ecliptic itself is the great circle perpendicular
   to that pole. A plain thin LineLoop isn't reliably "thick" across
   browsers/GPUs, so this is built as an actual ribbon: two rows of vertices
   straddling the great circle by a small angle on either side, stitched
   into a triangle strip.
   Per request, this is shown ONLY in whichever room it currently passes
   through while standing inside it (never from outside, never for every
   room at once) - so the ring is walked all the way around, each sample
   point is tagged with the room whose ceiling patch covers that direction
   (same nearest-centroid approximation used by currentRoom()), and a
   separate small mesh is built for each contiguous same-room run and
   gated by updateSkyOverlayVisibility() exactly like the asterism lines.
   ---------------------------------------------------------------------- */
const eclipticMeshesByRoom = {};
// which room (if any) a direction on the celestial sphere actually falls
// inside, by its REAL boundary polygon (roomMapPolys/sphPointInRoom - the
// same gnomonic point-in-spherical-polygon test used for floor detection and
// map click-picking), not a nearest-centroid guess. Nearest-centroid can
// hand a sample point to the wrong room right at a shared boundary (the
// centroid isn't the boundary), which is exactly what previously risked
// visible seam-jumps in the ecliptic band near constellation edges.
function roomForDirection(N){
  for(let i=0;i<roomMapPolys.length;i++){
    if(sphPointInRoom(N, roomMapPolys[i])) return roomMapPolys[i].room;
  }
  return null;
}
let eclipticMesh = null;
function buildEclipticBand(){
  // The band is painted ONTO the star wall itself: one ribbon lying on the
  // star-wall sphere (a hair above it) and depth-tested like any surface, so
  // it shows exactly where the real ecliptic passes over each room's star
  // wall and is hidden by the walls everywhere else - no per-room switching.
  const ECL_R = CEIL_R + 0.04;
  // pure CELESTIAL geometry, read from the single shared source (see ECLIPTIC_GEOMETRY above)
  const HALF_WIDTH = 3.0 * (Math.PI/180); // ecliptic-latitude half-width of the band, in radians
  const SEGMENTS = 720;
  const positions = [], uvs = [], indices = [];
  // several rows ACROSS the band too: a flat strip spanning the full width would
  // dip below the (curved) star wall in its middle and be hidden by it
  const ROWS = 12;
  for(let i=0;i<=SEGMENTS;i++){
    const theta = (i/SEGMENTS) * Math.PI*2;
    for(let r=0;r<=ROWS;r++){
      const f = r/ROWS;
      const p = ECLIPTIC_GEOMETRY.pointAt(theta, -HALF_WIDTH + 2*HALF_WIDTH*f);
      positions.push(p.x*ECL_R, p.y*ECL_R, p.z*ECL_R);
      uvs.push(f, 0.5);
    }
    if(i<SEGMENTS){
      for(let r=0;r<ROWS;r++){
        const a=i*(ROWS+1)+r, b=a+1, c=a+(ROWS+1), d=c+1;
        indices.push(a,b,c, b,d,c);
      }
    }
  }
  // a small gradient texture (centre brighter than the rim)
  const S = 64;
  const cv = document.createElement('canvas'); cv.width=S; cv.height=8;
  const ctx = cv.getContext('2d');
  const grad = ctx.createLinearGradient(0,0,S,0);
  grad.addColorStop(0.00,'rgba(255,214,64,0)');
  grad.addColorStop(0.50,'rgba(255,224,120,0.9)');
  grad.addColorStop(1.00,'rgba(255,214,64,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,S,8);
  const tex = new THREE.CanvasTexture(cv);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs,2));
  geo.setIndex(indices);
  const mat = new THREE.MeshBasicMaterial({
    map: tex, color:0xffd75c, transparent:true, opacity:0.85,
    depthTest:true, depthWrite:false, side:THREE.DoubleSide, blending:THREE.AdditiveBlending
  });
  eclipticMesh = new THREE.Mesh(geo, mat);
  eclipticMesh.renderOrder = 1;
  eclipticMesh.frustumCulled = false;
  structureSpinGroup.add(eclipticMesh);
  updateSkyOverlayVisibility();
}

/* ============================================================================
   MATERIALS — procedurally-painted canvas textures. Everything in this file
   has to be self-contained (no external image files), so "painting" here
   means generating the texture bitmap in code, the same way the room-name
   labels already generate their canvas textures.
   ============================================================================ */
function makeRustyMetalTexture(){
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const ctx = cv.getContext('2d');

  // base worn-metal tone - cool blue-gray, not warm rust
  ctx.fillStyle = '#3c454e';
  ctx.fillRect(0,0,S,S);

  // mottled steel blotches
  const rustTones = ['#4a5560','#39424c','#2e363e','#586570','#333b42','#455260'];
  for(let i=0;i<150;i++){
    const x = Math.random()*S, y = Math.random()*S, r = 4+Math.random()*22;
    const grad = ctx.createRadialGradient(x,y,0,x,y,r);
    const c = rustTones[(Math.random()*rustTones.length)|0];
    grad.addColorStop(0,c); grad.addColorStop(1,'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.3+Math.random()*0.3;
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // weathering streaks
  for(let i=0;i<20;i++){
    const x=Math.random()*S, y0=Math.random()*S*0.5, len=20+Math.random()*90;
    ctx.strokeStyle = 'rgba(18,24,30,0.28)';
    ctx.lineWidth = 1+Math.random()*2;
    ctx.beginPath(); ctx.moveTo(x,y0); ctx.lineTo(x+(Math.random()*10-5), y0+len); ctx.stroke();
  }

  // panel border
  ctx.strokeStyle = 'rgba(10,13,16,0.55)';
  ctx.lineWidth = 3;
  ctx.strokeRect(3,3,S-6,S-6);

  // rivet holes punched along the border - small dark holes with a faint rim
  const positions = [];
  const margin = 16;
  for(let x=margin; x<=S-margin; x+=32){ positions.push([x,margin]); positions.push([x,S-margin]); }
  for(let y=margin+32; y<=S-margin-32; y+=32){ positions.push([margin,y]); positions.push([S-margin,y]); }
  positions.forEach(([x,y])=>{
    ctx.fillStyle = '#12151a';
    ctx.beginPath(); ctx.arc(x,y,4,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = 'rgba(200,215,228,0.32)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x,y,5.2,0,Math.PI*2); ctx.stroke();
  });

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeStoneTexture(){
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#5a5650';
  ctx.fillRect(0,0,S,S);
  const tones = ['#4a4640','#6b6660','#3f3c37','#7a746c','#57534c'];
  for(let i=0;i<220;i++){
    const x=Math.random()*S, y=Math.random()*S, r=3+Math.random()*14;
    ctx.globalAlpha = 0.25+Math.random()*0.3;
    ctx.fillStyle = tones[(Math.random()*tones.length)|0];
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // carved-block seams, offset every other row like real stonework
  ctx.strokeStyle = 'rgba(20,18,16,0.55)';
  ctx.lineWidth = 2;
  const block = 64;
  for(let y=0;y<=S;y+=block){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(S,y); ctx.stroke(); }
  for(let row=0,y=0; y<S; y+=block, row++){
    const offset = (row%2)*block/2;
    for(let x=-block; x<=S+block; x+=block){
      ctx.beginPath(); ctx.moveTo(x+offset,y); ctx.lineTo(x+offset,y+block); ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  // no tex.repeat here: the floor's inner-face UVs (buildAtmosphere) already
  // bake in their own tiling factor
  return tex;
}

// doors: a different, deliberately muted/dim metal - dark, brushed iron
// rather than the walls' warm rust. Much higher canvas resolution than the
// walls (this is the surface a player stands right next to), with fine
// brushed streaks for a machined-iron feel, and each hole gets its own
// raised metal peg/pin (a real grip point, not just a flat dark dot).
function makeDoorMetalTexture(){
  const S = 1024;
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#1b1d21';
  ctx.fillRect(0,0,S,S);
  const tones = ['#22252a','#15171a','#282c32','#1e2024','#2c3038'];
  for(let i=0;i<420;i++){
    const x=Math.random()*S, y=Math.random()*S, r=10+Math.random()*70;
    const grad = ctx.createRadialGradient(x,y,0,x,y,r);
    grad.addColorStop(0, tones[(Math.random()*tones.length)|0]);
    grad.addColorStop(1,'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.2+Math.random()*0.25;
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // fine brushed-iron streaks - the high-resolution detail the flat
  // gradient blotches alone can't give
  ctx.globalAlpha = 0.12;
  for(let i=0;i<900;i++){
    const y = Math.random()*S;
    const x0 = Math.random()*S, len = 30+Math.random()*160;
    ctx.strokeStyle = Math.random()<0.5 ? '#3a3f47' : '#0c0d0f';
    ctx.lineWidth = 0.6+Math.random()*1.2;
    ctx.beginPath(); ctx.moveTo(x0,y); ctx.lineTo(x0+len, y+(Math.random()*4-2)); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(6,7,8,0.65)';
  ctx.lineWidth = 10;
  ctx.strokeRect(10,10,S-20,S-20);
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(S/2,10); ctx.lineTo(S/2,S-10); ctx.stroke();
  const positions = [];
  const margin = 64;
  for(let x=margin; x<=S-margin; x+=128){ positions.push([x,margin]); positions.push([x,S-margin]); }
  for(let y=margin+128; y<=S-margin-128; y+=128){ positions.push([margin,y]); positions.push([S-margin,y]); }
  positions.forEach(([x,y])=>{
    // the punched hole itself
    ctx.fillStyle = '#08090a';
    ctx.beginPath(); ctx.arc(x,y,15,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = 'rgba(150,160,172,0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x,y,18.5,0,Math.PI*2); ctx.stroke();
    // a raised metal peg/pin seated inside the hole, for gripping - a
    // lit radial gradient sells the 3D bulge without real geometry
    const pegR = 8.5;
    const peg = ctx.createRadialGradient(x-pegR*0.35,y-pegR*0.35,1,x,y,pegR);
    peg.addColorStop(0,'#cfd6de');
    peg.addColorStop(0.45,'#8b929c');
    peg.addColorStop(1,'#3a3e44');
    ctx.fillStyle = peg;
    ctx.beginPath(); ctx.arc(x,y,pegR,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x,y,pegR,0,Math.PI*2); ctx.stroke();
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

// a small embedded metal nameplate for a door - a real plaque graphic
// (beveled plate + corner screws + etched text), not a floating label
function makeDoorPlaqueTexture(text){
  const W = 480, H = 168;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0,0,W,H);
  const pad = 12;
  const grad = ctx.createLinearGradient(0,0,0,H);
  grad.addColorStop(0,'#3c3f45'); grad.addColorStop(1,'#1f2226');
  ctx.fillStyle = grad;
  ctx.fillRect(pad,pad,W-2*pad,H-2*pad);
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 3;
  ctx.strokeRect(pad+1,pad+1,W-2*pad-2,H-2*pad-2);
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 1;
  ctx.strokeRect(pad,pad,W-2*pad,H-2*pad);
  [[pad+18,pad+18],[W-pad-18,pad+18],[pad+18,H-pad-18],[W-pad-18,H-pad-18]].forEach(([x,y])=>{
    ctx.fillStyle = '#111214';
    ctx.beginPath(); ctx.arc(x,y,6,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x,y,7.5,0,Math.PI*2); ctx.stroke();
  });
  // large and bold, filling most of the plate - a nameplate you can read
  // from across a room, not fine print
  let fs = 96;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `900 ${fs}px Arial`;
  while(ctx.measureText(text).width > W-2*pad-24 && fs>34){ fs-=2; ctx.font = `900 ${fs}px Arial`; }
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillText(text, W/2+2, H/2+3);
  ctx.fillStyle = '#f0dfae';
  ctx.fillText(text, W/2, H/2);
  ctx.strokeStyle = 'rgba(255,235,190,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeText(text, W/2, H/2);
  return new THREE.CanvasTexture(cv);
}

/* ============================================================================
   BUILD: boundary walls (tall rusty-metal fences along every room edge,
   gapped at passages, textured with a tiling rivet-holed metal texture)
   ============================================================================ */
const wallPositions = [];
const wallNormals = [];
const wallUVs = [];
const WALL_TEX_TILE = 8; // world units per texture tile, both axes
const doorEdgesByPassage = {}; // passageIndex -> [{v0,v1,top0,top1,roomId}, ...] - filled in by buildWalls, consumed by buildDoors
let wallMesh; // exposed so the door-hover raycast can also test against walls (an occluder, not just doors)

// Which edges of each room are actually doors, derived PURELY from the
// rooms' own pts3d boundaries - not from PASSAGES[].mid3d/lenDeg at all.
// The old approach picked, per room per passage, whichever of the room's
// OWN edges had its midpoint nearest to the passage's precomputed mid3d
// point. That silently trusted mid3d to be right. It mostly is - but for
// every passage whose real shared boundary happens to wrap through the
// 0deg/360deg seam (the ones between circumpolar constellations:
// Cam/Dra, Cam/UMi, Cha/Oct, Cha/Mus, Cen/Cru, Cen/Hya, Com/UMa, Com/Vir,
// Crv/Vir, Crv/Hya, Cru/Mus, Dra/UMa - every one of them has a lenDeg in
// the ~260-358deg range in the source data, where the true short boundary
// is `360 - lenDeg` degrees: a classic angle-wraparound bug in whatever
// external step computed mid3d/lenDeg, averaging the long way around a
// circle instead of the short way), mid3d lands far from the real
// boundary - so the nearest-edge search either picked the wrong edge
// entirely (a real but unrelated wall became an invisible "door" 20+
// units from where the floor polygons actually meet) or, past the sanity
// cap, found nothing at all and left that passage fully walled off on
// both sides despite being a real, intended connection - exactly the
// "what's shown doesn't match what's computed" mismatch, and exactly why
// walking near those boundaries could mean hugging a solid wall where the
// floor coloring suggests a room, or finding emptiness where a wall looks
// closed.
//
// The actual, ground-truth fact that makes two rooms share a door is
// nothing about mid3d at all: room A and room B are adjacent exactly where
// A's own boundary polyline and B's own boundary polyline run along the
// same physical path in 3D. That's directly checkable from the geometry
// already being rendered, so checking it directly - instead of trusting a
// derived hint that can be wrong - makes what's built structurally unable
// to disagree with what's shown.
//
// Measured directly against real room pairs here (e.g. And/Lac, Boo/Vir -
// ordinary passages untouched by the mid3d bug above): the edges that
// genuinely belong to a shared boundary have their midpoint within a few
// HUNDREDTHS of a unit of the other room's boundary polyline (floating-
// point-level agreement, not a coincidence); the very next edge around
// either room's perimeter - the first one NOT part of this shared boundary
// - is already 4+ units away, usually far more. So this is a real,
// structural gap in the data to detect against, not a threshold being
// tuned to paper over noise. EDGE_SHARED_TOL=1.0 sits in the middle of
// that gap with a comfortable margin on both sides.
//
// Matching against the closest POINT on B's whole polyline (not just
// vertex-to-vertex or requiring A's edge to pair one-for-one with a single
// B edge) is what makes this work even though the two rooms' own pts3d
// arrays resample the very same conceptual boundary at different
// densities (And has 65 edges, Lac may have a different count) - a point
// partway along one room's edge can still land exactly on the middle of
// the other room's longer edge. Checked independently for A against B and
// B against A, so a boundary spanning several short edges on one side (or
// both) opens consistently on both sides, rather than each room picking a
// single "nearest" edge that may not even be the same physical location.
function closestDistToPolyline(p, pts){
  const n = pts.length;
  let best = Infinity;
  for(let k=0;k<n;k++){
    const a = pts[k], b = pts[(k+1)%n];
    const abx=b[0]-a[0], aby=b[1]-a[1], abz=b[2]-a[2];
    const apx=p[0]-a[0], apy=p[1]-a[1], apz=p[2]-a[2];
    const ab2 = abx*abx+aby*aby+abz*abz;
    let t = ab2>1e-9 ? (apx*abx+apy*aby+apz*abz)/ab2 : 0;
    t = Math.max(0,Math.min(1,t));
    const dx = p[0]-(a[0]+abx*t), dy = p[1]-(a[1]+aby*t), dz = p[2]-(a[2]+abz*t);
    const d = Math.sqrt(dx*dx+dy*dy+dz*dz);
    if(d<best) best=d;
  }
  return best;
}
const EDGE_SHARED_TOL = 1.0; // world units - see the measured gap in the comment above
const doorEdgesByRoom = {}; // roomId -> { edgeIndex -> passageIndex }
PASSAGES.forEach((p, pi) => {
  const A = roomById[p.a], B = roomById[p.b];
  if(!A || !B) return;
  const nA = A.pts3d.length, nB = B.pts3d.length;
  for(let i=0;i<nA;i++){
    const a0=A.pts3d[i], a1=A.pts3d[(i+1)%nA];
    const mid = [(a0[0]+a1[0])/2, (a0[1]+a1[1])/2, (a0[2]+a1[2])/2];
    if(closestDistToPolyline(mid, B.pts3d) < EDGE_SHARED_TOL){
      (doorEdgesByRoom[A.id] = doorEdgesByRoom[A.id]||{})[i] = pi;
    }
  }
  for(let j=0;j<nB;j++){
    const b0=B.pts3d[j], b1=B.pts3d[(j+1)%nB];
    const mid = [(b0[0]+b1[0])/2, (b0[1]+b1[1])/2, (b0[2]+b1[2])/2];
    if(closestDistToPolyline(mid, A.pts3d) < EDGE_SHARED_TOL){
      (doorEdgesByRoom[B.id] = doorEdgesByRoom[B.id]||{})[j] = pi;
    }
  }
});

// ---- which side of each boundary edge is the room's own INTERIOR ----
// Derived from the real room polygon itself (sphPointInRoom - the same exact
// point-in-polygon test used for room detection and map picking): for every
// edge, probe a point a little to either side of its midpoint, along the
// sphere's tangent perpendicular to the edge, and see which side lies inside
// the room. Edges whose probe is ambiguous (very short/degenerate edges, or a
// probe that lands in a neighbouring notch) take the room's majority answer.
// This is what lets every wall strip know which room it belongs to, so it
// can be tinted, lit and offset on that room's side only.
const roomPolyById = {};
const roomEdgeInward = {}; // roomId -> [unit Vector3 per edge, tangent to the sphere, pointing INTO that room]
function computeRoomEdgeInward(room){
  const n = room.pts3d.length;
  const entry = roomPolyById[room.id];
  const dirs = new Array(n), sign = new Array(n).fill(0);
  let plus = 0, minus = 0;
  for(let i=0;i<n;i++){
    const p0 = new THREE.Vector3(...room.pts3d[i]), p1 = new THREE.Vector3(...room.pts3d[(i+1)%n]);
    const mid = p0.clone().add(p1).multiplyScalar(0.5);
    const mn = mid.clone().normalize();
    const t = p1.clone().sub(p0);
    if(t.lengthSq() < 1e-10){ dirs[i] = null; continue; }
    t.normalize();
    const d = new THREE.Vector3().crossVectors(mn, t).normalize();
    dirs[i] = d;
    if(entry){
      const probe = 0.7;
      const a = mn.clone().multiplyScalar(FLOOR_R).addScaledVector(d, probe).normalize();
      const b = mn.clone().multiplyScalar(FLOOR_R).addScaledVector(d, -probe).normalize();
      const ia = sphPointInRoom(a, entry), ib = sphPointInRoom(b, entry);
      if(ia && !ib){ sign[i] = 1; plus++; } else if(ib && !ia){ sign[i] = -1; minus++; }
    }
  }
  const global = plus >= minus ? 1 : -1;
  const out = [];
  let last = null;
  for(let i=0;i<n;i++){
    let d = dirs[i];
    if(!d){ out.push(last ? last.clone() : new THREE.Vector3(0,0,1)); continue; }
    d = d.clone().multiplyScalar(sign[i] || global);
    out.push(d); last = d;
  }
  return out;
}

// pushes one planar wall/door quad (a,b on the floor line, at/bt the same
// two points moved radially inward by their height) as two triangles whose
// FRONT face looks along `nrm` (the side that should be seen/lit), with the
// texture tiling at a fixed real-world scale.
function pushOrientedQuad(pos, nor, uv, a, b, bt, at, nrm, tile, height){
  const e1 = new THREE.Vector3().subVectors(b, a), e2 = new THREE.Vector3().subVectors(at, a);
  const cr = new THREE.Vector3().crossVectors(e1, e2);
  const flip = cr.dot(nrm) < 0; // cross(e1,e2) is the front normal for (a,b,bt)/(a,bt,at) winding
  const u = a.distanceTo(b) / tile, v = height / tile;
  // Keeping the floor edge as the FIRST two vertices (collision code reads
  // wallPositions in blocks of 18 floats and takes v0,v1 of each quad as its
  // floor segment), the other facing is produced by mirroring the quad
  // (b,a,at)+(b,at,bt) rather than by reversing the vertex order.
  const tris = flip
    ? [[b,a,at,[u,0],[0,0],[0,v]], [b,at,bt,[u,0],[0,v],[u,v]]]
    : [[a,b,bt,[0,0],[u,0],[u,v]], [a,bt,at,[0,0],[u,v],[0,v]]];
  tris.forEach(t=>{
    const vs = [t[0],t[1],t[2]], uvs = [t[3],t[4],t[5]];
    for(let k=0;k<3;k++){
      pos.push(vs[k].x, vs[k].y, vs[k].z);
      nor.push(nrm.x, nrm.y, nrm.z);
      uv.push(uvs[k][0], uvs[k][1]);
    }
  });
}
// a floor-line point moved radially INWARD (toward the core) by `h`
function raiseRadially(p, h){ return p.clone().multiplyScalar(1 - h/p.length()); }

const WALL_SIDE_OFFSET = 0.06; // the RENDERED copy of each room's wall sits this far into ITS room, so the two coincident copies of a shared wall never z-fight (collision keeps using the exact, un-offset boundary)
const wallColors = [];
const wallRenderPositions = [];
function wallTintForRoom(ri){
  const h = (ri*137.508) % 360; // the room's own hue (same golden-angle sweep roomColor() uses for the floor)
  const c = hsl2rgb(h, 0.55, 0.62);
  return [0.62+0.38*c[0], 0.62+0.38*c[1], 0.62+0.38*c[2]];
}

function buildWalls(){
  roomMapPolys.forEach(e=>{ roomPolyById[e.id] = e; });
  ROOMS.forEach((room, ri)=>{
    const n = room.pts3d.length;
    const doorEdgeIndexForPassage = doorEdgesByRoom[room.id] || {}; // edge index i -> passageIndex, see doorEdgesByRoom above
    const inward = computeRoomEdgeInward(room);
    roomEdgeInward[room.id] = inward;
    const tint = wallTintForRoom(ri);

    for(let i=0;i<n;i++){
      const p0 = room.pts3d[i], p1 = room.pts3d[(i+1)%n];
      const v0 = new THREE.Vector3(...p0), v1 = new THREE.Vector3(...p1);
      const top0 = raiseRadially(v0, WALL_HEIGHT), top1 = raiseRadially(v1, WALL_HEIGHT);

      // An edge shared with a neighbouring room is STILL a real wall (every
      // edge of every room is) - it simply also carries a door somewhere on
      // it. The edge is recorded here so buildDoors() can place ONE door of
      // sensible size on the shared run, instead of turning the whole
      // boundary into a single giant "door".
      if(doorEdgeIndexForPassage.hasOwnProperty(i)){
        const pi = doorEdgeIndexForPassage[i];
        (doorEdgesByPassage[pi] = doorEdgesByPassage[pi]||[]).push({v0,v1,top0,top1,roomId:room.id,idx:i,inward:inward[i]});
      }

      // this room's own copy of the wall, nudged into this room, front face
      // looking into the room, tinted with the room's own colour
      // collision geometry: the exact boundary, no offset (wallPositions is what
      // buildSolidTris/buildCollisionSegs read)
      pushOrientedQuad(wallPositions, [], [], v0, v1, top1, top0, inward[i], WALL_TEX_TILE, WALL_HEIGHT);
      // render geometry: this room's own copy, nudged into this room
      const off = inward[i].clone().multiplyScalar(WALL_SIDE_OFFSET);
      const a = v0.clone().add(off), b = v1.clone().add(off), bt = top1.clone().add(off), at = top0.clone().add(off);
      const before = wallRenderPositions.length;
      pushOrientedQuad(wallRenderPositions, wallNormals, wallUVs, a, b, bt, at, inward[i], WALL_TEX_TILE, WALL_HEIGHT);
      for(let k=before;k<wallRenderPositions.length;k+=3) wallColors.push(tint[0],tint[1],tint[2]);
    }
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(wallRenderPositions,3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(wallNormals,3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(wallUVs,2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(wallColors,3));
  const mat = new THREE.MeshStandardMaterial({map: makeRustyMetalTexture(), vertexColors:true, roughness:0.85, metalness:0.4, side:THREE.DoubleSide});
  const mesh = new THREE.Mesh(geo, mat);
  structureSpinGroup.add(mesh);
  wallMesh = mesh;
}

/* ============================================================================
   BUILD: doors — one quad per passage, filling exactly the gap left in the
   walls. Each door is its own Mesh with its own Material instance (not
   merged into one geometry like the walls/floor), so each one can be
   recolored individually later without touching the others. Clicking a
   door while inside (see the click handler below) steps the player through
   it into the neighbouring room - that's now how rooms connect, instead of
   just walking through an open gap.
   ============================================================================ */
const doorMeshes = [];
const doorSigns = [];
const doorSites = {}; // passageIndex -> {center (floor point, LOCAL), sideDir:{roomId -> unit tangent pointing INTO that room}}
const DOOR_TEX_TILE = 6;
const DOOR_WIDTH = 11;                 // a real doorway, not a whole wall
const DOOR_HEIGHT = WALL_HEIGHT*0.78;  // ~26 units: clearly shorter than the wall, so the wall reads as a wall above/around it
const DOOR_FRAME_PAD = 0.9, DOOR_FRAME_PAD_TOP = 1.3;
const DOOR_OFFSET = 0.16, FRAME_OFFSET = 0.10, PLAQUE_OFFSET = 0.32; // stacked off the wall surface: wall < frame < door < plaque
const DOOR_PLAQUE_CENTER_H = DOOR_HEIGHT*0.58;

// Finds, for one passage, the longest contiguous run of shared edges (in the
// room that owns the most shared boundary), and returns it as an ordered
// polyline of {a,b,inward} segments along the real wall.
function sharedRunSegments(edges){
  const byRoom = {};
  edges.forEach(e=>{ (byRoom[e.roomId] = byRoom[e.roomId]||[]).push(e); });
  let bestRoom = null, bestLen = -1;
  Object.keys(byRoom).forEach(rid=>{
    const len = byRoom[rid].reduce((s,e)=>s+e.v0.distanceTo(e.v1),0);
    if(len > bestLen){ bestLen = len; bestRoom = rid; }
  });
  const group = byRoom[bestRoom].slice().sort((p,q)=>p.idx-q.idx);
  const nEdges = roomById[bestRoom].pts3d.length;
  // split into runs of consecutive (cyclic) edge indices
  const runs = [];
  let cur = [group[0]];
  for(let k=1;k<group.length;k++){
    if(group[k].idx === cur[cur.length-1].idx+1) cur.push(group[k]);
    else { runs.push(cur); cur = [group[k]]; }
  }
  runs.push(cur);
  if(runs.length>1 && runs[0][0].idx===0 && runs[runs.length-1][runs[runs.length-1].length-1].idx===nEdges-1){
    runs[0] = runs.pop().concat(runs[0]); // the run wraps around the polygon's start
  }
  let best = runs[0], bl = -1;
  runs.forEach(r=>{ const l = r.reduce((s,e)=>s+e.v0.distanceTo(e.v1),0); if(l>bl){ bl=l; best=r; } });
  return { roomId: bestRoom, segs: best.map(e=>({a:e.v0, b:e.v1, inward:e.inward})) };
}
// sub-polyline of `segs` covering arclength [s0,s1] (clipped), as new segs
function sliceSegs(segs, s0, s1){
  const out = [];
  let acc = 0;
  for(const sg of segs){
    const len = sg.a.distanceTo(sg.b);
    const lo = Math.max(s0, acc), hi = Math.min(s1, acc+len);
    if(hi - lo > 1e-4 && len > 1e-6){
      const t0 = (lo-acc)/len, t1 = (hi-acc)/len;
      out.push({a: sg.a.clone().lerp(sg.b,t0), b: sg.a.clone().lerp(sg.b,t1), inward: sg.inward});
    }
    acc += len;
  }
  return out;
}

function buildDoors(){
  const doorTex = makeDoorMetalTexture();
  const frameMat = new THREE.MeshStandardMaterial({color:0x6b5430, roughness:0.45, metalness:0.7, side:THREE.DoubleSide});
  Object.keys(doorEdgesByPassage).forEach(key=>{
    const pi = parseInt(key,10);
    const p = PASSAGES[pi];
    const edges = doorEdgesByPassage[pi];
    if(!edges || !edges.length) return;
    const run = sharedRunSegments(edges);
    const segs = run.segs;
    let L = 0; segs.forEach(s=>{ L += s.a.distanceTo(s.b); });
    if(L < 1e-3) return;
    const W = Math.min(DOOR_WIDTH, L*0.9);
    const sc = L/2;
    const doorSegs = sliceSegs(segs, sc-W/2, sc+W/2);
    const frameSegs = sliceSegs(segs, Math.max(0, sc-W/2-DOOR_FRAME_PAD), Math.min(L, sc+W/2+DOOR_FRAME_PAD));
    if(!doorSegs.length) return;

    // the door's centre on the floor line, and which way each room lies
    const centerSeg = doorSegs[Math.floor(doorSegs.length/2)];
    const center = centerSeg.a.clone().add(centerSeg.b).multiplyScalar(0.5);
    const inwardC = centerSeg.inward.clone();
    const otherRoomId = run.roomId===p.a ? p.b : p.a;
    doorSites[pi] = { center, sideDir: { [run.roomId]: inwardC.clone(), [otherRoomId]: inwardC.clone().negate() } };

    const dPos=[], dNor=[], dUv=[], fPos=[], fNor=[], fUv=[];
    [1,-1].forEach(sigma=>{
      doorSegs.forEach(sg=>{
        const n = sg.inward.clone().multiplyScalar(sigma);
        const off = n.clone().multiplyScalar(DOOR_OFFSET);
        const a = sg.a.clone().add(off), b = sg.b.clone().add(off);
        pushOrientedQuad(dPos,dNor,dUv, a,b, raiseRadially(b,DOOR_HEIGHT), raiseRadially(a,DOOR_HEIGHT), n, DOOR_TEX_TILE, DOOR_HEIGHT);
      });
      frameSegs.forEach(sg=>{
        const n = sg.inward.clone().multiplyScalar(sigma);
        const off = n.clone().multiplyScalar(FRAME_OFFSET);
        const a = sg.a.clone().add(off), b = sg.b.clone().add(off);
        pushOrientedQuad(fPos,fNor,fUv, a,b, raiseRadially(b,DOOR_HEIGHT+DOOR_FRAME_PAD_TOP), raiseRadially(a,DOOR_HEIGHT+DOOR_FRAME_PAD_TOP), n, DOOR_TEX_TILE, DOOR_HEIGHT+DOOR_FRAME_PAD_TOP);
      });
    });
    const mk = (pos,nor,uv)=>{
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor,3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv,2));
      return g;
    };
    const mat = new THREE.MeshStandardMaterial({map: doorTex, roughness:0.75, metalness:0.5, side:THREE.DoubleSide});
    const mesh = new THREE.Mesh(mk(dPos,dNor,dUv), mat);
    mesh.userData.passageIndex = pi;
    {
      // door quad for the "close enough and roughly facing it" fallback:
      // the chord of the door's own run, and straight "up" toward the core
      const first = doorSegs[0].a, last = doorSegs[doorSegs.length-1].b;
      const e1 = last.clone().sub(first); const w = e1.length(); e1.multiplyScalar(1/(w||1));
      const e2 = center.clone().normalize().negate();
      mesh.userData.quad = { v0: first.clone(), e1, e2, w, h: DOOR_HEIGHT };
    }
    structureSpinGroup.add(mesh);
    doorMeshes.push(mesh);
    const frame = new THREE.Mesh(mk(fPos,fNor,fUv), frameMat);
    structureSpinGroup.add(frame);

    // One nameplate per room-side, MOUNTED ON the door itself: its centre is
    // a point of the real door (centre of the doorway, raised to eye level),
    // pushed just off the surface toward its own room - never an average of
    // several edges, so it can't drift off the wall at a bend.
    const plaqueW = Math.min(9.0, W*0.85), plaqueH = plaqueW*(168/480);
    [run.roomId, otherRoomId].forEach(roomId=>{
      const faceDir = doorSites[pi].sideDir[roomId].clone();
      const otherId = roomId===p.a ? p.b : p.a;
      const other = roomById[otherId];
      const plaqueTex = makeDoorPlaqueTexture(dispName(other));
      const plaqueMat = new THREE.MeshStandardMaterial({map: plaqueTex, roughness:0.6, metalness:0.3, side:THREE.FrontSide});
      const plaque = new THREE.Mesh(new THREE.PlaneGeometry(plaqueW,plaqueH), plaqueMat);
      plaque.position.copy(raiseRadially(center, DOOR_PLAQUE_CENTER_H)).addScaledVector(faceDir, PLAQUE_OFFSET);
      const upHint = center.clone().normalize().negate();
      const zAxis = faceDir.clone();
      let xAxis = new THREE.Vector3().crossVectors(upHint, zAxis);
      if(xAxis.lengthSq() < 1e-8) xAxis.crossVectors(Math.abs(zAxis.x)<0.9 ? new THREE.Vector3(1,0,0) : new THREE.Vector3(0,0,1), zAxis);
      xAxis.normalize();
      const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();
      plaque.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
      plaque.userData.otherRoomId = otherId; // so rebuildDoorSigns() can redraw this text in a new language
      plaque.userData.roomId = roomId;       // the room whose side of the door this plaque faces
      plaque.userData.faceDir = faceDir.clone();
      structureSpinGroup.add(plaque);
      doorSigns.push(plaque);
    });
  });
}

/* ============================================================================
   Room labels: lightweight canvas-texture sprites at each room centroid,
   pulled slightly toward the center so they float just above the floor.
   ============================================================================ */
const labelSprites = [];
function makeLabelSprite(text){
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const ctx = cv.getContext('2d');
  ctx.font = '28px Arial';
  ctx.fillStyle = 'rgba(230,220,200,0.85)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(cv);
  const mat = new THREE.SpriteMaterial({map:tex, transparent:true, depthTest:true});
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(18,4.5,1);
  return sprite;
}
let labelsVisible = false; // hidden by default - toggled with the "הצג שמות" button
function buildLabels(){
  ROOMS.forEach(room=>{
    const label = dispName(room);
    const sprite = makeLabelSprite(label);
    const c = new THREE.Vector3(...room.centroid3d);
    const pos = c.clone().sub(c.clone().normalize().multiplyScalar(WALL_HEIGHT*0.5)); // stay well under the new ceiling
    sprite.position.copy(pos);
    sprite.userData.roomId = room.id;
    sprite.visible = labelsVisible;
    structureSpinGroup.add(sprite);
    labelSprites.push(sprite);
  });
}
function toggleLabels(){
  labelsVisible = !labelsVisible;
  labelSprites.forEach(s=>s.visible = labelsVisible);
  const lb = document.getElementById('btnLabels'); if(lb) lb.classList.toggle('active', labelsVisible);
}
// re-bake the room-label and door-nameplate canvas textures after a
// language switch - their text is baked into a bitmap, not live DOM text,
// so simply changing a string isn't enough to update what's on screen.
function rebuildLabels(){
  labelSprites.forEach(sprite=>{
    const room = roomById[sprite.userData.roomId];
    if(!room) return;
    const old = sprite.material.map;
    sprite.material.map = makeLabelSprite(dispName(room)).material.map;
    sprite.material.needsUpdate = true;
    if(old) old.dispose();
  });
}
function rebuildDoorSigns(){
  doorSigns.forEach(plaque=>{
    const other = roomById[plaque.userData.otherRoomId];
    if(!other) return;
    const old = plaque.material.map;
    plaque.material.map = makeDoorPlaqueTexture(dispName(other));
    plaque.material.needsUpdate = true;
    if(old) old.dispose();
  });
}

/* ============================================================================
   Outer shell: the wall that blocks the whole structure from outside. It
   doesn't move at all - and, critically, it IS the floor: an earlier version
   built this as a separate, larger sphere wrapped around the outside of
   everything, but rooms are fully sealed (floor+walls+ceiling), so that
   outer sphere could never actually be seen from interior play - the floor
   always stood between the player and it. The floor's outward face (seen
   from outside/above in exterior view, radius > FLOOR_R looking
   in) already carries the per-room colors from buildFloors(). This adds the
   floor's OTHER face - inward, radius < FLOOR_R, exactly what a player
   standing on it and looking down actually sees - as the stone "wall from
   outside", by sharing the very same geometry with a second, BackSide-only,
   stone-textured mesh. Front/back culling alone then decides which one
   renders, correctly and automatically, from any vantage point, with zero
   mode-based visibility toggling needed.
   ============================================================================ */
function buildAtmosphere(){
  const geo = floorMesh.geometry;
  // equirectangular UV from each vertex's direction, purely for tiling the
  // stone texture - the floor has no UVs (it's vertex-colored), so this adds
  // them without touching position/normal/color.
  if(!geo.getAttribute('uv')){
    const pos = geo.getAttribute('position');
    const uvs = new Float32Array(pos.count*2);
    const p = new THREE.Vector3();
    for(let i=0;i<pos.count;i++){
      p.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
      const u = 0.5 + Math.atan2(p.z, p.x)/(2*Math.PI);
      const v = 0.5 - Math.asin(THREE.MathUtils.clamp(p.y,-1,1))/Math.PI;
      uvs[i*2] = u*48; uvs[i*2+1] = v*24; // pre-scaled tiling, texture set to RepeatWrapping
    }
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs,2));
  }
  // Every front face of this shell looks OUT (see buildFloors), so seen from
  // outside the sphere the room colours show (FrontSide) and seen from inside
  // the structure the stone shows (BackSide, below).
  floorMesh.material.side = THREE.FrontSide;
  const innerMat = new THREE.MeshStandardMaterial({map: makeStoneTexture(), roughness:1, metalness:0, side:THREE.BackSide});
  const innerMesh = new THREE.Mesh(geo, innerMat);
  structureSpinGroup.add(innerMesh);
}

/* ============================================================================
   Ground plane far below, just so exterior view has a horizon reference.
   ============================================================================ */
let groundMesh;
let exteriorDirLabels; // N/S/E/W signs standing on the exterior ground, main orbit view - built after
                        // makeMiniDirectionSprite() exists (defined further down), so buildGround()
                        // itself only makes the ground plane; buildExteriorDirLabels() (called from
                        // init(), after that function is defined) adds the signs.
function buildGround(){
  // a soft radial grid baked into a canvas texture, rather than a flat fill -
  // a perfectly flat dark plane on a near-black background was practically
  // invisible (barely distinguishable from empty space); the grid gives it
  // an actual visible surface/horizon, and a warmer/brighter base color
  // helps it read as ground rather than void even before the grid lines.
  const gcv = document.createElement('canvas');
  gcv.width = gcv.height = 512;
  const gctx = gcv.getContext('2d');
  gctx.fillStyle = '#4a4234';
  gctx.fillRect(0,0,512,512);
  gctx.strokeStyle = 'rgba(201,166,107,0.35)';
  gctx.lineWidth = 2;
  for(let i=0;i<=512;i+=32){
    gctx.beginPath(); gctx.moveTo(i,0); gctx.lineTo(i,512); gctx.stroke();
    gctx.beginPath(); gctx.moveTo(0,i); gctx.lineTo(512,i); gctx.stroke();
  }
  const gtex = new THREE.CanvasTexture(gcv);
  gtex.wrapS = gtex.wrapT = THREE.RepeatWrapping;
  gtex.repeat.set(40,40);
  groundMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(6000,6000),
    new THREE.MeshStandardMaterial({map:gtex, color:0x8a7a5c, roughness:1})
  );
  groundMesh.rotation.x = -Math.PI/2;
  // raised to the sphere's own CENTER height (y=0) - exactly like the
  // mini-map's own ground (miniGroundY=0) - so it fully hides the whole
  // bottom hemisphere from every angle the exterior orbit camera can reach
  // (orbit.pitch is clamped to stay above the horizon - see wireExterior
  // below), not just a stray horizon backdrop far beneath it.
  groundMesh.position.y = 0;
  scene.add(groundMesh);
}

/* ============================================================================
   EXTERIOR SHELL — the fixed "building" the real structure sits inside,
   scaled up from and matching the mini-map's own miniCubeGroup design
   (ground hiding the bottom hemisphere + an opaque white CUBE that really
   sits where the sphere is, with the door built as an actual opening in one
   of its own faces - not a separate floating dome/panel, per request).
   World-fixed: a direct child of `scene`, never of structureSpinGroup, so it
   never rotates or tilts along with the structure inside it.
   ============================================================================ */
let exteriorShellParts = [];
function buildExteriorShell(){
  const R = FLOOR_R*1.03; // half-extent of the cube, just outside the real sphere so it fully encloses it with no z-fighting
  const cubeMat = new THREE.MeshStandardMaterial({color:0xf2efe6, roughness:0.9, metalness:0.02, side:THREE.DoubleSide});
  const cube = new THREE.Mesh(new THREE.BoxGeometry(R*2, R*2, R*2), cubeMat);
  scene.add(cube);
  // a thin dark seam along the cube's own edges, so it reads as a real
  // building's corners rather than a featureless white block
  const cubeEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(R*2, R*2, R*2)),
    new THREE.LineBasicMaterial({color:0x3a3630, transparent:true, opacity:0.5})
  );
  scene.add(cubeEdges);

  // door: a real opening cut into the WEST face of the cube itself (not a
  // separate floating panel) - built as its own small patch of dark "sky"
  // geometry, mounted flush on that face, so it reads as an actual doorway
  // into the dark interior. Positioned on the WORLD_WEST face, matching the
  // mini-map's door exactly (see miniCubeGroup above - both sit at local
  // +X = WORLD_WEST).
  const doorW = R*0.34, doorH = R*0.30;
  const doorCenterY = doorH/2; // stands on the ground (y=0), like the mini-map's door
  const doorHole = new THREE.Mesh(
    new THREE.PlaneGeometry(doorW, doorH),
    new THREE.MeshBasicMaterial({color:0x07070a, side:THREE.DoubleSide}) // matches scene.background - reads as an open doorway into the dark interior
  );
  doorHole.position.set(WORLD_WEST.x*(R+0.5), doorCenterY, WORLD_WEST.z*(R+0.5));
  doorHole.rotation.y = Math.PI/2;
  doorHole.renderOrder = 1;
  scene.add(doorHole);
  const doorFrame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(doorW, doorH)),
    new THREE.LineBasicMaterial({color:0x333333})
  );
  doorFrame.position.copy(doorHole.position);
  doorFrame.rotation.copy(doorHole.rotation);
  scene.add(doorFrame);
  exteriorShellParts = [cube, cubeEdges, doorHole, doorFrame];
}
function buildExteriorDirLabels(){
  exteriorDirLabels = {};
  const dirRadius = FLOOR_R*1.7;
  // stand a bit above the ground plane (now raised to y=0, matching the
  // mini-map's own miniGroundY=0 - see buildGround()), not above its old
  // position far below the sphere.
  const labelY = FLOOR_R*0.22;
  [
    ['N', WORLD_NORTH],
    ['S', WORLD_SOUTH],
    ['E', WORLD_EAST],
    ['W', WORLD_WEST],
  ].forEach(([key, dir])=>{
    const sprite = makeMiniDirectionSprite('#c9a66b');
    sprite.position.set(dir.x*dirRadius, labelY, dir.z*dirRadius);
    sprite.scale.set(FLOOR_R*0.42, FLOOR_R*0.42, 1);
    scene.add(sprite);
    exteriorDirLabels[key] = sprite;
  });
  updateExteriorDirLabelText();
}
function updateExteriorDirLabelText(){
  if(!exteriorDirLabels) return;
  const t = UI_TEXT[settings.lang]||UI_TEXT.he;
  const glyphs = {N:t.compassN, S:t.compassS, E:t.compassE, W:t.compassW};
  Object.keys(exteriorDirLabels).forEach(key=>{
    const sprite = exteriorDirLabels[key];
    const cv = sprite.userData.canvas, ctx = sprite.userData.ctx;
    ctx.clearRect(0,0,cv.width,cv.height);
    ctx.font = 'bold 40px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#00000099';
    ctx.fillText(glyphs[key], cv.width/2+2, cv.height/2+2);
    ctx.fillStyle = '#c9a66b';
    ctx.fillText(glyphs[key], cv.width/2, cv.height/2);
    sprite.material.map.needsUpdate = true;
  });
}

