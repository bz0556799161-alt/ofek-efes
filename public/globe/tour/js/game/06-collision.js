/* ============================================================================
   3D CAPSULE COLLISION — real floor-to-ceiling wall/door volumes, not a 2D
   point-on-a-line test. `solidTris` holds every wall triangle AND every door
   triangle (doors are solid to ordinary movement - the only way through one
   is the explicit click/passThroughDoor() interaction, never by walking into
   the gap), each with a precomputed centroid+bounding-radius for a cheap
   per-frame proximity cull. All of this lives in the structure's LOCAL
   (pre-rotation) frame, same as wallPositions/doorEdgesByPassage - it is
   built once and never moves; what moves each frame is the player's
   position, converted INTO this local frame for the test (see
   stepPlayerPhysics), never the geometry itself.
   ============================================================================ */
let solidTris = [];
// How many of solidTris' leading entries are REAL boundary walls (never a
// door) - set right after the wall loop below, before the door loop runs,
// so solidTris.slice(0, wallOnlyTriCount) (or just looping i<wallOnlyTriCount)
// is exactly the wall-only subset. Same wall-only/door distinction
// wallOnlySegCount already draws for the old climbing mechanic; this is the
// full-3D-triangle version of it, used by wall-walk mode (see
// nearestWallSurface3D below) to find which real wall the player is
// actually touching.
let wallOnlyTriCount = 0;
function buildSolidTris(){
  solidTris = [];
  function addTri(ax,ay,az, bx,by,bz, cx,cy,cz){
    const cx0=(ax+bx+cx)/3, cy0=(ay+by+cy)/3, cz0=(az+bz+cz)/3;
    const r1=Math.hypot(ax-cx0,ay-cy0,az-cz0), r2=Math.hypot(bx-cx0,by-cy0,bz-cz0), r3=Math.hypot(cx-cx0,cy-cy0,cz-cz0);
    // unit plane normal (arbitrary side - callers orient it toward whichever
    // side they care about); zero for a degenerate triangle
    let nx, ny, nz;
    const e1x=bx-ax,e1y=by-ay,e1z=bz-az,e2x=cx-ax,e2y=cy-ay,e2z=cz-az;
    nx=e1y*e2z-e1z*e2y; ny=e1z*e2x-e1x*e2z; nz=e1x*e2y-e1y*e2x;
    const nl=Math.hypot(nx,ny,nz);
    if(nl>1e-9){ nx/=nl; ny/=nl; nz/=nl; } else { nx=ny=nz=0; }
    solidTris.push({ax,ay,az,bx,by,bz,cx,cy,cz, cx0,cy0,cz0, rad:Math.max(r1,r2,r3), nx,ny,nz});
  }
  for(let i=0;i<wallPositions.length;i+=9){
    addTri(wallPositions[i],wallPositions[i+1],wallPositions[i+2],
           wallPositions[i+3],wallPositions[i+4],wallPositions[i+5],
           wallPositions[i+6],wallPositions[i+7],wallPositions[i+8]);
  }
  wallOnlyTriCount = solidTris.length; // walls only, before doors are appended below
  // Doors need no triangles of their own any more: every room edge (shared
  // ones included) is a full wall, and a door is a slab mounted just in front
  // of it - walking into a door is blocked by the wall behind it.
}

// Nearest REAL boundary-wall triangle (walls only, never a door - see
// wallOnlyTriCount above) to a structure-LOCAL point. Returns the true
// closest point on that triangle and its outward surface normal, derived
// fresh as (point - closestPoint) normalized - so it always points toward
// whichever side of the wall the point is actually on, exactly the same
// convention resolveWallCollision3D's own push-out direction already uses,
// never a direction baked into the triangle/its winding.
const _wsClosest = {x:0,y:0,z:0};
function nearestWallSurface3D(localPos){
  let bestDist = Infinity, best = null;
  for(let i=0;i<wallOnlyTriCount;i++){
    const t = solidTris[i];
    const dcx=localPos.x-t.cx0, dcy=localPos.y-t.cy0, dcz=localPos.z-t.cz0;
    const cullR = t.rad + bestDist;
    if(dcx*dcx+dcy*dcy+dcz*dcz > cullR*cullR) continue;
    closestPointOnTriangleXYZ(localPos.x,localPos.y,localPos.z, t.ax,t.ay,t.az, t.bx,t.by,t.bz, t.cx,t.cy,t.cz, _wsClosest);
    const dx=localPos.x-_wsClosest.x, dy=localPos.y-_wsClosest.y, dz=localPos.z-_wsClosest.z;
    const dist = Math.sqrt(dx*dx+dy*dy+dz*dz);
    if(dist < bestDist){
      bestDist = dist;
      best = {dist,
        nx: dist>1e-5 ? dx/dist : 0, ny: dist>1e-5 ? dy/dist : 0, nz: dist>1e-5 ? dz/dist : 0};
    }
  }
  return best;
}

