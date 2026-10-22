/* ============================================================================
   FIRST-PERSON BODY — a small Haredi boy's lower body (white shirt hem,
   tzitzit, black pants, black shoes), built from plain primitives (no
   external model/asset file - everything here stays a single self-contained
   HTML file). Lives directly in the scene, NOT parented to the camera - a
   camera-parented body would sit at a fixed ANGLE from the camera's own
   forward axis no matter which way that axis points, which (after actually
   testing it) meant it was either always in frame or never in frame,
   completely independent of whether the player was looking down. Instead,
   updateInterior() repositions/reorients this group itself every frame,
   using the FLAT heading (the local room floor normal in the default mode,
   or WORLD_UP/worldYaw in "obey gravity" mode - see the two branches there)
   with NO pitch applied - i.e. the body always stands upright at the
   player's own position, facing the way they're walking, exactly like a
   real body would, regardless of which way the camera itself is currently
   tilted to look. That's also what makes "aligned to gravity, depending on
   the mode" correct almost for free: it's built from literally the same
   gravity-reference vectors the camera basis uses, just without the pitch
   term. The practical effect: looking straight ahead, the body sits below
   the frustum exactly as your own body does in real life; pitching the
   camera down brings it into view, and further down brings you nose-to-nose
   with your own shoes - because the camera's forward axis is now tilting
   toward the body's fixed real-world position, not because the body moves.
   Legs pivot at the hip and swing with player.walkPhase while the player is
   moving, easing back to a neutral standing pose (player.walkBlend) when
   they stop.
   ============================================================================ */
let playerBodyGroup, bodyLegPivotL, bodyLegPivotR, bodyArmPivotL, bodyArmPivotR, bodyHeadPivot;

