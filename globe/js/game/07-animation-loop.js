/* ============================================================================
   ANIMATION LOOP
   ============================================================================ */
const clock = new THREE.Clock();

const GRAVITY = 30;             // world units/sec^2, along WORLD_DOWN, unconditionally
const STAND_STICK_SPEED = 8;     // world units/sec pressing a standing player into their surface (ground-follow)
const JUMP_SPEED = 12;           // world units/sec, vertical (WORLD_UP) impulse
const CLIMB_SPEED = 9;           // world units/sec - steady rate for gripping a boundary wall (E up / Q down)
const WALL_GRIP_RADIUS = PLAYER_RADIUS + 2.0; // how close to a boundary wall counts as "near it" for climbing

// converts the player's WORLD position/velocity into the structure's CURRENT
// local frame, runs real 3D collision there (against the static local wall/
// door/floor/ceiling geometry), and converts the result back to world. This
// is what makes contact recompute fresh every frame against wherever the
// (possibly still hour-dial-rotating) structure currently is, without the
// player ever being carried along by that rotation: player.pos/velocity are
// WORLD-space state that persists across frames untouched by the structure's
// spin - only this one function's local-space detour, redone from scratch
// each frame, ever looks at the structure's current orientation.
const _physFwdQuat = new THREE.Quaternion(), _physInvQuat = new THREE.Quaternion();
const _physSupN = new THREE.Vector3();
const _physLocalPos = new THREE.Vector3(), _physLocalVel = new THREE.Vector3(), _physUpLocal = new THREE.Vector3();
function stepPlayerPhysics(dt, fwdAxis, rightAxis, speed){
  structureSpinGroup.getWorldQuaternion(_physFwdQuat);
  _physInvQuat.copy(_physFwdQuat).invert();

  // ---- "up" for every purpose below (movement plane, jump direction, gravity,
  // support/slope test) is WORLD_UP in ordinary mode. In gravity-off mode it is
  // the radial direction toward the core at the player's own position (kept in
  // player.wallStickNormal, refreshed at the bottom of this function), so the
  // outer stone wall under the feet is the floor and the same standing/slope
  // model applies to it as to any floor.
  const stickUpWorld = noGravityMode ? player.wallStickNormal : WORLD_UP;
  _physUpLocal.copy(stickUpWorld).applyQuaternion(_physInvQuat);

  // ---- climbing: DISABLED for now, by request - this whole manual E-to-
  // grip mechanic is being replaced by a real floor/wall/ceiling surface
  // model (support classified by the angle between the surface and true
  // gravity, with its own matching poses), not yet built. Left in place
  // (not deleted) since the vertical-velocity-while-gripping code below it
  // may still be useful groundwork for the ceiling-grip case of that new
  // model - but the activation condition is now permanently false so it can
  // never engage, and player.climbing can also no longer be set true
  // anywhere else.
  _physLocalPos.copy(player.pos).applyQuaternion(_physInvQuat);
  const wallInfo = nearestWallInfo(_physLocalPos);
  const nearWall = !!wallInfo && wallInfo.dist < WALL_GRIP_RADIUS;
  if(!player.climbing && false && keys.KeyE && nearWall) player.climbing = true;
  if(player.climbing && (!nearWall || fwdAxis<0)) player.climbing = false;

  // ---- horizontal velocity: WASD relative to the current "up" plane
  // (stickUpWorld) and the body's own facing (bodyYaw) - never auto-
  // projected onto the room's curved floor tangent plane.
  const worldFwd = tangentHeadingRef(stickUpWorld).applyAxisAngle(stickUpWorld, player.bodyYaw);
  const worldRight = new THREE.Vector3().crossVectors(stickUpWorld, worldFwd);
  // Standing on a surface gentle enough to stand on (slope <= settings.maxStandSlopeDeg,
  // measured from true horizontal) - decided from last frame's real contact below.
  // While it holds, the player neither slides nor sinks: gravity is applied
  // INTO the surface (not along WORLD_DOWN), so nothing drags them down the slope.
  const standing = player.supportStable;
  const vertComp = standing ? 0 : player.velocity.dot(stickUpWorld);
  if(player.climbing){
    player.velocity.set(0,0,0); // hold position while gripping; E/Q set vertical explicitly below
  } else if(fwdAxis!==0 || rightAxis!==0){
    const len = Math.hypot(fwdAxis,rightAxis)||1;
    player.velocity.copy(worldFwd).multiplyScalar(fwdAxis/len)
      .addScaledVector(worldRight, rightAxis/len)
      .multiplyScalar(speed)
      .addScaledVector(stickUpWorld, vertComp); // preserve whatever vertical motion (falling/jumping) was already happening
  } else if(standing){
    player.velocity.set(0,0,0); // standing still on a stable surface: no slide at all
  } else {
    player.velocity.copy(stickUpWorld).multiplyScalar(vertComp); // no horizontal input: keep only the vertical component
  }

  // ---- vertical: gravity pulls along -stickUpWorld (== WORLD_DOWN in ordinary mode), or presses the player into the surface they stand on.
  if(player.climbing){
    if(keys.KeyE) player.velocity.addScaledVector(stickUpWorld, CLIMB_SPEED);
    else if(keys.KeyQ) player.velocity.addScaledVector(stickUpWorld, -CLIMB_SPEED);
  } else {
    if(standing) player.velocity.addScaledVector(player.supportN, -STAND_STICK_SPEED); // pressed into the surface it stands on, so it follows the surface as it curves or changes slope instead of hopping off it
    else player.velocity.addScaledVector(stickUpWorld, -GRAVITY*dt);
    if(keys.Space && player.grounded){
      player.velocity.addScaledVector(stickUpWorld, JUMP_SPEED - player.velocity.dot(stickUpWorld));
      player.supportStable = false; // airborne from now on, gravity returns to WORLD_DOWN
    }
  }

  // ---- integrate + real 3D collision (floor/ceiling/walls/doors, full
  // capsule height, converted into the structure's current local frame) ----
  // Sub-stepped so the player can NEVER tunnel through a wall: a single full
  // "move the whole frame's distance, then collision-check once" step can in
  // principle skip clean past a thin wall triangle if the frame's travel
  // distance is large enough (a lag spike, Shift-run at a steep angle into a
  // corner) - the same reasoning moveOnSphereWithCollision already uses for
  // the exterior view. Capping each sub-step at PLAYER_RADIUS*0.5 means the
  // capsule is re-tested against every wall/door at intervals well under its
  // own radius, so there's always a collision check before it could have
  // travelled far enough to pass through one. At ordinary walking speed this
  // is exactly one sub-step (dt unchanged, identical result to before); it
  // only subdivides further when a frame's travel is unusually large.
  _physLocalPos.copy(player.pos).applyQuaternion(_physInvQuat);
  _physLocalVel.copy(player.velocity).applyQuaternion(_physInvQuat);
  const MAX_SUBSTEP_DIST = PLAYER_RADIUS * 0.5;
  const moveDist = player.velocity.length() * dt;
  const numSubsteps = Math.max(1, Math.ceil(moveDist / MAX_SUBSTEP_DIST));
  const subDt = dt / numSubsteps;
  let grounded = false;
  for(let s=0; s<numSubsteps; s++){
    _physLocalPos.addScaledVector(_physLocalVel, subDt);
    const floorHit = resolveRadialFloorCeiling(_physLocalPos, _physLocalVel, _physUpLocal);
    resolveWallCollision3D(_physLocalPos, _physLocalVel, _physUpLocal);
    // re-check the radial floor once more after wall resolution nudged
    // position (a corner can push the capsule back onto/off the floor)
    const floorHit2 = resolveRadialFloorCeiling(_physLocalPos, _physLocalVel, _physUpLocal);
  }

  // ---- support / slope status of whatever the capsule is actually touching ----
  // Every surface (radial floor shell, star wall, wall/door triangle) has a
  // slope: the angle between its normal and true up. At or below the limit
  // the player can stand on it (and stays put); above it, they slide.
  {
    const slopeDot = findSupportContact(_physLocalPos, _physUpLocal, _physSupN, standing ? 0.6 : 0.15);
    const slopeCos = Math.cos(THREE.MathUtils.degToRad(settings.maxStandSlopeDeg));
    player.supportDot = slopeDot;
    player.supportSlopeDeg = slopeDot > -1.5 ? THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(slopeDot,-1,1))) : null;
    player.supportStable = slopeDot >= slopeCos - 1e-6;
    if(slopeDot > -1.5) player.supportN.copy(_physSupN).applyQuaternion(_physFwdQuat);
    grounded = player.supportStable;
  }

  player.pos.copy(_physLocalPos).applyQuaternion(_physFwdQuat);
  player.velocity.copy(_physLocalVel).applyQuaternion(_physFwdQuat);
  player.grounded = grounded;
  if(noGravityMode) refreshRadialUp(); // "up" follows the player around the sphere (heading is carried along)
  if(player.climbing && player.grounded && player.velocity.dot(stickUpWorld) <= 0.01) player.climbing = false; // stepped down onto real floor
}