// Wall-walk mode's equivalent of resolveRadialFloorCeiling: the player's
// local "floor" is whichever real boundary wall is actually nearest the
// feet, instead of the sphere's radial floor shell. Snaps the feet to
// resting distance (PLAYER_RADIUS, the same radius the ordinary capsule
// collision already keeps every part of the body at least that far from
// any wall/door triangle) from that wall's own surface, and cancels
// whatever velocity is still pulling further INTO it - exactly the same
// snap-and-cancel rule resolveRadialFloorCeiling applies to the floor
// shell, just built on a triangle's closest point instead of a sphere
// radius. Returns the contact normal (structure-LOCAL) when grounded, so
// the caller can turn it into this frame's wall-walk "up".
function resolveWallStick(localPos, localVel){
  const info = nearestWallSurface3D(localPos);
  if(!info) return null;
  const REST_EPS = 0.12; // same resting epsilon resolveRadialFloorCeiling uses for the floor shell
  if(info.dist > PLAYER_RADIUS + REST_EPS) return null;
  const push = PLAYER_RADIUS - info.dist;
  localPos.x += info.nx*push; localPos.y += info.ny*push; localPos.z += info.nz*push;
  const vn = localVel.x*info.nx + localVel.y*info.ny + localVel.z*info.nz;
  if(vn < 0){ localVel.x -= info.nx*vn; localVel.y -= info.ny*vn; localVel.z -= info.nz*vn; }
  return {x:info.nx, y:info.ny, z:info.nz};
}

// closest point on triangle (a,b,c) to point p - classic region-based
// algorithm (Ericson, "Real-Time Collision Detection"), written against
// plain numbers (not THREE.Vector3) since it runs over thousands of
// triangles every frame.
function closestPointOnTriangleXYZ(px,py,pz, ax,ay,az, bx,by,bz, cx,cy,cz, out){
  const abx=bx-ax, aby=by-ay, abz=bz-az;
  const acx=cx-ax, acy=cy-ay, acz=cz-az;
  const apx=px-ax, apy=py-ay, apz=pz-az;
  const d1=abx*apx+aby*apy+abz*apz, d2=acx*apx+acy*apy+acz*apz;
  if(d1<=0 && d2<=0){ out.x=ax; out.y=ay; out.z=az; return; }
  const bpx=px-bx, bpy=py-by, bpz=pz-bz;
  const d3=abx*bpx+aby*bpy+abz*bpz, d4=acx*bpx+acy*bpy+acz*bpz;
  if(d3>=0 && d4<=d3){ out.x=bx; out.y=by; out.z=bz; return; }
  const vc=d1*d4-d3*d2;
  if(vc<=0 && d1>=0 && d3<=0){ const v=d1/(d1-d3); out.x=ax+abx*v; out.y=ay+aby*v; out.z=az+abz*v; return; }
  const cpx=px-cx, cpy=py-cy, cpz=pz-cz;
  const d5=abx*cpx+aby*cpy+abz*cpz, d6=acx*cpx+acy*cpy+acz*cpz;
  if(d6>=0 && d5<=d6){ out.x=cx; out.y=cy; out.z=cz; return; }
  const vb=d5*d2-d1*d6;
  if(vb<=0 && d2>=0 && d6<=0){ const w=d2/(d2-d6); out.x=ax+acx*w; out.y=ay+acy*w; out.z=az+acz*w; return; }
  const va=d3*d6-d5*d4;
  if(va<=0 && (d4-d3)>=0 && (d5-d6)>=0){
    const w=(d4-d3)/((d4-d3)+(d5-d6));
    out.x=bx+(cx-bx)*w; out.y=by+(cy-by)*w; out.z=bz+(cz-bz)*w; return;
  }
  const denom=1/(va+vb+vc), v=vb*denom, w=vc*denom;
  out.x=ax+abx*v+acx*w; out.y=ay+aby*v+acy*w; out.z=az+abz*v+acz*w;
}

