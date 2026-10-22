/* ============================================================================
   BODY + THIRD-PERSON CAMERA vs. EVERYTHING SOLID

   Two guarantees, both derived from the same solid geometry the capsule
   already collides with (solidTris: every wall triangle and every door
   triangle, plus the radial floor/ceiling shells):

   1. BODY: no point of the visible, animated body surface ever ends up
      beyond a wall. The capsule alone cannot promise that - it is narrower
      than the shoulders and much narrower than a walking stride (measured on
      the real skinned model: shoulders reach ~2.7 from the centre line, a
      foot ~5.7 ahead of it mid-stride, against a 2.0 capsule radius).
      resolveBodyPenetration() tracks a fixed set of vertices spread over the
      real skinned surface through the live skeleton and shifts the player
      back just enough that none of them crosses or touches a wall.

   2. CAMERA: the camera is a sphere (CAM_CLEARANCE) swept from the player's
      head to its seat, and it only ever sits at a point that is clear of
      every wall/door triangle, the floor and ceiling shells, and the player's
      own body. If the usual seat (behind the player) is blocked, the camera
      swings around to the side / above instead of entering the obstacle;
      if no seat anywhere around the head is free, it sits at the eyes and
      the body is hidden for that frame so nothing is ever seen from inside.
   ============================================================================ */

const BODY_VERTEX_RADIUS = 0.45;  // body surface is kept at least this far from any wall
const BODY_NEAR_RADIUS   = 10;    // wall triangles within this of the feet are considered (body reaches ~6)
const BODY_MAX_SHIFT     = 10;    // never move the player more than this in one correction (spawn-in-a-wall case)
const CAM_CLEARANCE      = 1.5;   // camera sphere radius: >> near plane (0.1), so no wall is ever inside the view frustum's near cut
const CAM_BODY_CORE_R    = 2.8;   // lateral radius of the body's solid core (idle shoulders reach 2.76)
const CAM_BODY_SAMPLE_CLEAR = 1.2;// camera must also stay this far from every tracked body vertex

const _bpQ = new THREE.Quaternion(), _bpInv = new THREE.Quaternion();
const _bpV = new THREE.Vector3(), _bpP = new THREE.Vector3(), _bpU = new THREE.Vector3();
const _bpCP = {x:0,y:0,z:0};
let bodyLocalSamples = new Float32Array(0);   // tracked body vertices, structure-LOCAL, after the last pass
const _bodyNearTris = [], _camNearTris = [];

function gatherNearTris(out, lx, ly, lz, R){
  out.length = 0;
  for(let i=0;i<solidTris.length;i++){
    const t = solidTris[i];
    const dx=lx-t.cx0, dy=ly-t.cy0, dz=lz-t.cz0;
    const cr = t.rad + R;
    if(dx*dx+dy*dy+dz*dz <= cr*cr) out.push(t);
  }
  return out;
}

// does the segment c->v cross triangle t? (Moller-Trumbore, segment form)
function segmentCrossesTri(cx,cy,cz, vx,vy,vz, t){
  const dx=vx-cx, dy=vy-cy, dz=vz-cz;
  const e1x=t.bx-t.ax, e1y=t.by-t.ay, e1z=t.bz-t.az;
  const e2x=t.cx-t.ax, e2y=t.cy-t.ay, e2z=t.cz-t.az;
  const px=dy*e2z-dz*e2y, py=dz*e2x-dx*e2z, pz=dx*e2y-dy*e2x;
  const det=e1x*px+e1y*py+e1z*pz;
  if(Math.abs(det) < 1e-12) return false;
  const inv=1/det;
  const tx=cx-t.ax, ty=cy-t.ay, tz=cz-t.az;
  const u=(tx*px+ty*py+tz*pz)*inv;
  if(u < -1e-6 || u > 1+1e-6) return false;
  const qx=ty*e1z-tz*e1y, qy=tz*e1x-tx*e1z, qz=tx*e1y-ty*e1x;
  const w=(dx*qx+dy*qy+dz*qz)*inv;
  if(w < -1e-6 || u+w > 1+1e-6) return false;
  const s=(e2x*qx+e2y*qy+e2z*qz)*inv;
  return s >= 0 && s <= 1;
}

