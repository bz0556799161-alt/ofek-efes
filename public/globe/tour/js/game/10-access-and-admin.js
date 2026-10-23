/* ============================================================================
   ROOM ACCESS (admin lock) — the owner of the page picks which rooms are open;
   everybody else can enter only those. The choice lives in the page's shared
   database (document config/access: {open:[roomIds]}) and every open view
   follows it live. An empty list means nothing is locked. The owner always
   moves freely, unless "visitor preview" is ticked in the admin panel.
   ============================================================================ */
const roomAccess = {
  open: new Set(),        // room ids open to everybody; empty = no restriction
  isAdmin: false,         // owner of the page (set once the user capability answers)
  previewAsVisitor: false,
  pickFromMap: false,     // admin panel: clicks on the globe / sphere toggle a room instead of entering it
  artifact: null,         // the artifact capability (owner only), used to publish the lock file
  writing: false, queued: false,
};
function accessRestricted(){ return roomAccess.open.size > 0; }
function accessApplies(){ return !(roomAccess.isAdmin && !roomAccess.previewAsVisitor); }
function canEnterRoom(id){
  if(!accessRestricted() || !accessApplies()) return true;
  return roomAccess.open.has(id);
}
// the room the "view from inside" button enters: Orion, or the first open room when Orion is locked
function defaultEntryRoomId(){
  if(canEnterRoom('Ori')) return 'Ori';
  for(let i=0;i<ROOMS.length;i++) if(canEnterRoom(ROOMS[i].id)) return ROOMS[i].id;
  return null;
}
let _lockMsgTimer = 0;
function showRoomLocked(roomId){
  const el = document.getElementById('roomLockMsg');
  if(!el) return;
  const t = UI_TEXT[settings.lang] || UI_TEXT.he;
  el.textContent = t.roomLocked(dispName(roomById[roomId]));
  el.style.display = 'block';
  clearTimeout(_lockMsgTimer);
  _lockMsgTimer = setTimeout(()=>{ el.style.display = 'none'; }, 2200);
}