// pushes localPos out of any solid wall/door triangle it (or samples along
// its capsule height) penetrates, and cancels the inward velocity component
// at each contact - true floor-to-ceiling volume collision, so a wall can't
// be walked through, jumped over into, or dived through at the head while
// the feet are clear (or vice versa): every sample along the capsule's real
// height is tested independently.
const _wcClosest = {x:0,y:0,z:0};
// The player is a capsule: a centre line from the feet to the top of the head,
// PLAYER_RADIUS thick. Walls here are radial (they follow the sphere), so they
// are generally NOT parallel to the world-vertical capsule: a slanted wall or
// door plane can pass close to the middle of the capsule while staying well
// clear of the three points the old version sampled (feet, mid, near-head) -
// confirmed on the real geometry, where a door triangle ended up ~0.1 from the
// capsule's centre line between two samples. The centre line is therefore
// sampled densely enough that consecutive spheres of radius PLAYER_RADIUS
// overlap (spacing 0.9 radius), which leaves no gap a triangle can slip through.
const CAPSULE_COLL_SAMPLES = Math.ceil(CAPSULE_HEIGHT/(PLAYER_RADIUS*0.9)) + 1;
const _wcNear = [];
function resolveWallCollision3D(localPos, localVel, upLocal){
  // Only triangles that can reach the capsule matter; find them once.
  const reachR = CAPSULE_HEIGHT + PLAYER_RADIUS + 2;
  _wcNear.length = 0;
  {
    const mx=localPos.x+upLocal.x*CAPSULE_HEIGHT*0.5, my=localPos.y+upLocal.y*CAPSULE_HEIGHT*0.5, mz=localPos.z+upLocal.z*CAPSULE_HEIGHT*0.5;
    const R = reachR*0.5 + PLAYER_RADIUS + 2; // around the capsule's middle
    for(let i=0;i<solidTris.length;i++){
      const t = solidTris[i];
      const dx=mx-t.cx0, dy=my-t.cy0, dz=mz-t.cz0;
      const cr = t.rad + R;
      if(dx*dx+dy*dy+dz*dz <= cr*cr) _wcNear.push(t);
    }
  }
  // 8 iterations: a corner is two (or more) simultaneous constraints, and
  // pushing the capsule out of one triangle can re-penetrate a second one
  // resolved earlier in the same pass (Gauss-Seidel); 8 converges in a tight
  // corner without any shortcut or special-cased corner detection.
  for(let iter=0; iter<8; iter++){
    for(let si=0; si<CAPSULE_COLL_SAMPLES; si++){
      const f = si/(CAPSULE_COLL_SAMPLES-1);
      const sx = localPos.x + upLocal.x*CAPSULE_HEIGHT*f;
      const sy = localPos.y + upLocal.y*CAPSULE_HEIGHT*f;
      const sz = localPos.z + upLocal.z*CAPSULE_HEIGHT*f;
      for(let i=0;i<_wcNear.length;i++){
        const t = _wcNear[i];
        const dcx=sx-t.cx0, dcy=sy-t.cy0, dcz=sz-t.cz0;
        const cullR = t.rad + PLAYER_RADIUS;
        if(dcx*dcx+dcy*dcy+dcz*dcz > cullR*cullR) continue;
        closestPointOnTriangleXYZ(sx,sy,sz, t.ax,t.ay,t.az, t.bx,t.by,t.bz, t.cx,t.cy,t.cz, _wcClosest);
        const dx=sx-_wcClosest.x, dy=sy-_wcClosest.y, dz=sz-_wcClosest.z;
        const dist = Math.sqrt(dx*dx+dy*dy+dz*dz);
        if(dist < PLAYER_RADIUS && dist > 1e-5){
          const push = (PLAYER_RADIUS-dist)/dist;
          const nx=dx/dist, ny=dy/dist, nz=dz/dist;
          localPos.x += dx*push; localPos.y += dy*push; localPos.z += dz*push;
          const vn = localVel.x*nx+localVel.y*ny+localVel.z*nz;
          if(vn < 0){ localVel.x -= nx*vn; localVel.y -= ny*vn; localVel.z -= nz*vn; }
        }
      }
    }
  }
}