// current positions of the tracked body vertices through the live skeleton,
// in structure-LOCAL space (same frame the wall triangles live in)
function sampleBodyLocal(){
  const n = bodyCollSamples.length;
  if(bodyLocalSamples.length !== n*3) bodyLocalSamples = new Float32Array(n*3);
  playerBodyGroup.updateMatrixWorld(true);
  for(let m=0;m<bodyCollMeshes.length;m++) bodyCollMeshes[m].skeleton.update();
  for(let i=0;i<n;i++){
    const s = bodyCollSamples[i];
    s.mesh.boneTransform(s.index, _bpV);
    _bpV.applyMatrix4(s.mesh.matrixWorld).applyQuaternion(_bpInv);
    bodyLocalSamples[i*3]=_bpV.x; bodyLocalSamples[i*3+1]=_bpV.y; bodyLocalSamples[i*3+2]=_bpV.z;
  }
}

// Keeps every tracked body vertex on the player's side of every wall.
// "Player's side" is decided by the capsule axis: the nearest point on the
// capsule's own centre line (which the capsule collision already keeps clear
// of every wall) is the reference, and the vertex must be reachable from it
// without crossing a wall triangle and must stay BODY_VERTEX_RADIUS clear.
// This also catches a hand/foot that has gone THROUGH a thin wall to the far
// side - where a plain "distance to the wall" test would see a harmless
// distance and miss it. Called after the body has been posed this frame.
// How hard (world units) the last body pass had to lift/push the whole player, and in which
// WORLD direction: that direction is the normal of whatever the body is resting against,
// which the slope/standing logic uses as a real contact (a tilted foot can rest on a
// slope while the capsule axis hovers just above it).
const bodyPush = { mag: 0, n: new THREE.Vector3(0,1,0) };
function resolveBodyPenetration(upWorld){
  bodyPush.mag = 0;
  if(!bodyCollSamples.length || !playerBodyGroup || !solidTris.length) return;
  structureSpinGroup.getWorldQuaternion(_bpQ); _bpInv.copy(_bpQ).invert();
  sampleBodyLocal();
  _bpP.copy(player.pos).applyQuaternion(_bpInv);
  _bpU.copy(upWorld).applyQuaternion(_bpInv);
  const near = gatherNearTris(_bodyNearTris, _bpP.x,_bpP.y,_bpP.z, BODY_NEAR_RADIUS);
  if(!near.length) return;
  const n = bodyCollSamples.length, S = bodyLocalSamples;
  const r = BODY_VERTEX_RADIUS;
  const Px=_bpP.x, Py=_bpP.y, Pz=_bpP.z, Ux=_bpU.x, Uy=_bpU.y, Uz=_bpU.z;
  let sx=0, sy=0, sz=0;
  for(let iter=0; iter<8; iter++){
    let moved = false;
    for(let i=0;i<n;i++){
      const ox=S[i*3], oy=S[i*3+1], oz=S[i*3+2];
      // reference point: nearest point on the capsule axis to this vertex
      let h = (ox-Px)*Ux+(oy-Py)*Uy+(oz-Pz)*Uz;
      h = h<0 ? 0 : (h>CAPSULE_HEIGHT ? CAPSULE_HEIGHT : h);
      for(let k=0;k<near.length;k++){
        const t = near[k];
        if(t.nx===0 && t.ny===0 && t.nz===0) continue;
        const vx=ox+sx, vy=oy+sy, vz=oz+sz;
        const cx=Px+sx+Ux*h, cy=Py+sy+Uy*h, cz=Pz+sz+Uz*h;
        const L = Math.hypot(vx-cx,vy-cy,vz-cz);
        const dcx=cx-t.cx0, dcy=cy-t.cy0, dcz=cz-t.cz0;
        const reach = t.rad + L + r;
        if(dcx*dcx+dcy*dcy+dcz*dcz > reach*reach) continue;
        // orient the plane normal toward the axis point's side
        let sg = (cx-t.ax)*t.nx+(cy-t.ay)*t.ny+(cz-t.az)*t.nz;
        sg = sg>=0 ? 1 : -1;
        const nx=t.nx*sg, ny=t.ny*sg, nz=t.nz*sg;
        const sv = (vx-t.ax)*nx+(vy-t.ay)*ny+(vz-t.az)*nz; // signed height of the vertex above the wall, on the player's side
        if(sv >= r) continue;
        let px=0, py=0, pz=0, amt=0;
        if(sv < 0 && segmentCrossesTri(cx,cy,cz, vx,vy,vz, t)){
          // the vertex is on the far side of the wall: lift the whole body back over it
          px=nx; py=ny; pz=nz; amt = r - sv;
        } else {
          closestPointOnTriangleXYZ(vx,vy,vz, t.ax,t.ay,t.az, t.bx,t.by,t.bz, t.cx,t.cy,t.cz, _bpCP);
          const dx=vx-_bpCP.x, dy=vy-_bpCP.y, dz=vz-_bpCP.z;
          const d = Math.sqrt(dx*dx+dy*dy+dz*dz);
          if(d >= r) continue;
          if(d > 1e-6){ px=dx/d; py=dy/d; pz=dz/d; } else { px=nx; py=ny; pz=nz; }
          amt = r - d;
        }
        sx += px*amt; sy += py*amt; sz += pz*amt;
        moved = true;
      }
    }
    // The two spherical shells are solid to every point of the visible body too:
    // nothing may sink below the star wall (r < CEIL_R) or past the floor shell
    // (r > FLOOR_R). Without this a foot or hand of a player standing on the
    // star wall of an upside-down room poked into it.
    for(let i=0;i<n;i++){
      const vx=S[i*3]+sx, vy=S[i*3+1]+sy, vz=S[i*3+2]+sz;
      const rr = Math.sqrt(vx*vx+vy*vy+vz*vz);
      if(rr < 1e-6) continue;
      let amt = 0;
      if(rr < CEIL_R) amt = CEIL_R - rr;            // push outward, away from the core
      else if(rr > FLOOR_R) amt = FLOOR_R - rr;     // push inward
      if(amt !== 0){ const k = amt/rr; sx += vx*k; sy += vy*k; sz += vz*k; moved = true; }
    }
    // The capsule's own centre line (radius PLAYER_RADIUS) is part of the SAME
    // joint solve, so shifting the body off one wall can never push the
    // capsule into the opposite one - both constraints converge together
    // instead of being resolved one after the other.
    for(let si=0; si<CAPSULE_COLL_SAMPLES; si++){
      const h = CAPSULE_HEIGHT*si/(CAPSULE_COLL_SAMPLES-1);
      for(let k=0;k<near.length;k++){
        const t = near[k];
        const qx=Px+sx+Ux*h, qy=Py+sy+Uy*h, qz=Pz+sz+Uz*h;
        const dcx=qx-t.cx0, dcy=qy-t.cy0, dcz=qz-t.cz0;
        const cr = t.rad + PLAYER_RADIUS;
        if(dcx*dcx+dcy*dcy+dcz*dcz > cr*cr) continue;
        closestPointOnTriangleXYZ(qx,qy,qz, t.ax,t.ay,t.az, t.bx,t.by,t.bz, t.cx,t.cy,t.cz, _bpCP);
        const dx=qx-_bpCP.x, dy=qy-_bpCP.y, dz=qz-_bpCP.z;
        const d = Math.sqrt(dx*dx+dy*dy+dz*dz);
        if(d >= PLAYER_RADIUS || d < 1e-6) continue;
        const amt = (PLAYER_RADIUS-d)/d;
        sx += dx*amt; sy += dy*amt; sz += dz*amt;
        moved = true;
      }
    }
    if(!moved) break;
  }
  const mag = Math.hypot(sx,sy,sz);
  if(mag < 1e-9) return;
  if(mag > BODY_MAX_SHIFT){ const k=BODY_MAX_SHIFT/mag; sx*=k; sy*=k; sz*=k; }
  _bpV.set(sx,sy,sz).applyQuaternion(_bpQ);   // structure-local shift -> world
  bodyPush.mag = _bpV.length(); bodyPush.n.copy(_bpV).multiplyScalar(1/(bodyPush.mag||1));
  player.pos.add(_bpV);
  playerBodyGroup.position.add(_bpV);
  playerBodyGroup.updateMatrixWorld(true);
  for(let i=0;i<n;i++){ S[i*3]+=sx; S[i*3+1]+=sy; S[i*3+2]+=sz; }
}