// re-runs ONLY the capsule's wall/floor/ceiling resolution on the current player
// position (used after the body pass has shifted the player)
function recheckCapsule(upWorld){
  structureSpinGroup.getWorldQuaternion(_physFwdQuat);
  _physInvQuat.copy(_physFwdQuat).invert();
  _physLocalPos.copy(player.pos).applyQuaternion(_physInvQuat);
  _physLocalVel.copy(player.velocity).applyQuaternion(_physInvQuat);
  _physUpLocal.copy(upWorld).applyQuaternion(_physInvQuat);
  resolveRadialFloorCeiling(_physLocalPos, _physLocalVel, _physUpLocal);
  resolveWallCollision3D(_physLocalPos, _physLocalVel, _physUpLocal);
  resolveRadialFloorCeiling(_physLocalPos, _physLocalVel, _physUpLocal);
  player.pos.copy(_physLocalPos).applyQuaternion(_physFwdQuat);
  player.velocity.copy(_physLocalVel).applyQuaternion(_physFwdQuat);
}

// Door nameplates of the room the player is in are turned so the text reads
// upright for the player: its "up" is true up (WORLD_UP, seen in the structure's
// local frame) projected onto the plaque's own plane. In an upside-down room
// (the star wall is the ground) the text therefore isn't upside down.
const _plU = new THREE.Vector3(), _plX = new THREE.Vector3(), _plY = new THREE.Vector3(), _plM = new THREE.Matrix4();
function orientDoorSignsForPlayer(){
  if(!cachedRoom) return;
  _plU.copy(noGravityMode ? player.wallStickNormal : WORLD_UP).applyQuaternion(structureSpinGroup.getWorldQuaternion(_curRoomInvQuat).invert());
  for(let i=0;i<doorSigns.length;i++){
    const pl = doorSigns[i];
    if(pl.userData.roomId !== cachedRoom.id) continue;
    const z = pl.userData.faceDir;
    _plY.copy(_plU).addScaledVector(z, -_plU.dot(z));
    if(_plY.lengthSq() < 1e-4) continue; // plaque lies (nearly) flat: keep its mounting orientation
    _plY.normalize();
    _plX.crossVectors(_plY, z).normalize();
    pl.quaternion.setFromRotationMatrix(_plM.makeBasis(_plX, _plY, z));
  }
}