// Same technique as resolveWallCollision3D above (iterative closest-point
// push-out against every solid wall/door triangle in solidTris - the exact
// same array the player's own body is kept clear of), applied to a single
// point instead of a 3-sample capsule, for the third-person camera. The
// camera's position is only an aim target, not something WASD or gravity
// moves, so it needs no velocity cancellation, just "never end up closer
// than `radius` to any wall or door triangle" - a few iterations so a
// corner (two triangles constraining the point from different directions
// at once) actually converges instead of oscillating between them.
const _camClosest = {x:0,y:0,z:0};
function resolveCameraWallPush(localPos, radius){
  for(let iter=0; iter<4; iter++){
    for(let i=0;i<solidTris.length;i++){
      const t = solidTris[i];
      const dcx=localPos.x-t.cx0, dcy=localPos.y-t.cy0, dcz=localPos.z-t.cz0;
      const cullR = t.rad + radius;
      if(dcx*dcx+dcy*dcy+dcz*dcz > cullR*cullR) continue;
      closestPointOnTriangleXYZ(localPos.x,localPos.y,localPos.z, t.ax,t.ay,t.az, t.bx,t.by,t.bz, t.cx,t.cy,t.cz, _camClosest);
      const dx=localPos.x-_camClosest.x, dy=localPos.y-_camClosest.y, dz=localPos.z-_camClosest.z;
      const dist = Math.sqrt(dx*dx+dy*dy+dz*dz);
      if(dist < radius && dist > 1e-5){
        const push = (radius-dist)/dist;
        localPos.x += dx*push; localPos.y += dy*push; localPos.z += dz*push;
      }
    }
  }
}

// floor: the outer shell at radius FLOOR_R (feet can't sink past it - solid
// material). ceiling: the inner shell at radius CEIL_R, tested at the head
// sample (capsule top can't push past it either). Both are genuinely radial
// (the shell IS a sphere), independent of whatever direction WORLD_UP
// happens to be relative to this particular point on it - which is exactly
// what makes a room whose floor isn't level w.r.t. true gravity behave
// correctly: gravity (WORLD_DOWN) still pulls the capsule off a
// misaligned floor and lets it slide/fall, while a floor that DOES face
// true gravity-down stops the fall right there, with no special-casing.
const _rfcN = new THREE.Vector3(), _rfcHead = new THREE.Vector3(), _rfcNh = new THREE.Vector3(), _rfcQ = new THREE.Vector3(), _rfcNq = new THREE.Vector3();
// The capsule is bounded between TWO spherical shells and BOTH are solid to its
// whole body, whichever way up it is standing:
//   - the outer (floor) shell, r <= FLOOR_R, bounds the two END points of the
//     axis (r is convex along a line, so its maximum is always at an end);
//   - the inner (star-wall) shell, r >= CEIL_R, bounds the axis point that is
//     CLOSEST to the centre - not just the head: in a room that hangs upside-
//     down (gravity pointing at the star wall) it is the FEET that stand on it.
// The returned value is "a shell supports the capsule from below": the shell's
// surface normal (pointing into the room) has a positive component along `upLocal`.
// The exact contact normal for the slope test is left in _rfcSupportN/_rfcSupportDot.
const _rfcSupportN = new THREE.Vector3();
let _rfcSupportDot = -2;
function resolveRadialFloorCeiling(localPos, localVel, upLocal){
  _rfcSupportDot = -2;
  let grounded = false;
  // ---- outer shell: feet and head ----
  for(let end=0; end<2; end++){
    if(end===0) _rfcQ.copy(localPos); else _rfcQ.copy(localPos).addScaledVector(upLocal, CAPSULE_HEIGHT);
    const r = _rfcQ.length();
    if(r < 1e-6) continue;
    _rfcNq.copy(_rfcQ).multiplyScalar(1/r);
    if(r >= FLOOR_R){
      localPos.addScaledVector(_rfcNq, FLOOR_R - r);
      const outward = localVel.dot(_rfcNq);
      if(outward > 0) localVel.addScaledVector(_rfcNq, -outward);
    }
    if(r >= FLOOR_R - 0.12){ // resting on / pressing against the shell (the thin epsilon counts as contact)
      const d = -_rfcNq.dot(upLocal); // normal facing the room is -N here
      if(d > _rfcSupportDot){ _rfcSupportDot = d; _rfcSupportN.copy(_rfcNq).negate(); }
      if(end===0) grounded = true;
    }
  }
  // ---- inner shell: the axis point nearest the centre ----
  const hAlong = THREE.MathUtils.clamp(-localPos.dot(upLocal), 0, CAPSULE_HEIGHT);
  _rfcQ.copy(localPos).addScaledVector(upLocal, hAlong);
  const qr = _rfcQ.length();
  if(qr > 1e-6){
    _rfcNq.copy(_rfcQ).multiplyScalar(1/qr);
    if(qr < CEIL_R){
      localPos.addScaledVector(_rfcNq, CEIL_R - qr);
      const vh = localVel.dot(_rfcNq);
      if(vh < 0) localVel.addScaledVector(_rfcNq, -vh);
    }
    if(qr <= CEIL_R + 0.12){
      const d = _rfcNq.dot(upLocal); // normal facing the room is +N here
      if(d > _rfcSupportDot){ _rfcSupportDot = d; _rfcSupportN.copy(_rfcNq); }
      if(d > 0.5) grounded = true; // standing ON the star wall (an upside-down room)
    }
  }
  return grounded;
}