// ---- body collision samples -------------------------------------------
// The capsule (PLAYER_RADIUS) is much narrower than the visible body: the
// shoulders reach ~2.7 from the centre line and a walking stride puts a
// foot ~5.7 ahead of it (measured on this exact model, every vertex skinned
// through the live skeleton), so a capsule that stopped 2.0 from a wall left
// shoulders, hands and feet poking through it. Instead of guessing a bigger
// capsule, a fixed set of vertices spread evenly over the REAL skinned
// surface (farthest-point sampling, so every limb is covered) is tracked
// every frame through the animated skeleton, and the body is kept from
// letting any of them cross a wall - see resolveBodyPenetration().
let bodyCollSamples = [];   // [{mesh, index}] - vertices, fixed for the life of the model
let bodyCollMeshes  = [];   // unique skinned meshes among them (skeleton updated once each)
const BODY_COLL_SAMPLE_COUNT = 1200;
function buildBodyCollisionSamples(){
  bodyCollSamples = []; bodyCollMeshes = [];
  const v = new THREE.Vector3(), pts = [];
  playerBodyGroup.updateMatrixWorld(true);
  playerBodyGroup.traverse(o=>{
    if(!o.isSkinnedMesh) return;
    o.skeleton.update();
    const n = o.geometry.attributes.position.count;
    for(let i=0;i<n;i++){
      o.boneTransform(i, v); v.applyMatrix4(o.matrixWorld);
      pts.push(v.x, v.y, v.z, o, i);
    }
  });
  const count = pts.length/5;
  if(!count) return;
  const minD = new Float64Array(count).fill(Infinity);
  let cur = 0;
  for(let k=0;k<Math.min(BODY_COLL_SAMPLE_COUNT,count);k++){
    const mesh = pts[cur*5+3];
    bodyCollSamples.push({mesh, index: pts[cur*5+4]});
    if(!bodyCollMeshes.includes(mesh)) bodyCollMeshes.push(mesh);
    const x=pts[cur*5], y=pts[cur*5+1], z=pts[cur*5+2];
    let far=-1, farI=0;
    for(let i=0;i<count;i++){
      const dx=pts[i*5]-x, dy=pts[i*5+1]-y, dz=pts[i*5+2]-z;
      const d=dx*dx+dy*dy+dz*dz;
      if(d<minD[i]) minD[i]=d;
      if(minD[i]>far){ far=minD[i]; farI=i; }
    }
    cur = farI;
  }
}
function buildPlayerBody(){
  // The player's body is a real rigged GLB model (uploaded by the user),
  // not procedural geometry - loaded once, asynchronously, from
  // assets/player-model.js. playerBodyGroup is
  // created and added to the scene immediately (synchronously), empty, so
  // every other system that already references it (visibility toggling,
  // updatePlayerBodyTransform, updatePlayerBodyAnimation's own
  // bodyLegPivotL/R null-checks) keeps working exactly as before and simply
  // has nothing to show/animate until the model finishes parsing.
  playerBodyGroup = new THREE.Group();
  playerBodyGroup.visible = false; // shown only in interior mode - see setMode()
  scene.add(playerBodyGroup);

  if(!window.THREE || !THREE.GLTFLoader) return;
  const loader = new THREE.GLTFLoader();
  const b64 = window.PLAYER_MODEL_B64;
  if(!b64){ console.error('player model data missing'); return; }
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) buf[i] = bin.charCodeAt(i);
  {
  loader.parse(buf.buffer, '', (gltf)=>{
    const model = gltf.scene;
    // Measured from the model itself (world-space bone positions, T-pose):
    // feet sit at local Y=0, eye level (average of LeftEye/RightEye) at
    // local Y~1.3478 - that's the real scale reference ("how tall is this
    // model's actual eye height"), not a guessed bounding-box fraction.
    // Scaling by EYE_HEIGHT/measuredEyeY makes the model's own eye height
    // land exactly on the game's EYE_HEIGHT constant once its feet are
    // placed at player.pos, so the camera (independently placed at
    // player.pos + EYE_HEIGHT*WORLD_UP - see updateInterior) lines up with
    // this body's real eyes instead of an arbitrary guess.
    const MODEL_EYE_Y = 1.3478;
    const scale = EYE_HEIGHT / MODEL_EYE_Y;
    model.scale.setScalar(scale);
    // The model's own front faces local +Z; updatePlayerBodyTransform's
    // basis maps the character's facing direction onto local -Z, so the
    // loaded model is rotated 180 degrees here, once, to match.
    //
    // This line was removed for a while during investigation of a "camera
    // shows the face instead of the back" bug, on the theory that the
    // model's front was actually -Z already. That theory was wrong, and
    // only SEEMED to check out at the time because updatePlayerBodyTransform
    // itself had an independent bug (see its own comment): the "right" axis
    // it was given, combined with up/-fwd, formed a left-handed (improper,
    // determinant -1) basis matrix, which THREE.Quaternion.setFromRotation-
    // Matrix silently turns into a garbage, non-unit quaternion rather than
    // a real rotation - confirmed directly by reading playerBodyGroup.
    // quaternion back (length 0.707, not 1). That garbage transform
    // coincidentally happened to render something that looked like a
    // correct back-view for SOME bodyYaw values, and obviously-wrong ones
    // (a sideways profile) for others - which is why it seemed fixed in one
    // room and was still broken in another. With that matrix now always
    // proper (self-consistent for every bodyYaw, verified by comparing the
    // body group's actual world-space forward vector to the intended one -
    // they now match exactly, always), the body consistently faces fwd
    // facing-forward on its OWN local +Z, so this 180-degree correction is
    // needed again to make the model's front align with that, and with the
    // camera's own convention (local -Z = facing direction).
    model.rotation.y = Math.PI;
    model.traverse(o=>{
      if(o.isMesh){
        o.castShadow = false; o.receiveShadow = false;
        // These meshes are skinned to a rig whose pose can swing a limb well
        // outside the geometry's BIND-pose bounding sphere (the only one
        // three.js computes - it never re-derives bounds from the animated
        // pose). With frustumCulled left on, a swung limb can end up outside
        // that stale bounding volume and get incorrectly culled/clipped by
        // the renderer, producing exactly the kind of "limb detaches/
        // disappears" glitch a skinned character has no business showing.
        // Disabling per-mesh frustum culling is the standard fix for
        // animated skinned meshes.
        o.frustumCulled = false;
        // The GLB ships every material as full metal (metalness 1, roughness 1).
        // With no environment map a metal has nothing to reflect, so skin and
        // clothes came out flat and washed-out under the scene's strong ambient
        // light. Skin/cloth are not metal: render them as ordinary diffuse
        // material, slightly dimmed against the bright ambient and with a small
        // self-lit share of their own texture so colours stay rich.
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(m=>{
          if(m && m.isMeshStandardMaterial && m.map){
            m.metalness = 0; m.roughness = 0.75;
            const isSkin = /^Avatar(Body|Head)$/.test(m.name || o.name || '');
            if(isSkin){
              // bare skin (face, neck, arms, hands) took the same boost as the clothes and
              // blew out to a flat orange-white ("burnt"): a plain diffuse skin texture, a
              // little darker, no self-lit share, keeps its real tone and its shading
              m.roughness = 0.9;
              m.color.setScalar(0.62);
            } else {
              m.color.setScalar(0.78);
              m.emissive.setScalar(0.12); m.emissiveMap = m.map;
            }
            m.needsUpdate = true;
          }
        });
      }
    });
    playerBodyGroup.add(model);

    // Reuse the SAME bone objects the rig already has as the walk-cycle
    // pivots - updatePlayerBodyAnimation() (below) rotates these exactly
    // like it rotated the old procedural leg/arm pivot Groups, so no
    // animation code needed to change, only what it points at.
    bodyLegPivotL = model.getObjectByName('LeftUpLeg') || null;
    bodyLegPivotR = model.getObjectByName('RightUpLeg') || null;
    bodyArmPivotL = model.getObjectByName('LeftArm') || null;
    bodyArmPivotR = model.getObjectByName('RightArm') || null;
    bodyHeadPivot = model.getObjectByName('Head') || null;
    // remember each pivot's own rest rotation (its exported T-pose/bind
    // pose), since - unlike the old from-scratch pivots, which started at
    // identity - these bones already carry a real rest orientation from
    // the rig itself; the walk swing must be applied ON TOP of a rest
    // pose, not instead of it, or the limbs snap to a wrong angle the
    // instant the model loads.
    //
    // Legs already hang down naturally in this rig's own bind pose (visually
    // confirmed), so their bind quaternion IS their standing rest pose.
    //
    // Arms do NOT: this rig's bind pose is a T-pose (arms held straight out
    // to the sides, standard for a GLB meant to be retargeted), which is not
    // a usable standing pose for a game character. Measured empirically
    // (isolated bone-rotation tests against this exact model): rotating
    // LeftArm/RightArm by the SAME +1.45 rad around their own local X axis
    // (from the T-pose bind) brings both arms down to hang naturally at the
    // sides. That offset is baked into the arms' restQuat here, once, so
    // everything downstream (applyBoneSwing) just composes the walk swing
    // on top of a standing pose, exactly like the legs.
    [bodyLegPivotL, bodyLegPivotR].forEach(p=>{
      if(p) p.userData.restQuat = p.quaternion.clone();
    });
    const ARM_DOWN_ANGLE = 1.45; // radians, T-pose -> arms-at-sides (measured on this model)
    const armDownQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), ARM_DOWN_ANGLE);
    [bodyArmPivotL, bodyArmPivotR].forEach(p=>{
      if(p) p.userData.restQuat = p.quaternion.clone().multiply(armDownQuat);
    });
    // Head needs no down-correction (the neck's own bind pose already looks
    // level), just its own rest quaternion to compose the look-pitch nod on
    // top of, same pattern as everything else.
    if(bodyHeadPivot) bodyHeadPivot.userData.restQuat = bodyHeadPivot.quaternion.clone();

    // a soft dark blob directly under the feet, same as the old procedural
    // body had, so the character still visibly "stands on" the floor
    // instead of floating just above it.
    const shadowCv = document.createElement('canvas');
    shadowCv.width = shadowCv.height = 64;
    const sctx = shadowCv.getContext('2d');
    const grad = sctx.createRadialGradient(32,32,0,32,32,32);
    grad.addColorStop(0,'rgba(0,0,0,0.45)'); grad.addColorStop(1,'rgba(0,0,0,0)');
    sctx.fillStyle = grad; sctx.fillRect(0,0,64,64);
    const footShadow = new THREE.Mesh(
      new THREE.CircleGeometry(EYE_HEIGHT*0.16, 20),
      new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCv), transparent:true, depthWrite:false})
    );
    footShadow.rotation.x = -Math.PI/2;
    footShadow.position.set(0, 0.02, 0);
    footShadow.renderOrder = 2;
    playerBodyGroup.add(footShadow);
    buildBodyCollisionSamples();
  }, (err)=>{
    console.error('player model failed to load:', err);
  });
  }
}
buildPlayerBody();