/* ---------------------------------------------------------------------------
   Third-person camera seat
   --------------------------------------------------------------------------- */
const camSeat = { yaw:0, elev:0, dist:THIRD_PERSON_DISTANCE, valid:false };
function resetCameraSeat(){ camSeat.valid = false; }

const CAM_YAW_STEPS  = [0, 20, 40, 60, 80, 100, 125, 150, 180].flatMap(d=>d===0||d===180?[d]:[d,-d]).map(d=>d*Math.PI/180);
const CAM_ELEV_STEPS = [30, 55, 80].map(d=>d*Math.PI/180);

const _cs = { E:new THREE.Vector3(), U:new THREE.Vector3(), B:new THREE.Vector3(), P:new THREE.Vector3(),
              dir:new THREE.Vector3(), p:new THREE.Vector3(), tmp:new THREE.Vector3() };

// is the camera sphere at local point (x,y,z) clear of every wall/door
// triangle (near list) and of the floor/ceiling shells?
function camPointClear(x,y,z, near){
  const r = Math.sqrt(x*x+y*y+z*z);
  if(r < CEIL_R + CAM_CLEARANCE || r > FLOOR_R - CAM_CLEARANCE) return false;
  for(let i=0;i<near.length;i++){
    const t = near[i];
    const dx=x-t.cx0, dy=y-t.cy0, dz=z-t.cz0;
    const cr = t.rad + CAM_CLEARANCE;
    if(dx*dx+dy*dy+dz*dz > cr*cr) continue;
    closestPointOnTriangleXYZ(x,y,z, t.ax,t.ay,t.az, t.bx,t.by,t.bz, t.cx,t.cy,t.cz, _bpCP);
    const ex=x-_bpCP.x, ey=y-_bpCP.y, ez=z-_bpCP.z;
    if(ex*ex+ey*ey+ez*ez < CAM_CLEARANCE*CAM_CLEARANCE) return false;
  }
  return true;
}