// Best supporting surface under the capsule right now: the contact (shells or
// wall/door triangles) whose surface normal points most along `upLocal`.
// Returns that dot product (cos of the surface's slope from true horizontal;
// 1 = flat floor, 0 = vertical wall, <0 = overhang) and leaves the unit contact
// normal (pointing from the surface toward the player) in `outN`.
// Triangle contacts use the same dense centre-line samples as the collision
// itself, with a small tolerance past the capsule radius.
const _fsCP = {x:0,y:0,z:0};
function findSupportContact(localPos, upLocal, outN, tol){
  if(tol===undefined) tol = 0.15;
  let best = -2;
  // shells (re-evaluated at the final position)
  for(let end=0; end<2; end++){
    _rfcQ.copy(localPos); if(end===1) _rfcQ.addScaledVector(upLocal, CAPSULE_HEIGHT);
    const r = _rfcQ.length(); if(r<1e-6) continue;
    if(r >= FLOOR_R - tol){ _rfcNq.copy(_rfcQ).multiplyScalar(-1/r); const d=_rfcNq.dot(upLocal); if(d>best){ best=d; outN.copy(_rfcNq); } }
  }
  {
    const hAlong = THREE.MathUtils.clamp(-localPos.dot(upLocal), 0, CAPSULE_HEIGHT);
    _rfcQ.copy(localPos).addScaledVector(upLocal, hAlong);
    const qr = _rfcQ.length();
    if(qr>1e-6 && qr <= CEIL_R + tol){ _rfcNq.copy(_rfcQ).multiplyScalar(1/qr); const d=_rfcNq.dot(upLocal); if(d>best){ best=d; outN.copy(_rfcNq); } }
  }
  // wall / door triangles (the near list gathered by the last wall resolution)
  const R = PLAYER_RADIUS + tol;
  for(let si=0; si<CAPSULE_COLL_SAMPLES; si++){
    const f = si/(CAPSULE_COLL_SAMPLES-1);
    const sx = localPos.x + upLocal.x*CAPSULE_HEIGHT*f, sy = localPos.y + upLocal.y*CAPSULE_HEIGHT*f, sz = localPos.z + upLocal.z*CAPSULE_HEIGHT*f;
    for(let i=0;i<_wcNear.length;i++){
      const t = _wcNear[i];
      const dcx=sx-t.cx0, dcy=sy-t.cy0, dcz=sz-t.cz0;
      const cr = t.rad + R;
      if(dcx*dcx+dcy*dcy+dcz*dcz > cr*cr) continue;
      closestPointOnTriangleXYZ(sx,sy,sz, t.ax,t.ay,t.az, t.bx,t.by,t.bz, t.cx,t.cy,t.cz, _fsCP);
      const dx=sx-_fsCP.x, dy=sy-_fsCP.y, dz=sz-_fsCP.z;
      const dist = Math.sqrt(dx*dx+dy*dy+dz*dz);
      if(dist > R || dist < 1e-6) continue;
      const d = (dx*upLocal.x+dy*upLocal.y+dz*upLocal.z)/dist;
      if(d > best){ best = d; outN.set(dx/dist, dy/dist, dz/dist); }
    }
  }
  return best;
}