const WALK_CYCLE_SPEED = 7.6;  // radians/sec the walk phase advances while moving - tuned for a natural step cadence, not tied to walkSpeedMult so sprinting doesn't turn into a blur
const MAX_LEG_SWING = 0.52;    // ~30 degrees each way
const MAX_ARM_SWING = 0.32;    // a touch less than the legs, like a real walk
const HEAD_BOB_AMPLITUDE = EYE_HEIGHT*0.014; // a small vertical head-bob synced to footsteps (2 bobs per stride) - purely cosmetic, on top of the real eyePos, meant to make it feel like real eyes/a real walk rather than a camera gliding on rails
// Third-person camera: positioned behind and above the player's head rather
// than inside it, but still rigidly yoked to the SAME bodyYaw/pitch the old
// first-person camera used - turning the camera (mouse X) still turns the
// player's own facing (bodyYaw is the player's heading, used for movement
// too), and looking up/down (mouse Y / pitch) still aims the same way. This
// is deliberately NOT a free-orbiting spectator camera.
const THIRD_PERSON_DISTANCE = EYE_HEIGHT*0.62; // how far behind the head
const THIRD_PERSON_HEIGHT   = EYE_HEIGHT*0.12; // how far above the head
// THIRD_PERSON_CAM_RADIUS (how far to pull the camera off a wall it would
// otherwise clip into) is declared right after PLAYER_RADIUS, further down
// this file - PLAYER_RADIUS isn't defined yet at this point in the module,
// and referencing it here would throw a temporal-dead-zone error at load.
// How far the HEAD bone itself visibly nods with pitch (mouse up/down),
// separate from (and smaller than) the camera's own full look-range -
// a real neck can't bend ±89 degrees, so the head's own articulation is
// clamped while the camera's aim direction (and crosshair) still follows
// the player's full, unclamped pitch exactly as before.
const NECK_PITCH_LIMIT = 0.6; // radians, ~34 degrees each way
const _X_AXIS = new THREE.Vector3(1,0,0);
const _Z_AXIS = new THREE.Vector3(0,0,1);
const _swingQuat = new THREE.Quaternion();
// Applies an additional swing rotation ON TOP OF a bone's own rest pose
// (userData.restQuat, captured once when the model finished loading - see
// buildPlayerBody, which for the arms already bakes in the T-pose->down-
// at-sides correction so this never has to know about that). Unlike the
// old procedural pivots (which started at identity, so a plain
// `.rotation.x =` was the whole pose), these are real rig bones that
// already carry a non-identity rest rotation - overwriting it outright
// would snap the limb to the wrong angle. Composing rest*swing instead
// keeps the bone's rest pose and adds the swing around `axis`, evaluated
// in the bone's ORIGINAL (pre-rest-rotation) local frame - which is also
// why legs and arms need DIFFERENT swing axes below: empirically measured
// (isolated bone-rotation tests against this exact model) that this rig's
// local X is the leg's natural forward/back swing axis, while for the arms
// (already reoriented by the baked-in down rotation) local Z is the one that
// swings forward/back - a different axis is not a hack, it's a property of
// this rig's own per-bone local axis orientation, confirmed by direct
// measurement rather than assumed.
function applyBoneSwing(bone, angle, axis){
  if(!bone || !bone.userData.restQuat) return;
  _swingQuat.setFromAxisAngle(axis, angle);
  bone.quaternion.copy(bone.userData.restQuat).multiply(_swingQuat);
}
function updatePlayerBodyAnimation(dt, isMoving){
  if(!bodyLegPivotL || !bodyLegPivotR) return;
  player.walkBlend = THREE.MathUtils.clamp(player.walkBlend + (isMoving?1:-1)*dt*4, 0, 1); // eases in/out so stopping doesn't freeze mid-stride
  if(isMoving) player.walkPhase += dt*WALK_CYCLE_SPEED;
  const swing = Math.sin(player.walkPhase) * MAX_LEG_SWING * player.walkBlend;
  applyBoneSwing(bodyLegPivotL, swing, _X_AXIS);
  applyBoneSwing(bodyLegPivotR, -swing, _X_AXIS);
  // arms counter-swing opposite the same-side leg, like a real gait (left
  // leg forward pairs with right arm forward)
  if(bodyArmPivotL && bodyArmPivotR){
    const armSwing = Math.sin(player.walkPhase) * MAX_ARM_SWING * player.walkBlend;
    applyBoneSwing(bodyArmPivotL, -armSwing, _Z_AXIS);
    applyBoneSwing(bodyArmPivotR, armSwing, _Z_AXIS);
  }
}
// Visibly nods the HEAD bone with the player's own look-pitch (mouse up/
// down), now that there's a real head to see from third person: looking
// down lowers it, looking up raises it. Empirically measured (isolated
// bone-rotation test against this exact model) that local X is this bone's
// own nod axis too, with the SAME sign convention already derived for
// player.pitch itself (positive pitch = looking down; positive local-X
// rotation on this bone also tips the head down) - no sign flip needed.
// Clamped to NECK_PITCH_LIMIT (a real neck's own comfortable range), kept
// separate from the camera's own full, unclamped pitch so the aim/crosshair
// direction is never affected by this purely cosmetic articulation.
function updatePlayerHeadPitch(pitch){
  if(!bodyHeadPivot) return;
  const clamped = THREE.MathUtils.clamp(pitch, -NECK_PITCH_LIMIT, NECK_PITCH_LIMIT);
  applyBoneSwing(bodyHeadPivot, clamped, _X_AXIS);
}