// is the camera sphere at local point inside / touching the player's body?
function camPointInBody(x,y,z){
  // solid core: a cylinder along the capsule axis
  const ux=_cs.U.x, uy=_cs.U.y, uz=_cs.U.z;
  const vx=x-_cs.P.x, vy=y-_cs.P.y, vz=z-_cs.P.z;
  const h = vx*ux+vy*uy+vz*uz;
  if(h > -CAM_CLEARANCE && h < CAPSULE_HEIGHT + CAM_CLEARANCE){
    const lx=vx-ux*h, ly=vy-uy*h, lz=vz-uz*h;
    if(Math.sqrt(lx*lx+ly*ly+lz*lz) < CAM_BODY_CORE_R + CAM_CLEARANCE) return true;
  }
  // limbs: every tracked vertex of the animated surface
  const S = bodyLocalSamples, c2 = CAM_BODY_SAMPLE_CLEAR*CAM_BODY_SAMPLE_CLEAR;
  for(let i=0;i<S.length;i+=3){
    const dx=x-S[i], dy=y-S[i+1], dz=z-S[i+2];
    if(dx*dx+dy*dy+dz*dz < c2) return true;
  }
  return false;
}

// how far the camera sphere can travel from the eye along dir (<= maxD)
// before touching a wall/door/floor/ceiling (bisection after the first hit)
function camReach(dir, maxD, near){
  const E=_cs.E, step = CAM_CLEARANCE*0.5;
  let prev = 0;
  for(let t=0; ; ){
    const x=E.x+dir.x*t, y=E.y+dir.y*t, z=E.z+dir.z*t;
    if(!camPointClear(x,y,z,near)){
      if(t===0) return 0;
      let lo=prev, hi=t;
      for(let k=0;k<6;k++){
        const m=(lo+hi)/2;
        if(camPointClear(E.x+dir.x*m,E.y+dir.y*m,E.z+dir.z*m,near)) lo=m; else hi=m;
      }
      return lo;
    }
    prev = t;
    if(t >= maxD) return maxD;
    t = Math.min(maxD, t+step);
  }
}