/* ---- admin panel ---- */
function refreshAdminList(){
  const list = document.getElementById('adminList');
  if(!list) return;
  const q = (document.getElementById('adminFilter').value||'').trim().toLowerCase();
  const rooms = ROOMS.slice().sort((a,b)=>dispName(a).localeCompare(dispName(b), settings.lang==='en'?'en':'he'));
  list.innerHTML = '';
  rooms.forEach(r=>{
    const label = dispName(r);
    if(q && !(label.toLowerCase().includes(q) || (r.nameLatin||'').toLowerCase().includes(q) || r.id.toLowerCase()===q)) return;
    const row = document.createElement('label');
    const span = document.createElement('span'); span.textContent = label + (settings.lang==='he' && r.nameLatin ? '  ·  ' + r.nameLatin : '');
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = roomAccess.open.has(r.id);
    cb.addEventListener('change', ()=> adminSetRoomOpen(r.id, cb.checked));
    row.appendChild(span); row.appendChild(cb); list.appendChild(row);
  });
  updateAdminCount();
}
function updateAdminCount(){
  const el = document.getElementById('adminCount');
  if(!el) return;
  const n = roomAccess.open.size;
  el.textContent = settings.lang==='en'
    ? (n ? `${n} room(s) open to everyone — all others are locked` : 'Nothing is locked: every room is open')
    : (n ? `${n} חדרים פתוחים לכולם — כל השאר נעולים` : 'אין נעילה: כל החדרים פתוחים');
}
function adminSetRoomOpen(id, on){
  if(on) roomAccess.open.add(id); else roomAccess.open.delete(id);
  updateAdminCount();
  saveAccess();
}
function adminToggleRoom(id){
  adminSetRoomOpen(id, !roomAccess.open.has(id));
  refreshAdminList();
}
function setAdminStatus(msg, isErr){
  const el = document.getElementById('adminStatus');
  if(el){ el.textContent = msg||''; el.classList.toggle('err', !!isErr); }
}
// The lock state is a small published file (js/game/access-state.js). Everybody -- anonymous and
// public-link visitors included -- loads it with the page, so it needs no database or sign-in.
// The owner's change is published as a new version of that one file (debounced into one publish).
let _saveTimer = 0;
function accessStateSource(){
  return 'window.ROOM_ACCESS = ' + JSON.stringify({open: Array.from(roomAccess.open).sort(), updatedAt: Date.now()}) + ';\n';
}
function saveAccess(){
  if(!roomAccess.isAdmin){ setAdminStatus(settings.lang==='en' ? 'Only the site admin can save.' : 'רק מנהל האתר יכול לשמור.', true); return; }
  setAdminStatus(settings.lang==='en' ? 'Saving…' : 'שומר…', false);
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(publishAccess, 1500);
}
async function publishAccess(){
  if(roomAccess.writing){ roomAccess.queued = true; return; }
  roomAccess.writing = true;
  try{
    const r = await fetch('/api/admin/globe', {method:'POST', credentials:'same-origin', headers:{'content-type':'application/json'},
      body: JSON.stringify({open: Array.from(roomAccess.open).sort()})});
    if(!r.ok){ const j = await r.json().catch(()=>({})); throw {code: j.error || r.status}; }
    setAdminStatus(settings.lang==='en' ? 'Saved — visitors get the new lock within half a minute.' : 'נשמר — המבקרים יקבלו את הנעילה החדשה תוך חצי דקה.', false);
  }catch(e){
    const c = e && e.code;
    setAdminStatus((settings.lang==='en' ? 'Publishing failed: ' : 'הפרסום נכשל: ') + (c || e) + (c==='conflict' ? (settings.lang==='en' ? ' (page reloads)' : ' (העמוד ייטען מחדש)') : ''), true);
  }
  roomAccess.writing = false;
  if(roomAccess.queued){ roomAccess.queued = false; publishAccess(); }
}
// called when the shared document changes (or at first load)
function applyAccessSnapshot(data){
  const list = data && Array.isArray(data.open) ? data.open.filter(id=>roomById[id]) : [];
  roomAccess.open = new Set(list);
  updateAdminCount();
  if(document.getElementById('adminPanel').style.display!=='none') refreshAdminList();
  enforceAccessNow();
}
// a visitor who is standing in a room that just got locked is taken back outside
function enforceAccessNow(){
  if(mode==='interior' && cachedRoom && !canEnterRoom(cachedRoom.id)){
    showRoomLocked(cachedRoom.id);
    goHome();
  }
}
function setAdminPanelVisible(v){
  const p = document.getElementById('adminPanel');
  p.style.display = v ? 'flex' : 'none';
  document.getElementById('btnAdmin').classList.toggle('active', v);
  if(v) refreshAdminList();
  else { roomAccess.pickFromMap = false; document.getElementById('adminPickMap').classList.remove('active'); }
}

(function wireAccess(){
  const $ = id=>document.getElementById(id);
  $('btnAdmin').addEventListener('click', ()=> setAdminPanelVisible($('adminPanel').style.display==='none'));
  $('adminFilter').addEventListener('input', refreshAdminList);
  $('adminClear').addEventListener('click', ()=>{ roomAccess.open.clear(); refreshAdminList(); saveAccess(); });
  $('adminPickMap').addEventListener('click', ()=>{
    roomAccess.pickFromMap = !roomAccess.pickFromMap;
    $('adminPickMap').classList.toggle('active', roomAccess.pickFromMap);
  });
  // preview as a visitor (so the owner can test what everyone else gets)
  const note = $('adminNote');
  const prev = document.createElement('label');
  prev.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:pointer;';
  prev.innerHTML = '<span>תצוגת מבקר (בדיקה)</span><input type="checkbox" id="adminPreview">';
  note.after(prev);
  $('adminPreview').addEventListener('change', e=>{ roomAccess.previewAsVisitor = e.target.checked; enforceAccessNow(); });

  // the site's admin (logged in at /admin on this device) manages the rooms here or in /admin
  const link = document.createElement('a');
  link.href = '/admin/#globe'; link.textContent = 'לניהול הראשי של האתר ↗';
  link.style.cssText = 'color:#c9a66b;font-size:12px;text-decoration:none;';
  $('adminStatus').before(link);
  let flag = null; try{ flag = localStorage.getItem('ofek-admin-device'); }catch(e){}
  if(flag !== '1') return;
  fetch('/api/admin/me', {cache:'no-store', credentials:'same-origin'}).then(r=>r.json()).then(me=>{
    if(!me || !me.admin) return;
    roomAccess.isAdmin = true;
    $('btnAdmin').style.display = 'block';
    enforceAccessNow();
  }).catch(()=>{});
})();

// initial state: the published lock file, loaded before this script
applyAccessSnapshot(window.ROOM_ACCESS || null);