// positions/orients the whole body group each frame from a FLAT (no-pitch)
// basis - see the big comment above for why this can't just be a camera
// child. `up`/`fwd` must already be unit, mutually-perpendicular vectors.
//
// The "right" axis is deliberately NOT taken as a parameter (it used to be,
// computed by the caller as cross(up,fwd) - the same vector that's also fed
// to the pitch rotation elsewhere) - that vector, combined with `up` and
// `-fwd` as the three columns of makeBasis, is a LEFT-HANDED triple
// (determinant -1: cross(up,fwd) x up = fwd, not -fwd, by the vector
// triple-product identity a x b x a = b when a,b are perpendicular unit
// vectors - so the three columns form an improper/reflected matrix, not a
// real rotation). THREE.Quaternion.setFromRotationMatrix assumes a PROPER
// rotation matrix and silently returns a degenerate, non-unit quaternion
// for an improper one - which is exactly what was happening here: the body
// group's own orientation was garbage on every frame, and only "looked"
// right from some camera angles/bodyYaw values by coincidence (confirmed by
// dumping playerBodyGroup.quaternion live: length 0.707, not 1).
//
// The fix: derive the right axis HERE, internally, the one way that's
// guaranteed consistent with `up`/`fwd` - cross(fwd,up), the character's own
// true right-hand direction (verified directly: facing fwd=-Z with up=+Y,
// a person's right hand points toward +X, matching cross(fwd,up) here, not
// cross(up,fwd)) - so right x up = -fwd always holds and makeBasis(right,
// up, -fwd) is always a proper rotation, for every bodyYaw, with no separate
// "right" the caller has to get right.
const _bodyRight = new THREE.Vector3();
const _bodyBasisMat = new THREE.Matrix4();
function updatePlayerBodyTransform(pos, up, fwd){
  if(!playerBodyGroup) return;
  playerBodyGroup.position.copy(pos);
  _bodyRight.crossVectors(fwd, up).normalize();
  _bodyBasisMat.makeBasis(_bodyRight, up, fwd.clone().negate());
  playerBodyGroup.quaternion.setFromRotationMatrix(_bodyBasisMat);
}