function camSeatDir(yaw, elev, out){
  out.copy(_cs.B).applyAxisAngle(_cs.U, yaw);
  out.multiplyScalar(Math.cos(elev)).addScaledVector(_cs.U, Math.sin(elev));
  return out.normalize();
}

// Evaluates one seat: its free reach, whether the final spot is outside the
// body, and a preference score (full distance, near the default seat).
function evalCamSeat(yaw, elev, D, e0, near){
  camSeatDir(yaw, elev, _cs.dir);
  const reach = camReach(_cs.dir, D, near);
  const x=_cs.E.x+_cs.dir.x*reach, y=_cs.E.y+_cs.dir.y*reach, z=_cs.E.z+_cs.dir.z*reach;
  const ok = !camPointInBody(x,y,z) && camPointClear(x,y,z,near);
  const score = reach/D - 0.2*Math.abs(yaw)/Math.PI - 0.1*Math.abs(elev-e0)/1.2;
  return { yaw, elev, reach, ok, score };
}


// moves _cs.E to the nearest point where the camera sphere is clear of every
// wall/door triangle and inside the open air band between ceiling and floor
function projectCameraStartToFree(near){
  const E=_cs.E, lo=CEIL_R+CAM_CLEARANCE+0.02, hi=FLOOR_R-CAM_CLEARANCE-0.02;
  for(let iter=0; iter<16; iter++){
    let moved=false;
    const r=E.length();
    if(r>hi){ E.multiplyScalar(hi/r); moved=true; }
    else if(r<lo && r>1e-6){ E.multiplyScalar(lo/r); moved=true; }
    for(let i=0;i<near.length;i++){
      const t=near[i];
      const dx=E.x-t.cx0, dy=E.y-t.cy0, dz=E.z-t.cz0, cr=t.rad+CAM_CLEARANCE;
      if(dx*dx+dy*dy+dz*dz>cr*cr) continue;
      closestPointOnTriangleXYZ(E.x,E.y,E.z, t.ax,t.ay,t.az, t.bx,t.by,t.bz, t.cx,t.cy,t.cz, _bpCP);
      const ex=E.x-_bpCP.x, ey=E.y-_bpCP.y, ez=E.z-_bpCP.z;
      const d=Math.sqrt(ex*ex+ey*ey+ez*ez);
      if(d<CAM_CLEARANCE && d>1e-6){
        const k=(CAM_CLEARANCE-d+0.01)/d;
        E.x+=ex*k; E.y+=ey*k; E.z+=ez*k; moved=true;
      }
    }
    if(!moved) break;
  }
}