// True nearest-surface distance to a (structure-LOCAL) point - not just
// "distance from the radial floor shell measured straight out from the
// sphere's center". The player's real floor at any given moment is
// whichever solid surface - the radial floor shell, the radial ceiling
// shell, or a wall/door triangle - genuinely sits closest, exactly like it
// looks and feels standing in the room. The old "height from floor" HUD was
// just FLOOR_R minus the radial distance from center, which silently
// assumes the radial floor shell is always the relevant surface - so
// walking up next to a boundary wall (whose triangles span the FULL height
// from the floor shell to the ceiling shell) read as a rising "height from
// floor" the whole way there, even while standing on solid ground right
// beside it the entire time, because the radial distance from the sphere's
// CENTER has nothing to do with how close that wall actually is. This
// checks every real solid surface and returns the minimum, so it reads
// (near) zero exactly when - and only when - the player is genuinely
// touching something solid, floor, wall, or ceiling alike.
const _nsClosest = new THREE.Vector3();
function nearestSurfaceDistance(localPos){
  const r = localPos.length();
  let best = r > 1e-6 ? Math.abs(FLOOR_R - r) : Infinity; // radial floor shell
  if(r > 1e-6) best = Math.min(best, Math.abs(r - CEIL_R)); // radial ceiling shell
  for(let i=0;i<solidTris.length;i++){
    const t = solidTris[i];
    const dcx=localPos.x-t.cx0, dcy=localPos.y-t.cy0, dcz=localPos.z-t.cz0;
    const cullR = t.rad + best; // nothing past this can possibly beat the current best
    if(dcx*dcx+dcy*dcy+dcz*dcz > cullR*cullR) continue;
    closestPointOnTriangleXYZ(localPos.x,localPos.y,localPos.z, t.ax,t.ay,t.az, t.bx,t.by,t.bz, t.cx,t.cy,t.cz, _nsClosest);
    const dx=localPos.x-_nsClosest.x, dy=localPos.y-_nsClosest.y, dz=localPos.z-_nsClosest.z;
    const dist = Math.sqrt(dx*dx+dy*dy+dz*dz);
    if(dist < best) best = dist;
  }
  return best;
}

function resolveCollisions(pos){
  for(let i=0;i<collSegs.length;i+=6){
    const x1=collSegs[i],y1=collSegs[i+1],z1=collSegs[i+2];
    const x2=collSegs[i+3],y2=collSegs[i+4],z2=collSegs[i+5];
    const dx=pos.x-x1, dy=pos.y-y1, dz=pos.z-z1;
    const ex=x2-x1, ey=y2-y1, ez=z2-z1;
    const len2 = ex*ex+ey*ey+ez*ez || 1;
    let t = (dx*ex+dy*ey+dz*ez)/len2;
    t = Math.max(0, Math.min(1, t));
    const cx=x1+ex*t, cy=y1+ey*t, cz=z1+ez*t;
    const ddx=pos.x-cx, ddy=pos.y-cy, ddz=pos.z-cz;
    const dist = Math.sqrt(ddx*ddx+ddy*ddy+ddz*ddz);
    if(dist < PLAYER_RADIUS && dist>0.0001){
      const push=(PLAYER_RADIUS-dist)/dist;
      pos.x += ddx*push; pos.y += ddy*push; pos.z += ddz*push;
    }
  }
}

