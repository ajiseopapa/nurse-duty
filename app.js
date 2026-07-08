// ══════════════════════════════════════════════════════════
// 병동 설정 — 이 부분만 수정하면 됩니다
// ══════════════════════════════════════════════════════════
const WARD_CONFIG = [
  { id: 'ward7', name: '7병동', icon: '🏥', color: '#3182f6', description: '' },
  { id: 'ward6', name: '6병동', icon: '🏥', color: '#00b386', description: '' },
  { id: 'ward5', name: '5병동', icon: '🏥', color: '#f59e0b', description: '' }
];
// ══════════════════════════════════════════════════════════

const firebaseConfig = {
  apiKey: "AIzaSyDH5jLGveC8qhHuJFJkLd9R4I57YtYzu0U",
  authDomain: "nurse-duty-sgrh.firebaseapp.com",
  projectId: "nurse-duty-sgrh",
  storageBucket: "nurse-duty-sgrh.firebasestorage.app",
  messagingSenderId: "963315585049",
  appId: "1:963315585049:web:2b132a51cbaee4cf1f1a88",
  measurementId: "G-S091ZDMHYF"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

function setStatus(state, msg, err) {
  document.getElementById('statusDot').className = 'dot ' + state;
  document.getElementById('statusText').textContent = msg;
  if (state === 'err') {
    console.error('[status:err]', msg, err || '');
  }
}

let currentYear  = new Date().getFullYear();
let currentMonth = new Date().getMonth();
let allSchedules = {};
let nurses = [];

// ── 병동 상태: URL ?ward=ward1 로 초기화 ──────────────────
let WARD_ID = new URLSearchParams(location.search).get('ward') || null;

function getCurrentWard() { return WARD_CONFIG.find(w => w.id === WARD_ID) || WARD_CONFIG[0]; }

// 모든 DB 키에 병동 prefix 적용 → 완벽하게 병동별 데이터 분리
function wk(key) { return `${WARD_ID}__${key}`; }

// ── 병동 선택 모달 ─────────────────────────────────────────
function renderWardSelectModal() {
  document.getElementById('wardBtnGroup').innerHTML = WARD_CONFIG.map(w => `
    <button class="ward-option-btn ${WARD_ID === w.id ? 'selected' : ''}" onclick="selectWard('${w.id}')">
      <span style="font-size:22px">${w.icon}</span>
      <div style="flex:1;text-align:left">
        <div>${w.name}</div>
        <div class="ward-option-sub">${w.description}</div>
      </div>
      ${WARD_ID === w.id ? '<span style="color:var(--blue);font-size:18px">✓</span>' : ''}
    </button>`).join('');
}

function openWardSelect() {
  renderWardSelectModal();
  document.getElementById('wardSelectOverlay').classList.add('open');
}

async function selectWard(wardId) {
  WARD_ID = wardId;
  // URL 파라미터 갱신 (새로고침 없음)
  const url = new URL(location.href);
  url.searchParams.set('ward', wardId);
  history.replaceState(null, '', url.toString());

  document.getElementById('wardSelectOverlay').classList.remove('open');
  updateWardBanner();

  // 병동 전환 시 캐시 초기화
  nurses = [];
  allSchedules = {};
  setStatus('loading', `${getCurrentWard().name} 로딩 중...`);
  try {
    await loadNurses();
    renderTable();
    setStatus('ok', `${getCurrentWard().name} 연결됨`);
  } catch(e) {
    setStatus('err', '로드 실패');
    renderTable();
  }
}

function updateWardBanner() {
  const w = getCurrentWard();
  document.getElementById('wardDot').style.background = w.color;
  document.getElementById('wardBannerText').innerHTML =
    `<strong style="color:${w.color}">${w.icon} ${w.name}</strong><span style="font-weight:400;font-size:12px;color:#adb5bd;margin-left:6px">${w.description}</span>`;
  document.getElementById('nurseModalWardLabel').textContent = `— ${w.name}`;
  document.title = `${w.name} 근무표`;
}

// ── Firestore helpers ───────────────────────────────────────

// ── 인력 로드 (ward_id 필터) ──────────────────────────────
async function loadNurses() {
  const snap = await db.collection('nurses').where('ward_id', '==', WARD_ID).get();
  const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  nurses = list.filter(n => n.name && n.name.trim() !== '')
    .map(n => ({ id: n.id, name: n.name.trim(), role: n.role, grade: n.grade, offDays: n.off_days || [],
      annualLeaveTotal: (n.annual_leave_total != null ? n.annual_leave_total : 15) }));
}

// ── 근무표 로드/저장/삭제 ─────────────────────────────────
async function loadSchedule(year, month) {
  const memKey = `${year}-${month}`;
  if (allSchedules[memKey] !== undefined) return;
  try {
    const snap = await db.collection('schedules').doc(wk(memKey)).get();
    allSchedules[memKey] = snap.exists ? snap.data().data : null;
  } catch(e) { allSchedules[memKey] = null; }
}

async function saveDraft(year, month, draftData) {
  const id = wk(`draft-${year}-${month}`);
  await db.collection('schedules').doc(id).set({ year, month, data: draftData, ward_id: WARD_ID });
}

async function loadDraft(year, month) {
  const id = wk(`draft-${year}-${month}`);
  try {
    const snap = await db.collection('schedules').doc(id).get();
    return snap.exists ? snap.data().data : null;
  } catch(e) { return null; }
}

async function saveSchedule(year, month, scheduleData) {
  const id = wk(`${year}-${month}`);
  await db.collection('schedules').doc(id).set({
    year, month, data: scheduleData, ward_id: WARD_ID, updated_at: new Date().toISOString()
  });
}

async function deleteSchedule(year, month) {
  const id = wk(`${year}-${month}`);
  await db.collection('schedules').doc(id).delete();
  allSchedules[`${year}-${month}`] = null;
}

async function deleteDraft(year, month) {
  const id = wk(`draft-${year}-${month}`);
  await db.collection('schedules').doc(id).delete();
}

// ── 인력관리 모달 ──────────────────────────────────────────
function toggleModal(show) {
  document.getElementById('nurseModal').className = 'overlay' + (show ? ' open' : '');
  if (show) renderNurseList();
}
function addNurseRow() { nurses.push({ id: Date.now(), name:'', role:'acting', grade:'RN', offDays:[], annualLeaveTotal:15 }); renderNurseList(); }
function removeNurseRow(i) { nurses.splice(i,1); renderNurseList(); }
function updateNurseField(i,f,v) { nurses[i][f] = v; }
function updateGrade(i,v,el) {
  nurses[i].grade = v;
  const btn = el.parentElement.previousElementSibling;
  btn.innerText = v; btn.style.background = v==='RN'?'#feecef':'#e8f3ff'; btn.style.color = v==='RN'?'#f04452':'#3182f6';
  el.parentElement.style.display = 'none';
}
function updateRole(i,v,el) {
  nurses[i].role = v;
  const rC = { head:'#4facfe', charge:'#66bb6a', acting:'#fbc02d' };
  const btn = el.parentElement.previousElementSibling;
  btn.innerText = v.charAt(0).toUpperCase()+v.slice(1); btn.style.color = rC[v]; btn.style.borderColor = rC[v];
  el.parentElement.style.display = 'none';
}

async function saveNurses() {
  setStatus('loading', '저장 중...');
  try {
    const validNurses = [];
    const seenNames = new Set();
    for (const n of nurses) {
      const name = (n.name||'').trim();
      if (!name || seenNames.has(name)) continue;
      seenNames.add(name); validNurses.push({...n, name});
    }
    nurses = validNurses;

    // 해당 병동 인력만 삭제 후 재삽입 (배치 처리)
    const existingSnap = await db.collection('nurses').where('ward_id', '==', WARD_ID).get();
    const batch = db.batch();
    existingSnap.docs.forEach(docSnap => batch.delete(docSnap.ref));
    if (nurses.length > 0) {
      nurses.forEach((n, i) => {
        const ref = db.collection('nurses').doc();
        batch.set(ref, { name: n.name, role: n.role, grade: n.grade, sort_order: i, off_days: n.offDays || [],
          annual_leave_total: (n.annualLeaveTotal != null ? n.annualLeaveTotal : 15), ward_id: WARD_ID });
      });
    }
    await batch.commit();

    await loadNurses();
    toggleModal(false);
    renderTable();
    setStatus('ok', `${getCurrentWard().name} 저장 완료`);
  } catch(e) {
    setStatus('err', '저장 실패: ' + e.message);
    alert('저장 실패: ' + e.message);
  }
}

function renderNurseList() {
  const list = document.getElementById('nurse-list');
  if (!list) return;
  list.innerHTML = nurses.map((n,i) => {
    const g=n.grade||'RN', r=n.role||'acting';
    const gBg=g==='RN'?'#feecef':'#e8f3ff', gCol=g==='RN'?'#f04452':'#3182f6';
    const rC={head:'#4facfe',charge:'#66bb6a',acting:'#fbc02d'}; const rc=rC[r]||rC.acting;
    return `<div class="nurse-item" data-id="${n.id}">
      <span style="color:#d1d6db;font-size:18px">☰</span>
      <input type="text" value="${n.name||''}" onchange="updateNurseField(${i},'name',this.value)" placeholder="성함 입력">
      <div class="dropdown-wrap" style="flex:0.8;position:relative">
        <div class="grade-btn" style="background:${gBg};color:${gCol}" onclick="event.stopPropagation();toggleNurseDropdown(event,'grade-drop-${i}')">${g}</div>
        <div id="grade-drop-${i}" class="dropdown-panel" style="display:none;position:absolute;top:38px;left:0;z-index:9999">
          <div onclick="event.stopPropagation();updateGrade(${i},'RN',this)" style="color:#f04452">RN</div>
          <div onclick="event.stopPropagation();updateGrade(${i},'AN',this)" style="color:#3182f6">AN</div>
        </div>
      </div>
      <div class="dropdown-wrap" style="flex:1.2;position:relative">
        <div class="role-btn" style="color:${rc};border:2px solid ${rc}" onclick="event.stopPropagation();toggleNurseDropdown(event,'role-drop-${i}')">${r.charAt(0).toUpperCase()+r.slice(1)}</div>
        <div id="role-drop-${i}" class="dropdown-panel" style="display:none;position:absolute;top:38px;left:0;z-index:9999">
          <div onclick="event.stopPropagation();updateRole(${i},'head',this)" style="color:#4facfe">Head</div>
          <div onclick="event.stopPropagation();updateRole(${i},'charge',this)" style="color:#66bb6a">Charge</div>
          <div onclick="event.stopPropagation();updateRole(${i},'acting',this)" style="color:#fbc02d">Acting</div>
        </div>
      </div>
      <input type="number" step="0.5" min="0" value="${n.annualLeaveTotal!=null?n.annualLeaveTotal:15}"
        onchange="updateNurseField(${i},'annualLeaveTotal',parseFloat(this.value)||0)"
        title="연차 총일수" placeholder="연차"
        style="width:56px;flex:0 0 56px;text-align:center;font-size:12px;padding:6px 4px;border:1px solid #e5e8eb;border-radius:6px">
      <button class="del-btn" onclick="removeNurseRow(${i})">✕</button>
    </div>`;
  }).join('');
  if (window.Sortable) {
    Sortable.create(list, { animation:150, ghostClass:'sortable-ghost',
      onEnd: function() {
        const items = list.querySelectorAll('.nurse-item');
        let newOrder = [];
        items.forEach(item => { const n = nurses.find(x => x.id === parseInt(item.dataset.id)); if (n) newOrder.push(n); });
        nurses = newOrder;
      }
    });
  }
}

function toggleNurseDropdown(e, id) {
  e.stopPropagation();
  const target = document.getElementById(id);
  if (!target) return;
  const isOpen = target.style.display === 'block';
  document.querySelectorAll('[id^="grade-drop-"],[id^="role-drop-"]').forEach(el => el.style.display = 'none');
  target.style.display = isOpen ? 'none' : 'block';
}

function renderRoleBadge(role) {
  if (role==='head')   return '<span style="font-size:9px;font-weight:800;background:#e3f2fd;color:#4facfe;border-radius:4px;padding:1px 5px;margin-left:3px">H</span>';
  if (role==='charge') return '<span style="font-size:9px;font-weight:800;background:#e8f5e9;color:#388e3c;border-radius:4px;padding:1px 5px;margin-left:3px">C</span>';
  if (role==='acting') return '<span style="font-size:9px;font-weight:800;background:#fff8e1;color:#f9a825;border-radius:4px;padding:1px 5px;margin-left:3px">A</span>';
  return '';
}

// ── 근무별 개인 통계 (해당 월 기준) ─────────────────────────
const LEAVE_WEIGHTS = { V:1, v05:0.5, v25:0.25, v75:0.75 };
function computeStats(p) {
  const counts = { D:0, E:0, N:0, Off:0 };
  let leaveUsed = 0;
  (p.shifts || []).forEach(s => {
    if (!s) return;
    if (s==='D'||s==='D1'||s==='DH'||s==='MD') counts.D++;
    else if (s==='E') counts.E++;
    else if (s==='N') counts.N++;
    else if (s==='O'||s==='Off') counts.Off++;
    if (LEAVE_WEIGHTS[s] !== undefined) leaveUsed += LEAVE_WEIGHTS[s];
  });
  const nv = nurses.find(n => n.name === p.name);
  const leaveTotal = (nv && nv.annualLeaveTotal != null) ? nv.annualLeaveTotal : 15;
  leaveUsed = +leaveUsed.toFixed(2);
  const leaveRemain = +(leaveTotal - leaveUsed).toFixed(2);
  return { ...counts, leaveUsed, leaveTotal, leaveRemain };
}
function statCellsHTML(p) {
  const st = computeStats(p);
  return `<td style="font-weight:700;font-size:12px;background:#f8f9fa;color:#333">${st.D}</td>
    <td style="font-weight:700;font-size:12px;background:#f8f9fa;color:#333">${st.E}</td>
    <td style="font-weight:700;font-size:12px;background:#f8f9fa;color:#333">${st.N}</td>
    <td style="font-weight:700;font-size:12px;background:#f8f9fa;color:#333">${st.Off}</td>
    <td style="font-weight:700;font-size:11px;background:#fff3e0;color:#e65100" title="사용/총 ${st.leaveTotal}일">${st.leaveUsed}/${st.leaveRemain}</td>`;
}
const STAT_HEADER_HTML = `<th style="width:34px;background:#f1f3f5;font-size:11px">D</th>
  <th style="width:34px;background:#f1f3f5;font-size:11px">E</th>
  <th style="width:34px;background:#f1f3f5;font-size:11px">N</th>
  <th style="width:34px;background:#f1f3f5;font-size:11px">Off</th>
  <th style="width:58px;background:#fff3e0;font-size:11px">연차<br><span style="font-weight:400;font-size:9px">사용/잔여</span></th>`;

// ── 메인 테이블 ────────────────────────────────────────────
async function renderTable() {
  const daysInMonth = new Date(currentYear, currentMonth+1, 0).getDate();
  const wd = ['일','월','화','수','목','금','토'];
  const headerRow = document.getElementById('dateHeader');
  headerRow.innerHTML = '<th style="width:100px">이름</th>';
  for (let i = 1; i <= daysInMonth; i++) {
    const dow = new Date(currentYear, currentMonth, i).getDay();
    const dc = dow===0?'sun':dow===6?'sat':'';
    headerRow.innerHTML += `<th class="${dc}" style="font-size:11px;padding:5px 0">${i}<br><span style="font-weight:normal;font-size:10px">(${wd[dow]})</span></th>`;
  }
  headerRow.innerHTML += STAT_HEADER_HTML;
  document.getElementById('currentMonth').innerHTML = `${currentYear}년 ${currentMonth+1}월
    <button onclick="goCurrentMonth()" style="margin-left:8px;padding:4px 8px;font-size:12px;font-weight:600;color:#3182f6;background:#e8f3ff;border:none;border-radius:6px;cursor:pointer;vertical-align:middle">이번 달</button>`;

  await loadSchedule(currentYear, currentMonth);
  const key = `${currentYear}-${currentMonth}`;
  const saved = allSchedules[key];
  const body = document.getElementById('schedBody');

  if (saved) {
    for (const n of nurses) {
      if (!saved.find(p => p.name === n.name))
        saved.push({ name:n.name, grade:n.grade||'RN', role:n.role||'acting', shifts:Array(daysInMonth).fill('O'), locked:{} });
    }
    const merged = nurses.map(n => saved.find(p => p.name === n.name)).filter(Boolean);
    allSchedules[key] = merged;
    body.innerHTML = merged.map((p,ni) => `<tr>
      <td style="font-weight:bold;font-size:12px;${p.role==='head'?'background:#FFF3E0;color:#E65100;':''}">[${p.grade||'RN'}] ${p.name||''} ${renderRoleBadge(p.role)}</td>
      ${p.shifts.map((s,di) => `<td class="shift-${s}${p.locked&&p.locked[di]?' cell-locked':''}"
        onclick="toggleShiftDropdown(event,'${key}',${ni},${di})"
        oncontextmenu="event.preventDefault();deleteShiftCell('${key}',${ni},${di})"
        style="cursor:pointer;font-size:13px;font-weight:bold;padding:6px 2px">${s||'-'}</td>`).join('')}
      ${statCellsHTML(p)}
    </tr>`).join('');
  } else {
    const draftKey = key + '-draft';
    if (!allSchedules[draftKey]) {
      const remote = await loadDraft(currentYear, currentMonth);
      if (remote) {
        allSchedules[draftKey] = nurses.map(n => {
          const f = remote.find(d => d.name === n.name);
          return f ? {...f, grade:n.grade||'RN', role:n.role||'acting'}
            : { name:n.name, grade:n.grade||'RN', role:n.role||'acting', shifts:Array(daysInMonth).fill(''), locked:{} };
        });
      } else {
        allSchedules[draftKey] = nurses.map(n => ({ name:n.name, grade:n.grade||'RN', role:n.role||'acting', shifts:Array(daysInMonth).fill(''), locked:{} }));
      }
    } else {
      const ex = allSchedules[draftKey];
      allSchedules[draftKey] = nurses.map(n => ex.find(d => d.name === n.name) || { name:n.name, grade:n.grade||'RN', role:n.role||'acting', shifts:Array(daysInMonth).fill(''), locked:{} });
    }
    const draft = allSchedules[draftKey];
    body.innerHTML = draft.map((p,ni) => `<tr>
      <td style="font-weight:bold;font-size:12px;${p.role==='head'?'background:#FFF3E0;color:#E65100;':''}">[${p.grade||'RN'}] ${p.name||''} ${renderRoleBadge(p.role)}</td>
      ${p.shifts.map((s,di) => {
        const lk = !!(p.locked||{})[di];
        return `<td class="shift-${s}${lk?' cell-locked':''}"
          onclick="openGlobalDropdown(event,'${draftKey}',${ni},${di})"
          oncontextmenu="cycleDraft('${draftKey}',${ni},${di},event)"
          style="cursor:pointer;font-size:13px;font-weight:bold;${s?'':'color:#ddd'}"
          title="${lk?'🔒 수동 고정':'클릭: 근무 선택 / 우클릭: 초기화'}">${s||'·'}</td>`;
      }).join('')}
      ${statCellsHTML(p)}
    </tr>`).join('');
  }
}

function goCurrentMonth() { const t=new Date(); currentYear=t.getFullYear(); currentMonth=t.getMonth(); renderTable(); }

// ── 전역 드롭다운 ─────────────────────────────────────────
const SHIFT_ITEMS = [
  { group:'근무', items:[['MD','Midday'],['D','병동Day'],['E','Evening'],['N','Night'],['D1','상근Day'],['DH','상근Half']] },
  { group:'오프', items:[['O','Off'],['Off','Off(종일)']] },
  { group:'휴가', items:[['V','연차'],['v05','반차(4h)'],['v25','반반차(2h)'],['v75','반차+반반차'],['보상','보상휴가'],['보상05','보상반차'],['보상25','보상반반차'],['S','공가'],['vs','반차+공가0.5'],['vs05','반차.25+공가.25'],['교육','교육'],['교육05','교육반차'],['보건','생리휴가'],['보건05','생리반차'],['무휴','무급휴가'],['무휴05','무급반차'],['무휴25','무급반반차'],['무휴75','무급반차+반반차'],['OV','연장']] }
];

function buildDropdownHTML(fn) {
  let h = '';
  SHIFT_ITEMS.forEach(({group,items}) => {
    h += `<div style="padding:3px 0 5px;font-size:10px;font-weight:800;color:#aaa;text-align:center;border-top:1px solid #f2f4f6">${group}</div>`;
    items.forEach(([v,desc]) => {
      h += `<div onclick="event.stopPropagation();${fn(v)}" style="padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer;display:flex;justify-content:space-between;gap:12px" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background=''"><span>${v}</span><span style="color:#aaa;font-weight:400">${desc}</span></div>`;
    });
  });
  h += `<div style="border-top:1px solid #f2f4f6"><div onclick="event.stopPropagation();${fn('')}" style="padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer;color:#aaa" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background=''">- (비움)</div></div>`;
  return h;
}

function positionDropdown(el, r) {
  el.style.display = 'block'; el.style.top = '0'; el.style.left = '-9999px';
  const h = el.offsetHeight, sp = window.innerHeight - r.bottom;
  const top = sp > h+8 ? r.bottom+window.scrollY+4 : r.top+window.scrollY-h-4;
  let left = r.left + window.scrollX;
  if (left+160 > window.innerWidth) left = window.innerWidth-168;
  el.style.top = top+'px'; el.style.left = left+'px';
}

function openGlobalDropdown(e, dk, ni, di) {
  e.stopPropagation();
  const el = document.getElementById('globalDropdown');
  if (el._open && el._ni===ni && el._di===di) { closeAllDropdowns(); return; }
  el.innerHTML = buildDropdownHTML(v => `setDraft('${dk}',${ni},${di},'${v}');closeAllDropdowns()`);
  positionDropdown(el, e.currentTarget.getBoundingClientRect());
  el._open=true; el._ni=ni; el._di=di;
}
function toggleShiftDropdown(e, key, ni, di) {
  e.stopPropagation();
  const el = document.getElementById('globalDropdown');
  if (el._open && el._ni===ni && el._di===di) { closeAllDropdowns(); return; }
  el.innerHTML = buildDropdownHTML(v => `updateShiftCell('${key}',${ni},${di},'${v}');closeAllDropdowns()`);
  positionDropdown(el, e.currentTarget.getBoundingClientRect());
  el._open=true; el._ni=ni; el._di=di;
}
function closeAllDropdowns() {
  const el = document.getElementById('globalDropdown');
  if (el) { el.style.display='none'; el._open=false; }
  document.querySelectorAll('.dropdown-panel').forEach(p => p.style.display='none');
}

async function deleteShiftCell(key, ni, di) {
  if (!allSchedules[key][ni].locked) allSchedules[key][ni].locked={};
  allSchedules[key][ni].shifts[di]=''; delete allSchedules[key][ni].locked[di];
  renderTable();
  try { setStatus('loading','저장 중...'); const [y,m]=key.split('-').map(Number); await saveSchedule(y,m,allSchedules[key]); setStatus('ok','자동 저장됨'); }
  catch(e) { setStatus('err','저장 실패'); }
}

let _lockResolve = null;
function askLock(personName, shiftVal, day) {
  return new Promise(resolve => {
    _lockResolve = resolve;
    const d = new Date(currentYear, currentMonth, day+1);
    const wd = ['일','월','화','수','목','금','토'][d.getDay()];
    document.getElementById('lockMessage').textContent = `${personName} · ${currentMonth+1}/${day+1}(${wd}) → ${shiftVal||'비움'}`;
    document.getElementById('lockOverlay').classList.add('open');
  });
}
function resolveLock(doLock) { closeLockDialog(); if (_lockResolve) { _lockResolve(doLock); _lockResolve=null; } }
function closeLockDialog() { document.getElementById('lockOverlay').classList.remove('open'); }

async function updateShiftCell(key, ni, di, v) {
  if (!allSchedules[key][ni].locked) allSchedules[key][ni].locked={};
  allSchedules[key][ni].shifts[di]=v;
  const person=allSchedules[key][ni];
  const doLock = await askLock(person.name, v, di);
  if (doLock) person.locked[di]=v; else delete person.locked[di];
  renderTable();
  try { setStatus('loading','저장 중...'); const [y,m]=key.split('-').map(Number); await saveSchedule(y,m,allSchedules[key]); setStatus('ok','자동 저장됨'); }
  catch(e) { setStatus('err','저장 실패'); }
}

async function setDraft(dk, ni, di, v) {
  closeAllDropdowns();
  const dim = new Date(currentYear, currentMonth+1, 0).getDate();
  if (!allSchedules[dk]) allSchedules[dk]=nurses.map(n=>({name:n.name,grade:n.grade||'RN',role:n.role||'acting',shifts:Array(dim).fill(''),locked:{}}));
  const person=allSchedules[dk][ni];
  if (!person.locked) person.locked={};
  person.shifts[di]=v;
  const doLock=await askLock(person.name,v,di);
  if (doLock) person.locked[di]=v; else delete person.locked[di];
  renderTable();
  try { await saveDraft(currentYear,currentMonth,allSchedules[dk]); } catch(e) {}
}

async function cycleDraft(dk, ni, di, e) {
  if (e) e.preventDefault();
  const isRight = e && e.type==='contextmenu';
  const dim = new Date(currentYear, currentMonth+1, 0).getDate();
  if (!allSchedules[dk]) allSchedules[dk]=nurses.map(n=>({name:n.name,grade:n.grade||'RN',role:n.role||'acting',shifts:Array(dim).fill(''),locked:{}}));
  const person=allSchedules[dk][ni];
  if (!person.locked) person.locked={};
  const cur=person.shifts[di]||'';
  if (isRight) { person.shifts[di]=''; delete person.locked[di]; }
  else {
    const cycle={'':'O','O':'D','D':'MD','MD':'D1','D1':'DH','DH':'E','E':'N','N':'Off','Off':'V','V':'v05','v05':'v25','v25':'v75','v75':'보상','보상':'보상05','보상05':'보상25','보상25':'S','S':'vs','vs':'vs05','vs05':'교육','교육':'교육05','교육05':'보건','보건':'보건05','보건05':'무휴','무휴':'무휴05','무휴05':'무휴25','무휴25':'무휴75','무휴75':'OV','OV':''};
    const next=cycle.hasOwnProperty(cur)?cycle[cur]:'';
    person.shifts[di]=next; person.locked[di]=next;
  }
  renderTable();
  try { await saveDraft(currentYear,currentMonth,allSchedules[dk]); } catch(e) {}
}

function changeMonth(diff) {
  currentMonth+=diff;
  if (currentMonth>11){currentYear++;currentMonth=0;}
  if (currentMonth<0){currentYear--;currentMonth=11;}
  renderTable();
}

async function resetCurrentMonth() {
  showConfirmDialog('근무표 초기화',`${currentYear}년 ${currentMonth+1}월 근무표를 초기화할까요?`,'확정 생성된 근무표만 삭제됩니다.',async()=>{
    try { setStatus('loading','초기화 중...'); await deleteSchedule(currentYear,currentMonth); renderTable(); setStatus('ok','초기화 완료'); }
    catch(e) { setStatus('err','초기화 실패'); }
  });
}

async function resetCurrentMonthAll() {
  showConfirmDialog('전체 초기화',`${currentYear}년 ${currentMonth+1}월 모든 근무 입력을 삭제할까요?`,'확정 근무표, 임시저장, 수동 고정 모두 삭제됩니다.',async()=>{
    try {
      setStatus('loading','전체 초기화 중...');
      const key=`${currentYear}-${currentMonth}`, dk=key+'-draft';
      await deleteSchedule(currentYear,currentMonth);
      try { await deleteDraft(currentYear,currentMonth); } catch(e) {}
      delete allSchedules[key]; delete allSchedules[dk];
      renderTable(); setStatus('ok','전체 초기화 완료');
    } catch(e) { setStatus('err','전체 초기화 실패'); showAlertDialog('초기화 실패',e.message,'다시 시도해주세요.'); }
  });
}

function showConfirmDialog(title,message,sub,onConfirm) {
  document.getElementById('confirmTitle').textContent=title;
  document.getElementById('confirmMessage').textContent=message;
  document.getElementById('confirmSub').textContent=sub;
  document.getElementById('confirmOverlay').classList.add('open');
  document.getElementById('confirmOkBtn').onclick=async()=>{ closeConfirmDialog(); await onConfirm(); };
}
function closeConfirmDialog() { document.getElementById('confirmOverlay').classList.remove('open'); }
function showAlertDialog(title,message,sub) {
  document.getElementById('alertTitle').textContent=title;
  document.getElementById('alertMessage').textContent=message;
  document.getElementById('alertSub').textContent=sub||'';
  document.getElementById('alertOverlay').classList.add('open');
}
function closeAlertDialog() { document.getElementById('alertOverlay').classList.remove('open'); }

// ── 근무표 자동 생성 (원본 로직 유지) ───────────────────────
async function generateSchedule() {
  const btn = document.getElementById('genBtn');
  btn.disabled=true; btn.textContent='생성 중...';
  try {
    const total=new Date(currentYear,currentMonth+1,0).getDate();
    const key=`${currentYear}-${currentMonth}`, draftKey=key+'-draft';
    const holidays=getKoreanHolidays(currentYear,currentMonth);
    function isOffDay(day){const dow=new Date(currentYear,currentMonth,day).getDay();return dow===0||dow===6||holidays.has(day);}
    const confirmedData=allSchedules[key]||[], draftData=allSchedules[draftKey]||[];
    function getLockedVal(lm,idx){if(!lm)return undefined;const v=lm[idx];return v!==undefined?v:lm[String(idx)];}
    function getMergedLockedMap(name){const conf=confirmedData.find(d=>d&&d.name===name),draft=draftData.find(d=>d&&d.name===name);return{...(draft?.locked||{}),...(conf?.locked||{})};}
    let schedule=nurses.map(n=>{const lm=getMergedLockedMap(n.name);let sh=Array(total).fill(null),lk={};for(let i=0;i<total;i++){const v=getLockedVal(lm,i);if(v!==undefined&&v!==''){sh[i]=v;lk[i]=v;}}return{name:n.name,role:n.role,grade:n.grade||'RN',shifts:sh,locked:lk};});
    function isFree(p,d){return p.shifts[d]===null;}
    function isLocked(p,d){return p.locked&&p.locked[d]!==undefined;}
    function countShift(d,t){return schedule.filter(p=>p.shifts[d]===t).length;}
    function offCount(p){return p.shifts.filter(s=>s==='O'||s==='Off').length;}
    function targetE(d){return isOffDay(d+1)?1:2;}
    const head=schedule.find(p=>p.role==='head');
    if(head){for(let d=0;d<total;d++){if(isFree(head,d))head.shifts[d]=isOffDay(d+1)?'O':'D';}}
    for(const p of schedule){if(p.grade==='AN'){for(let d=0;d<total;d++){if(isFree(p,d))p.shifts[d]=isOffDay(d+1)?'O':'MD';}}}
    const workers=schedule.filter(p=>p.role!=='head'&&p.grade!=='AN');
    if(workers.length===0)throw new Error('가용 인력(RN)이 부족합니다.');
    const actings=workers.filter(p=>p.role==='acting'),charges=workers.filter(p=>p.role==='charge');
    const targetOff=Object.fromEntries(workers.map(p=>[p.name,11+Math.floor(Math.random()*3)]));
    function canPlace(p,d,t){if(isLocked(p,d))return false;const c=p.shifts[d];if(c!==null&&c!=='O')return false;if(t==='D'&&isOffDay(d+1)&&countShift(d,'D')>=1)return false;if(t==='D'&&!isOffDay(d+1)&&countShift(d,'D')>=3)return false;if(d>0&&p.shifts[d-1]==='N')return false;if(d>1&&p.shifts[d-2]==='N')return false;if(t==='D'&&d>0&&p.shifts[d-1]==='E')return false;if(t==='D'&&d>1&&p.shifts[d-2]==='E'&&(p.shifts[d-1]==='O'||p.shifts[d-1]==='Off'))return false;return true;}
    function hasEOP(p,d){return d>1&&p.shifts[d-2]==='E'&&(p.shifts[d-1]==='O'||p.shifts[d-1]==='Off');}
    function canPlaceP(p,d,t){return canPlace(p,d,t);}
    function pickP(cands,d,t,sf){const pr=cands.filter(p=>canPlaceP(p,d,t)).sort(sf);if(pr.length>0)return pr[0];return cands.filter(p=>canPlace(p,d,t)).sort(sf)[0];}
    function isWork(s){return['D','E','N','MD','D1','DH'].includes(s);}
    function runBounds(p,d){let s=d,e=d;while(s>0&&isWork(p.shifts[s-1]))s--;while(e<total-1&&isWork(p.shifts[e+1]))e++;return{start:s,end:e,len:e-s+1};}
    function canTWO(p,d){if(isLocked(p,d))return false;const s=p.shifts[d];if(!['D','E'].includes(s))return false;if(s==='E'){if(countShift(d,'E')<=targetE(d))return false;if(d+1<total&&p.shifts[d+1]==='D')return false;return true;}if(d>1&&p.shifts[d-2]==='E'&&(p.shifts[d-1]==='O'||p.shifts[d-1]==='Off'))return false;if(d>0&&p.shifts[d-1]==='E'&&d+1<total&&p.shifts[d+1]==='D')return false;if(isOffDay(d+1))return countShift(d,'D')>1;if(p.role==='charge'&&workers.filter(w=>w.shifts[d]==='D'&&w.role==='charge').length<=1)return false;if(p.role==='acting'&&workers.filter(w=>w.shifts[d]==='D'&&w.role==='acting').length<=1)return false;return true;}
    function canOE(p,d){if(isLocked(p,d))return false;if(!['O','Off',null,''].includes(p.shifts[d]))return false;if(countShift(d,'E')>=targetE(d))return false;if(d>0&&p.shifts[d-1]==='N')return false;if(d>1&&p.shifts[d-2]==='N')return false;if(d<total-1&&p.shifts[d+1]==='D')return false;return true;}
    function canTE(p,d){if(d<0||d>=total||isLocked(p,d))return false;const c=p.shifts[d];if(!['O','Off',null,'','D'].includes(c))return false;if((c==='O'||c==='Off'||c===null||c==='')&&offCount(p)<=11)return false;if(c==='D'&&!canTWO(p,d))return false;if(d>0&&p.shifts[d-1]==='N')return false;if(d>1&&p.shifts[d-2]==='N')return false;if(d<total-1&&p.shifts[d+1]==='D')return false;return true;}
    function canTSD(r,donor,d){if(r===donor||isLocked(r,d)||isLocked(donor,d))return false;if(!['O','Off',null,''].includes(r.shifts[d]))return false;const s=donor.shifts[d];if(!['D','E'].includes(s))return false;if(d>0&&r.shifts[d-1]==='N')return false;if(d>1&&r.shifts[d-2]==='N')return false;if(s==='D'){if(d>0&&r.shifts[d-1]==='E')return false;if(d>1&&r.shifts[d-2]==='E'&&(r.shifts[d-1]==='O'||r.shifts[d-1]==='Off'))return false;if(!isOffDay(d+1)&&donor.role!==r.role)return false;}if(s==='E'&&d<total-1&&r.shifts[d+1]==='D')return false;return true;}
    function balance(){for(let pass=0;pass<20;pass++){let ch=false;for(const p of workers){while(offCount(p)<11){const d=[...Array(total).keys()].find(day=>canTWO(p,day));if(d===undefined)break;p.shifts[d]='O';ch=true;}}for(const p of workers){while(offCount(p)>13){let mv=false;for(const d of[...Array(total).keys()]){if(offCount(p)<=13)break;if(!['O','Off',null,''].includes(p.shifts[d]))continue;const donor=workers.filter(q=>offCount(q)<13&&canTSD(p,q,d)).sort((a,b)=>offCount(a)-offCount(b))[0];if(donor){p.shifts[d]=donor.shifts[d];donor.shifts[d]='O';mv=true;ch=true;continue;}if(canOE(p,d)){p.shifts[d]='E';mv=true;ch=true;continue;}if(canPlaceP(p,d,'D')){p.shifts[d]='D';mv=true;ch=true;}}if(!mv)break;}}if(!ch)break;}}
    const nPool=[...actings.sort(()=>Math.random()-0.5),...charges.sort(()=>Math.random()-0.5)];
    let nIdx=0;
    for(let d=0;d<total;){if(countShift(d,'N')>=1){d++;continue;}let placed=false;for(let a=0;a<nPool.length;a++){const p=nPool[(nIdx+a)%nPool.length];let ok=true;for(let k=0;k<3&&d+k<total;k++){if(!isFree(p,d+k)){ok=false;break;}}if(!ok)continue;for(let k=0;k<3&&d+k<total;k++)p.shifts[d+k]='N';for(let o=3;o<=4&&d+o<total;o++){if(isFree(p,d+o))p.shifts[d+o]='O';}nIdx=(nIdx+a+1)%nPool.length;placed=true;break;}if(!placed){const fb=nPool.find(p=>isFree(p,d));if(fb)fb.shifts[d]='N';}d++;}
    const eC=Object.fromEntries(workers.map(p=>[p.name,0]));
    for(let d=0;d<total;d++){const od=isOffDay(d+1),tg=od?1:2;workers.filter(p=>p.shifts[d]==='E').forEach(p=>eC[p.name]++);let need=tg-workers.filter(p=>p.shifts[d]==='E').length;if(need<=0)continue;if(!od){const hc=workers.some(p=>p.shifts[d]==='E'&&p.role==='charge');if(!hc&&need>0){const c=charges.filter(p=>canPlace(p,d,'E')&&p.shifts[d]!=='E').sort((a,b)=>eC[a.name]-eC[b.name])[0];if(c){c.shifts[d]='E';eC[c.name]++;need--;}}const ha=workers.some(p=>p.shifts[d]==='E'&&p.role==='acting');if(!ha&&need>0){const a=actings.filter(p=>canPlace(p,d,'E')&&p.shifts[d]!=='E').sort((a,b)=>eC[a.name]-eC[b.name])[0];if(a){a.shifts[d]='E';eC[a.name]++;need--;}}if(need>0){const ex=workers.filter(p=>canPlace(p,d,'E')&&p.shifts[d]!=='E').sort((a,b)=>eC[a.name]-eC[b.name]);for(const p of ex){if(need<=0)break;p.shifts[d]='E';eC[p.name]++;need--;}}}else{const c=workers.filter(p=>canPlace(p,d,'E')&&p.shifts[d]!=='E').sort((a,b)=>eC[a.name]-eC[b.name])[0];if(c){c.shifts[d]='E';eC[c.name]++;}}}
    const dC=Object.fromEntries(workers.map(p=>[p.name,0]));
    function assignD(p){let d=0;while(d<total){while(d<total&&!isFree(p,d))d++;if(d>=total)break;if(d>0&&p.shifts[d-1]==='E'){d++;continue;}if(hasEOP(p,d)){d++;continue;}const bl=3+Math.floor(Math.random()*3);let pl=0;for(let k=0;k<bl&&d+k<total;k++){if(!isFree(p,d+k))break;if(d+k>0&&p.shifts[d+k-1]==='E')break;if(hasEOP(p,d+k))break;if(countShift(d+k,'D')>=3)break;p.shifts[d+k]='D';dC[p.name]++;pl++;}if(pl===0){d++;continue;}d+=pl;const ol=offCount(p)<targetOff[p.name]?1+Math.floor(Math.random()*2):0;let op=0;for(let o=0;o<ol&&d+o<total;o++){if(offCount(p)>=targetOff[p.name])break;if(!isFree(p,d+o))break;p.shifts[d+o]='O';op++;}d+=op;}}
    for(const p of[...workers].sort(()=>Math.random()-0.5))assignD(p);
    for(let d=0;d<total;d++){const od=isOffDay(d+1);if(!od){if(!workers.some(p=>p.shifts[d]==='D'&&p.role==='charge')){const c=pickP(charges.filter(p=>canPlace(p,d,'D')),d,'D',(a,b)=>dC[a.name]-dC[b.name]);if(c){c.shifts[d]='D';dC[c.name]++;}}if(!workers.some(p=>p.shifts[d]==='D'&&p.role==='acting')){const a=pickP(actings.filter(p=>canPlace(p,d,'D')),d,'D',(a,b)=>dC[a.name]-dC[b.name]);if(a){a.shifts[d]='D';dC[a.name]++;}else{const c2=pickP(charges.filter(p=>canPlace(p,d,'D')),d,'D',(a,b)=>dC[a.name]-dC[b.name]);if(c2){c2.shifts[d]='D';dC[c2.name]++;}}}}else{if(countShift(d,'D')<1){const p=pickP(workers.filter(w=>canPlace(w,d,'D')),d,'D',(a,b)=>dC[a.name]-dC[b.name]);if(p){p.shifts[d]='D';dC[p.name]++;}}if(countShift(d,'E')<1){const p=workers.filter(w=>canPlace(w,d,'E')).sort((a,b)=>eC[a.name]-eC[b.name])[0];if(p){p.shifts[d]='E';eC[p.name]++;}}}}
    for(const p of workers){for(let d=0;d<total;d++){if(!isFree(p,d))continue;if(offCount(p)<targetOff[p.name])p.shifts[d]='O';else if(canPlaceP(p,d,'D'))p.shifts[d]='D';else p.shifts[d]='O';}}
    for(let d=0;d<total;d++){while(countShift(d,'N')>1){const ex=workers.find(p=>p.shifts[d]==='N'&&!isLocked(p,d));if(!ex)break;ex.shifts[d]='O';}while(countShift(d,'E')>targetE(d)){const ex=workers.find(p=>p.shifts[d]==='E'&&!isLocked(p,d));if(!ex)break;ex.shifts[d]='O';if(d+1<total&&ex.shifts[d+1]==='D'&&!isLocked(ex,d+1))ex.shifts[d+1]='O';}const mx=isOffDay(d+1)?1:3;while(countShift(d,'D')>mx){const ex=workers.find(p=>p.shifts[d]==='D'&&canTWO(p,d));if(!ex)break;ex.shifts[d]='O';}}
    for(let d=0;d<total;d++){while(countShift(d,'D')>3){const ex=workers.find(p=>p.shifts[d]==='D'&&canTWO(p,d));if(!ex)break;ex.shifts[d]='O';}}
    for(const p of workers){let run=0;for(let d=0;d<total;d++){if(p.shifts[d]==='O'){if((d>0&&p.shifts[d-1]==='N')||(d>1&&p.shifts[d-2]==='N')){run=0;continue;}run++;if(run>4&&!isLocked(p,d)){const eb=d>0&&p.shifts[d-1]==='E';if(!eb&&canPlaceP(p,d,'D')){p.shifts[d]='D';run=0;}}}else run=0;}}
    balance();
    function tryExtE(p,d){if(p.shifts[d]!=='E'||runBounds(p,d).len!==1)return false;const tg=[d-1,d+1].filter(x=>x>=0&&x<total);for(const day of tg){if(!canTE(p,day))continue;const donor=workers.filter(q=>{if(q===p||q.shifts[day]!=='E'||isLocked(q,day))return false;if(day+1<total&&q.shifts[day+1]==='D')return false;return true;}).sort((a,b)=>runBounds(b,day).len-runBounds(a,day).len)[0];if(!donor)continue;p.shifts[day]='E';donor.shifts[day]='O';return true;}return false;}
    function tryExtW(p,d){if(!isWork(p.shifts[d]))return false;if(runBounds(p,d).len!==1)return false;if(offCount(p)<=11)return false;if(d>0&&canPlaceP(p,d-1,'D')){p.shifts[d-1]='D';return true;}if(p.shifts[d]!=='E'&&d<total-1&&canPlaceP(p,d+1,'D')){p.shifts[d+1]='D';return true;}return false;}
    for(let pass=0;pass<3;pass++){let ch=false;for(const p of workers){for(let d=0;d<total;d++){if(!isWork(p.shifts[d]))continue;const run=runBounds(p,d);if(run.start!==d)continue;if(run.len===1){if(p.shifts[d]==='E'&&tryExtE(p,d))ch=true;else if(tryExtW(p,d))ch=true;}else if(run.len>5){if(offCount(p)>=13)continue;const cuts=[];for(let day=run.start+5;day<=run.end;day+=5)cuts.push(day);for(const day of cuts){if(canTWO(p,day)){p.shifts[day]='O';ch=true;}}}}}if(!ch)break;}
    balance();
    for(const p of workers){for(let d=2;d<total;d++){if(p.shifts[d]==='D'&&(p.shifts[d-1]==='O'||p.shifts[d-1]==='Off')&&p.shifts[d-2]==='E'&&!isLocked(p,d))p.shifts[d]='O';}}
    allSchedules[key]=schedule;
    await saveSchedule(currentYear,currentMonth,schedule);
    renderTable();
    setStatus('ok',`${getCurrentWard().name} 근무표 생성 완료`);
  } catch(e) {
    console.error(e);
    showAlertDialog('오류 발생',e.message,'다시 시도해주세요.');
    setStatus('err','생성 실패');
  } finally { btn.disabled=false; btn.textContent='근무표 생성'; }
}

function getKoreanHolidays(year,month){const fixed=[[0,1],[2,1],[3,5],[5,6],[8,9],[9,3],[9,9],[11,25]];const s=new Set();for(const[m,d]of fixed){if(m===month)s.add(d);}return s;}

function exportToExcel() {
  const key=`${currentYear}-${currentMonth}`, saved=allSchedules[key];
  if(!saved){showAlertDialog('먼저 근무표를 생성해주세요!','상단의 근무표 생성 버튼을 눌러 근무표를 먼저 만들어주세요.','');return;}
  const dim=new Date(currentYear,currentMonth+1,0).getDate(), wd=['일','월','화','수','목','금','토'];
  const header=['이름'];
  for(let d=1;d<=dim;d++){const dow=new Date(currentYear,currentMonth,d).getDay();header.push(`${d}(${wd[dow]})`);}
  header.push('D','E','N','Off','연차사용','연차잔여');
  const rows=[header];
  saved.forEach(p=>{const row=[`[${p.grade||'RN'}] ${p.name||''}`];p.shifts.forEach(s=>row.push(s||''));
    const st=computeStats(p);row.push(st.D,st.E,st.N,st.Off,st.leaveUsed,st.leaveRemain);rows.push(row);});
  const ws=XLSX.utils.aoa_to_sheet(rows),wb=XLSX.utils.book_new();
  const ward=getCurrentWard();
  XLSX.utils.book_append_sheet(wb,ws,`${currentYear}-${currentMonth+1}`);
  XLSX.writeFile(wb,`${ward.name}_근무표_${currentYear}_${currentMonth+1}.xlsx`);
}

window.addEventListener('click',function(e){
  closeAllDropdowns();
  if(!e.target.closest('.dropdown-wrap'))document.querySelectorAll('[id^="grade-drop-"],[id^="role-drop-"]').forEach(el=>el.style.display='none');
  if(e.target===document.getElementById('nurseModal'))toggleModal(false);
});
window.addEventListener('keydown',function(e){
  if(e.key==='Escape'){toggleModal(false);closeAllDropdowns();}
  if(e.key==='Enter'){
    // 고정 확인 모달이 열려있을 때 엔터 → 고정
    if(document.getElementById('lockOverlay').classList.contains('open')){
      e.preventDefault(); resolveLock(true);
    }
  }
});

(async function init(){
  renderWardSelectModal();
  if(WARD_ID && WARD_CONFIG.find(w=>w.id===WARD_ID)){
    document.getElementById('wardSelectOverlay').classList.remove('open');
    updateWardBanner();
    try{
      setStatus('loading','연결 중...');
      await loadNurses();
      if(nurses.length===0){nurses=[
        {id:1,name:'수선생님',role:'head',grade:'RN',offDays:[],annualLeaveTotal:15},
        {id:2,name:'간호사A',role:'charge',grade:'RN',offDays:[],annualLeaveTotal:15},
        {id:3,name:'간호사B',role:'acting',grade:'RN',offDays:[],annualLeaveTotal:15},
        {id:4,name:'간호사C',role:'acting',grade:'RN',offDays:[],annualLeaveTotal:15},
        {id:5,name:'간호사D',role:'acting',grade:'AN',offDays:[],annualLeaveTotal:15}
      ];}
      setStatus('ok',`${getCurrentWard().name} · Firebase 연결됨`);
    }catch(e){
      setStatus('err','DB 연결 실패', e);
      nurses=[{id:1,name:'수선생님',role:'head',grade:'RN',offDays:[],annualLeaveTotal:15},{id:2,name:'간호사A',role:'charge',grade:'RN',offDays:[],annualLeaveTotal:15},{id:3,name:'간호사B',role:'acting',grade:'RN',offDays:[],annualLeaveTotal:15},{id:4,name:'간호사C',role:'acting',grade:'RN',offDays:[],annualLeaveTotal:15},{id:5,name:'간호사D',role:'acting',grade:'AN',offDays:[],annualLeaveTotal:15}];
    }
    renderTable();
  }else{
    setStatus('loading','병동을 선택해주세요');
  }
})();

(function(){
  document.addEventListener('mouseover',function(e){
    const td=e.target.closest('#schedTable td, #schedTable th');
    if(!td){clearCH();return;}
    const table=document.getElementById('schedTable');if(!table)return;
    const row=td.closest('tr'),ci=Array.from(row.cells).indexOf(td);
    table.querySelectorAll('tbody tr').forEach(r=>r.classList.remove('row-hover'));
    const tr=td.closest('tbody tr');if(tr)tr.classList.add('row-hover');
    table.querySelectorAll('th.col-hover,td.col-hover').forEach(el=>el.classList.remove('col-hover'));
    if(ci>=0)table.querySelectorAll('tr').forEach(r=>{const c=r.cells[ci];if(c)c.classList.add('col-hover');});
  });
  document.addEventListener('mouseout',function(e){if(!e.relatedTarget||!e.relatedTarget.closest('#schedTable'))clearCH();});
  function clearCH(){const t=document.getElementById('schedTable');if(!t)return;t.querySelectorAll('tbody tr').forEach(r=>r.classList.remove('row-hover'));t.querySelectorAll('.col-hover').forEach(el=>el.classList.remove('col-hover'));}
})();