function updateInterior(dt){
  const fwdAxis   = (keys.KeyW||keys.ArrowUp ?1:0) - (keys.KeyS||keys.ArrowDown ?1:0);
  const rightAxis = (keys.KeyA||keys.ArrowLeft?1:0) - (keys.KeyD||keys.ArrowRight ?1:0); // swapped: A=left, D=right
  const speed = (keys.ShiftLeft||keys.ShiftRight ? PLAYER_SPEED*1.7 : PLAYER_SPEED) * settings.walkSpeedMult;

  // The stride only animates while the body is really travelling: pushing
  // into a wall keeps the legs from swinging on through it (they ease back to
  // the standing pose instead), exactly like a person stopped by a wall.
  const wantMove = fwdAxis!==0 || rightAxis!==0;
  player.blockedTime = player.blockedTime || 0;
  updatePlayerBodyAnimation(dt, wantMove && player.blockedTime < 0.12);
  const posBeforePhysics = player.pos.clone();
  stepPlayerPhysics(dt, fwdAxis, rightAxis, speed);

  // ---- camera/body: a direct derivation of the player capsule's own
  // position/orientation (feet -> body -> head -> eyes -> camera), never a
  // separately-offset "virtual player". Body "up" is WORLD_UP in ordinary
  // mode, or the wall the player is currently stuck to in wall-walk mode -
  // the exact same stickUpWorld stepPlayerPhysics just used to move them,
  // so the body/camera always stand "upright" relative to whatever surface
  // they're actually standing on, never relative to true gravity while
  // walking sideways or upside-down along a wall.
  const stickUpWorld = noGravityMode ? player.wallStickNormal : WORLD_UP;
  const worldFwd = tangentHeadingRef(stickUpWorld).applyAxisAngle(stickUpWorld, player.bodyYaw);
  const worldRight = new THREE.Vector3().crossVectors(stickUpWorld, worldFwd);
  // Pose the body for this frame (facing, head nod) at the physics position,
  // then keep every point of its real animated surface off the walls - this
  // can move player.pos slightly, so the eye/camera below are derived AFTER.
  updatePlayerBodyTransform(player.pos, stickUpWorld, worldFwd);
  updatePlayerHeadPitch(player.pitch);
  // The body pass moves the whole player off any wall the visible body touches;
  // in a tight spot that shift can push the capsule toward the opposite wall.
  // So the two are alternated, ending with the capsule check - the capsule's own
  // clearance is the hard guarantee, the body pass only improves on it.
  resolveBodyPenetration(stickUpWorld);
  // what the body had to be pushed off is a real contact too (see bodyPush)
  if(bodyPush.mag > 1e-4){
    const d = bodyPush.n.dot(stickUpWorld);
    if(d > player.supportDot + 1e-6){
      player.supportDot = d;
      player.supportN.copy(bodyPush.n);
      player.supportSlopeDeg = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(d,-1,1)));
      player.supportStable = d >= Math.cos(THREE.MathUtils.degToRad(settings.maxStandSlopeDeg)) - 1e-6;
      player.grounded = player.supportStable;
    }
  }
  updatePlayerBodyTransform(player.pos, stickUpWorld, worldFwd);
  if(wantMove){
    const moved = player.pos.distanceTo(posBeforePhysics);
    player.blockedTime = moved < 0.2*speed*dt ? player.blockedTime + dt : 0;
  } else player.blockedTime = 0;
  const eyePos = player.pos.clone().addScaledVector(stickUpWorld, EYE_HEIGHT);
  const lookDir = worldFwd.clone().applyAxisAngle(worldRight, player.pitch).normalize();

  // Third-person: the camera sits BEHIND and ABOVE the head, but its aim
  // direction (lookDir, from the SAME bodyYaw/pitch that also drives the
  // player's own facing and movement) is unchanged from the old first-
  // person camera - turning the camera left/right still turns the player
  // (bodyYaw IS the player's heading), and looking up/down still aims the
  // same way. Only the viewpoint moved outside the head.
  //
  // WHERE the camera sits (camOffsetDir below) deliberately uses the FLAT,
  // yaw-only "backward" (same as updatePlayerBodyTransform's own fwd, no
  // pitch) - NOT lookDir/the pitch-aware "backward" used for the camera's
  // own aim just below. Pitch was baked into the offset direction here
  // before, which meant looking far up (lookDir swinging upward) swung
  // "behind" (its negation) downward, dragging the camera's POSITION down
  // and behind-BELOW the player until it ended up inside their own body/
  // legs (and symmetrically inside their own head/cap looking far down) -
  // exactly the "I see his legs filling the screen" bug. A real over-the-
  // shoulder camera's seat stays fixed relative to the body (yaw only) while
  // only its AIM follows full pitch - so the seat here now does the same.
  // The seat is chosen and validated by placeThirdPersonCamera (see
  // 06b-body-and-camera-vs-solids.js): behind-and-above the head when that is
  // free, otherwise swung to the side / above - never inside a wall, door,
  // the floor or ceiling, or the player's own body.
  // the head-bob is part of the eye position the seat is validated from, so the
  // camera that is finally shown is exactly the spot that was checked
  const camEye = eyePos.clone().addScaledVector(stickUpWorld, Math.sin(player.walkPhase*2)*HEAD_BOB_AMPLITUDE*player.walkBlend);
  const hideBodyForCamera = placeThirdPersonCamera(camEye, stickUpWorld, worldFwd, dt);
  if(playerBodyGroup) playerBodyGroup.visible = (mode==="interior") && settings.showBody && !hideBodyForCamera;
  camera.up.copy(stickUpWorld);
  // AIM still follows the full pitch-aware lookDir/backward - this is the
  // part that's supposed to tip up/down as the player looks up/down.
  const backward = lookDir.clone().negate();
  const camRight = new THREE.Vector3().crossVectors(stickUpWorld, backward).normalize();
  const camUp = new THREE.Vector3().crossVectors(backward, camRight);
  camera.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(camRight, camUp, backward));
  // subtle head-bob while walking, synced to the footstep phase (see
  // updatePlayerBodyAnimation) - purely cosmetic, on top of the real camera position.
  // (head-bob already included in camEye above)

  // the head bone visibly nods with the same pitch that aims the camera
  // (see updatePlayerHeadPitch) - now meaningful since the player can
  // actually see their own head from behind.

  // first-person/third-person body: same stickUpWorld, yaw-only (no pitch).
  // The body's own geometry is the loaded GLB model (see buildPlayerBody),
  // whose own origin (Y=0 in its local space) IS the sole of its feet -
  // unlike the old procedural body (built relative to the EYE point, legs
  // hanging down EYE_HEIGHT), so the group must be placed at the capsule's
  // feet position (player.pos), not eyePos.
  // (body already posed and collision-corrected above)

  followLight.position.copy(eyePos.clone().addScaledVector(stickUpWorld, -2));
  orientDoorSignsForPlayer();

  // room label + nearest-passage prompt
  roomCheckTimer -= dt;
  if(roomCheckTimer<=0){
    const prevRoom = cachedRoom;
    cachedRoom = currentRoom();
    roomCheckTimer = 0.35;
    if(cachedRoom !== prevRoom) updateSkyOverlayVisibility(); // only redraw this when the room actually changed
  }
  const roomLabelEl = document.getElementById('roomLabel');
  if(cachedRoom){
    roomLabelEl.style.display='block';
    roomLabelEl.textContent = dispName(cachedRoom);
  }

  // door interaction: raycast straight ahead from the crosshair; if a door
  // is in the crosshair (and nothing, like a wall, blocks the view of it
  // first), show which room clicking it leads to.
  const promptEl = document.getElementById('prompt');
  const doorHit = doorAheadOfCrosshair();
  if(doorHit){
    const p = PASSAGES[doorHit.object.userData.passageIndex];
    const otherId = (cachedRoom && p.a===cachedRoom.id) ? p.b : p.a;
    const other = roomById[otherId];
    promptEl.style.display='block';
    promptEl.textContent = (UI_TEXT[settings.lang]||UI_TEXT.he).passThrough(dispName(other));
  } else {
    promptEl.style.display='none';
  }
}

function updateExterior(){
  const cx = Math.cos(orbit.yaw)*Math.cos(orbit.pitch)*orbit.dist;
  const cz = Math.sin(orbit.yaw)*Math.cos(orbit.pitch)*orbit.dist;
  const cy = Math.sin(orbit.pitch)*orbit.dist;
  camera.up.set(0,1,0);
  camera.position.set(cx,cy,cz);
  camera.lookAt(0,0,0);

  const roomLabelEl = document.getElementById('roomLabel');
  const promptEl = document.getElementById('prompt');
  const selected = exteriorSelectedRoomId && roomById[exteriorSelectedRoomId];
  if(selected){
    roomLabelEl.style.display='block';
    roomLabelEl.textContent = dispName(selected);
    promptEl.style.display='block';
    promptEl.textContent = (UI_TEXT[settings.lang]||UI_TEXT.he).enterDouble(dispName(selected));
  } else {
    roomLabelEl.style.display='none';
    promptEl.style.display='block';
    promptEl.textContent = (UI_TEXT[settings.lang]||UI_TEXT.he).exteriorPrompt;
  }
}