// Closest distance from `pos` to any BOUNDARY-WALL-ONLY segment (i.e.
// excluding doors - collSegs[0..wallOnlySegCount) are walls, the rest are
// doors, see buildCollisionSegs). Used to trigger/maintain climbing: the
// user explicitly wants E-to-climb to grip only a real room-boundary wall,
// never a door. Returns {dist, x1,y1,z1,x2,y2,z2} for the single nearest
// wall segment (its endpoints are handed back too, so the climb code can
// tell whether the player has reached the end of that particular segment).
function nearestWallInfo(pos){
  let bestDist = Infinity, best = null;
  for(let i=0;i<wallOnlySegCount*6;i+=6){
    const x1=collSegs[i],y1=collSegs[i+1],z1=collSegs[i+2];
    const x2=collSegs[i+3],y2=collSegs[i+4],z2=collSegs[i+5];
    const dx=pos.x-x1, dy=pos.y-y1, dz=pos.z-z1;
    const ex=x2-x1, ey=y2-y1, ez=z2-z1;
    const len2 = ex*ex+ey*ey+ez*ez || 1;
    let t = (dx*ex+dy*ey+dz*ez)/len2;
    t = Math.max(0, Math.min(1, t));
    const cx=x1+ex*t, cy=y1+ey*t, cz=z1+ez*t;
    const ddx=pos.x-cx, ddy=pos.y-cy, ddz=pos.z-cz;
    const dist = Math.sqrt(ddx*ddx+ddy*ddy+ddz*ddz);
    if(dist<bestDist){ bestDist=dist; best={dist, x1,y1,z1,x2,y2,z2, t}; }
  }
  return best;
}

// Real "is there floor here" test, replacing the nearest-centroid
// approximation of currentRoom() for physics purposes: true only when `pos`
// (projected onto the unit sphere) actually falls inside SOME room's real
// boundary polygon, via the same gnomonic point-in-polygon test the mini-map
// already uses for click-to-enter picking (roomMapPolys/sphPointInRoom,
// built in buildMapPolys(), called from init()).
function isOverFloorExact(pos){
  const unit = pos.clone().normalize();
  for(let i=0;i<roomMapPolys.length;i++){
    if(sphPointInRoom(unit, roomMapPolys[i])) return true;
  }
  return false;
}
// Small dilation around the exact test above. Investigated a real report of
// randomly diving through the floor near a wall (Ursa Major and possibly
// other rooms' corners): the room-polygon data (roomMapPolys, gnomonic,
// built once in buildMapPolys) and the actual collision wall mesh
// (wallPositions/collSegs, built independently in buildWalls) are two
// separately-built representations of the "same" boundary, and at a sharp
// (especially concave/reflex) corner they don't necessarily agree down to
// the exact bit - confirmed directly: isOverFloorExact() reads false
// exactly AT several of Ursa Major's own polygon vertices even though nudging
// that same point a fraction of a unit back toward the room's own center
// immediately reads true again. Collision (resolveCollisions/
// moveOnSphereWithCollision) already guarantees the player can never get
// closer than PLAYER_RADIUS to a real wall in the first place, so a
// razor-thin sliver of "polygon says no, wall mesh says yes" right at a
// corner is exactly the kind of gap that should never actually cost the
// player their footing - this checks a small ring of nearby points (world
// units, well under PLAYER_RADIUS) before giving up and calling it a real gap.
const FLOOR_EDGE_TOLERANCE = 0.6;
const _floorTolTx = new THREE.Vector3(), _floorTolTy = new THREE.Vector3(), _floorTolTest = new THREE.Vector3();
function isOverFloor(pos){
  if(isOverFloorExact(pos)) return true;
  const N = pos.clone().normalize();
  const ref = Math.abs(N.y) < 0.9 ? new THREE.Vector3(0,1,0) : new THREE.Vector3(1,0,0);
  _floorTolTx.crossVectors(ref, N).normalize();
  _floorTolTy.crossVectors(N, _floorTolTx).normalize();
  const r = FLOOR_EDGE_TOLERANCE / FLOOR_R; // convert a world-unit offset to an angular one on the unit sphere
  for(let k=0;k<8;k++){
    const th = (k/8)*Math.PI*2;
    _floorTolTest.copy(N)
      .addScaledVector(_floorTolTx, Math.cos(th)*r)
      .addScaledVector(_floorTolTy, Math.sin(th)*r)
      .normalize();
    if(isOverFloorExact(_floorTolTest)) return true;
  }
  return false;
}