// Places camera.position. eyeW/upW/fwdW are WORLD-space (eye point, "up",
// flat forward). Returns true when the body should be hidden this frame
// (camera has no free seat and sits at the eyes).
function placeThirdPersonCamera(eyeW, upW, fwdW, dt){
  structureSpinGroup.getWorldQuaternion(_bpQ); _bpInv.copy(_bpQ).invert();
  _cs.E.copy(eyeW).applyQuaternion(_bpInv);
  _cs.U.copy(upW).applyQuaternion(_bpInv);
  _cs.B.copy(fwdW).applyQuaternion(_bpInv).negate();
  _cs.P.copy(player.pos).applyQuaternion(_bpInv);
  const D = THIRD_PERSON_DISTANCE;
  const e0 = Math.atan2(THIRD_PERSON_HEIGHT, D); // the usual over-the-shoulder tilt
  // Reach slack: the starting point below may be moved away from the eye by a
  // few units, so gather walls for a larger neighbourhood.
  const near = gatherNearTris(_camNearTris, _cs.E.x,_cs.E.y,_cs.E.z, D + CAM_CLEARANCE + 16);
  // The head can itself lie outside the open band between the ceiling shell and
  // the floor shell (a room whose floor is steeply tilted against true gravity
  // leaves the upright body partly inside the shell), or hard against a wall.
  // The camera is never allowed in solid material or touching a wall, so its
  // starting point is first brought to the nearest free spot by alternately
  // pushing it out of the walls and back into the open shell band.
  projectCameraStartToFree(near);

  // 1. the usual seat, if it is fully free
  let best = evalCamSeat(0, e0, D, e0, near);
  if(!(best.ok && best.reach >= D-1e-3)){
    // 2. otherwise look around the head for the best free seat
    let bestOk = best.ok ? best : null;
    for(let yi=0; yi<CAM_YAW_STEPS.length; yi++){
      for(let ei=-1; ei<CAM_ELEV_STEPS.length; ei++){
        const el = ei<0 ? e0 : CAM_ELEV_STEPS[ei];
        if(CAM_YAW_STEPS[yi]===0 && ei<0) continue; // already evaluated
        const c = evalCamSeat(CAM_YAW_STEPS[yi], el, D, e0, near);
        if(c.ok && (!bestOk || c.score > bestOk.score)) bestOk = c;
      }
    }
    best = bestOk;
  }
  if(!best){
    // nothing around the head is free: sit at the eyes, body hidden
    camSeat.valid = false;
    camera.position.copy(_cs.E).applyQuaternion(_bpQ);
    return true;
  }

  // smooth the seat (yaw/elevation/distance) toward the target, never
  // trusting a smoothed pose that is not itself free.
  let yaw = best.yaw, elev = best.elev, dist = best.reach;
  if(camSeat.valid){
    const a = 1 - Math.exp(-10*Math.min(dt,0.1));
    let dy = best.yaw - camSeat.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const sy = camSeat.yaw + dy*a, se = camSeat.elev + (best.elev-camSeat.elev)*a;
    const sd = Math.min(best.reach, camSeat.dist + 40*Math.min(dt,0.1) , Math.max(best.reach, 0)); // may grow only gradually
    const useDist = Math.min(best.reach, Math.max(sd, 0));
    const cand = evalCamSeat(sy, se, D, e0, near);
    if(cand.ok){
      const dd = Math.min(useDist, cand.reach);
      camSeatDir(sy, se, _cs.dir);
      const x=_cs.E.x+_cs.dir.x*dd, y=_cs.E.y+_cs.dir.y*dd, z=_cs.E.z+_cs.dir.z*dd;
      if(!camPointInBody(x,y,z) && camPointClear(x,y,z,near) && cand.score >= best.score - 0.2){
        yaw = sy; elev = se; dist = dd;
      }
    }
  }
  camSeat.yaw = yaw; camSeat.elev = elev; camSeat.dist = dist; camSeat.valid = true;
  camSeatDir(yaw, elev, _cs.dir);
  _cs.p.copy(_cs.E).addScaledVector(_cs.dir, dist);
  camera.position.copy(_cs.p).applyQuaternion(_bpQ);
  return false;
}