// ---- dynamic-gravity stability (gravity-simulation mode only) ----
// IMPORTANT: every one of the 89 rooms is a perfectly normal floor to stand
// in - each room supports its own occupant via its own local "up" (radially
// inward, -N), exactly like every earlier round of this structure. That
// convention must NOT change; a single absolute "only the one room that
// happens to face true gravity-down right now counts as floor" rule was
// tried and immediately breaks ordinary standing/walking in every other
// room (the player falls the instant gravity-simulation mode is turned on,
// almost anywhere) - that is NOT what was asked for.
// What WAS asked for is specifically that the hour dial's rotation can
// destabilize a player who is already standing still: gravity/orientation
// is tied to the TRUE fixed exterior frame (GRAV_UP_LOCAL, updated every
// frame from the structure's current rotation - see updateStructureRotation),
// so turning the hour dial while gravity-simulation mode is on and the
// player stays in place is exactly the structure rotating out from under
// them. So this tracks a personal baseline - player.stableAlign, the
// room-vs-true-gravity alignment recorded the moment the player was last
// confirmed resting somewhere (any room, at whatever alignment it happened
// to have) - and only calls it "no longer supported" once the CURRENT
// alignment has drifted far enough from THAT baseline, i.e. the dial
// actually turned a meaningful amount since they planted their feet. Simply
// standing still with the dial untouched keeps delta at 0 forever, so
// nothing here ever falls out from under a stationary player on its own.
const ROTATION_FALL_DELTA = 0.35; // how much dot-product drift (~roughly 40-50 degrees, depending on the base angle) is tolerated before the hour dial's rotation is judged to have destabilized a standing player
function localGravityAlign(pos){
  const N = pos.clone().normalize();
  return -N.dot(GRAV_UP_LOCAL); // this position's local "up into the room" (-N), compared against true up
}

// A fast-moving player (walk-speed default is well above 1x, and Shift-run
// multiplies it further by 1.7) can cover more than PLAYER_RADIUS in a
// single frame on a slow/lagged tick (dt is capped at 0.05s in animate(),
// so worst case is several units of travel at once). resolveCollisions()
// only ever looks at where the player ENDS UP that frame - it has no idea
// a thin wall was in between the start and end points, so a big enough
// single jump can skip clean through a wall without ever being sampled
// within push-out range of it. The fix is to never take one big step: walk
// the same total displacement in several shorter sub-steps (each snapped
// back onto the sphere and collision-resolved in turn), so the player is
// always re-tested against the walls at intervals no larger than a safe
// fraction of PLAYER_RADIUS.
function moveOnSphereWithCollision(pos, moveDir, dist){
  const maxStep = PLAYER_RADIUS*0.5;
  const steps = Math.max(1, Math.ceil(dist/maxStep));
  const stepDist = dist/steps;
  for(let s=0;s<steps;s++){
    pos.add(moveDir.clone().multiplyScalar(stepDist));
    pos.normalize().multiplyScalar(FLOOR_R);
    resolveCollisions(pos);
    pos.normalize().multiplyScalar(FLOOR_R);
  }
  return pos;
}

const _curRoomInvQuat = new THREE.Quaternion();
// Which room the player is in = which room's REAL boundary polygon contains the
// direction of their position (the same exact spherical point-in-polygon test
// the map and the ecliptic band use) - NOT whichever room's centroid happens to
// be nearest, which is simply wrong near any boundary and for big/irregular
// rooms (Ophiuchus vs Scorpius). The room they were already in is kept while
// they are still inside its polygon, so standing right on a shared edge can't
// make the room flicker between its two neighbours.
function currentRoom(){
  structureSpinGroup.getWorldQuaternion(_curRoomInvQuat).invert();
  const N = player.pos.clone().applyQuaternion(_curRoomInvQuat).normalize();
  if(cachedRoom && roomPolyById[cachedRoom.id] && sphPointInRoom(N, roomPolyById[cachedRoom.id])) return cachedRoom;
  const exact = roomForDirection(N);
  if(exact) return exact;
  if(cachedRoom) return cachedRoom; // in a sliver between polygons: stay where we were
  let best=null, bestDot=-Infinity;
  ROOMS.forEach(r=>{
    const d = new THREE.Vector3(...r.centroid3d).normalize().dot(N);
    if(d>bestDot){bestDot=d; best=r;}
  });
  return best;
}
let roomCheckTimer=0; // cachedRoom already declared earlier (near enterInterior)

