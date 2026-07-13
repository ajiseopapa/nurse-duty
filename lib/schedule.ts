import type { Nurse, Person } from './types';

// ── 근무 코드 목록 (셀 드롭다운) ────────────────────────────
export const SHIFT_ITEMS: { group: string; items: [string, string][] }[] = [
  {
    group: '근무',
    items: [['MD', 'Midday'], ['D', '병동Day'], ['E', 'Evening'], ['N', 'Night'], ['D1', '상근Day'], ['DH', '상근Half']],
  },
  { group: '오프', items: [['O', 'Off'], ['Off', 'Off(종일)']] },
  {
    group: '휴가',
    items: [
      ['V', '연차'], ['v05', '반차(4h)'], ['v25', '반반차(2h)'], ['v75', '반차+반반차'],
      ['보상', '보상휴가'], ['보상05', '보상반차'], ['보상25', '보상반반차'],
      ['S', '공가'], ['vs', '반차+공가0.5'], ['vs05', '반차.25+공가.25'],
      ['교육', '교육'], ['교육05', '교육반차'], ['보건', '생리휴가'], ['보건05', '생리반차'],
      ['무휴', '무급휴가'], ['무휴05', '무급반차'], ['무휴25', '무급반반차'], ['무휴75', '무급반차+반반차'],
      ['OV', '연장'],
    ],
  },
];

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function getKoreanHolidays(year: number, month: number): Set<number> {
  const fixed: [number, number][] = [[0, 1], [2, 1], [3, 5], [5, 6], [8, 9], [9, 3], [9, 9], [11, 25]];
  const s = new Set<number>();
  for (const [m, d] of fixed) { if (m === month) s.add(d); }
  return s;
}

export function blankPerson(n: Nurse, dim: number, fill: string): Person {
  return { name: n.name, grade: n.grade || 'RN', role: n.role || 'acting', shifts: Array(dim).fill(fill), locked: {} };
}

// ── 근무별 개인 통계 (해당 월 기준) ─────────────────────────
export const LEAVE_WEIGHTS: Record<string, number> = { V: 1, v05: 0.5, v25: 0.25, v75: 0.75 };

export interface PersonStats {
  D: number;
  E: number;
  N: number;
  Off: number;
  leaveUsed: number;
  leaveTotal: number;
  leaveRemain: number;
}

export function computeStats(p: Person, nurses: Nurse[]): PersonStats {
  const counts = { D: 0, E: 0, N: 0, Off: 0 };
  let leaveUsed = 0;
  (p.shifts || []).forEach((s) => {
    if (!s) return;
    if (s === 'D' || s === 'D1' || s === 'DH' || s === 'MD') counts.D++;
    else if (s === 'E') counts.E++;
    else if (s === 'N') counts.N++;
    else if (s === 'O' || s === 'Off') counts.Off++;
    if (LEAVE_WEIGHTS[s] !== undefined) leaveUsed += LEAVE_WEIGHTS[s];
  });
  const nv = nurses.find((n) => n.name === p.name);
  const leaveTotal = nv && nv.annualLeaveTotal != null ? nv.annualLeaveTotal : 15;
  leaveUsed = +leaveUsed.toFixed(2);
  const leaveRemain = +(leaveTotal - leaveUsed).toFixed(2);
  return { ...counts, leaveUsed, leaveTotal, leaveRemain };
}

// ── 근무표 자동 생성 (원본 로직 유지) ───────────────────────
export function buildSchedule(
  year: number,
  month: number,
  nurses: Nurse[],
  confirmedData: Person[],
  draftData: Person[],
): Person[] {
  const total = daysInMonth(year, month);
  const holidays = getKoreanHolidays(year, month);
  function isOffDay(day: number) {
    const dow = new Date(year, month, day).getDay();
    return dow === 0 || dow === 6 || holidays.has(day);
  }
  function getLockedVal(lm: Record<string, string> | undefined, idx: number) {
    if (!lm) return undefined;
    const v = lm[idx];
    return v !== undefined ? v : lm[String(idx)];
  }
  function getMergedLockedMap(name: string) {
    const conf = confirmedData.find((d) => d && d.name === name);
    const draft = draftData.find((d) => d && d.name === name);
    return { ...(draft?.locked || {}), ...(conf?.locked || {}) };
  }
  const schedule: Person[] = nurses.map((n) => {
    const lm = getMergedLockedMap(n.name);
    const sh: (string | null)[] = Array(total).fill(null);
    const lk: Record<string, string> = {};
    for (let i = 0; i < total; i++) {
      const v = getLockedVal(lm, i);
      if (v !== undefined && v !== '') { sh[i] = v; lk[i] = v; }
    }
    return { name: n.name, role: n.role, grade: n.grade || 'RN', shifts: sh, locked: lk };
  });

  function isFree(p: Person, d: number) { return p.shifts[d] === null; }
  function isLocked(p: Person, d: number) { return p.locked && p.locked[d] !== undefined; }
  function countShift(d: number, t: string) { return schedule.filter((p) => p.shifts[d] === t).length; }
  function offCount(p: Person) { return p.shifts.filter((s) => s === 'O' || s === 'Off').length; }
  function targetE(d: number) { return isOffDay(d + 1) ? 1 : 2; }

  const head = schedule.find((p) => p.role === 'head');
  if (head) {
    for (let d = 0; d < total; d++) { if (isFree(head, d)) head.shifts[d] = isOffDay(d + 1) ? 'O' : 'D'; }
  }
  for (const p of schedule) {
    if (p.grade === 'AN') {
      for (let d = 0; d < total; d++) { if (isFree(p, d)) p.shifts[d] = isOffDay(d + 1) ? 'O' : 'MD'; }
    }
  }
  const workers = schedule.filter((p) => p.role !== 'head' && p.grade !== 'AN');
  if (workers.length === 0) throw new Error('가용 인력(RN)이 부족합니다.');
  const actings = workers.filter((p) => p.role === 'acting');
  const charges = workers.filter((p) => p.role === 'charge');
  const targetOff: Record<string, number> = Object.fromEntries(
    workers.map((p) => [p.name, 11 + Math.floor(Math.random() * 3)]),
  );

  function canPlace(p: Person, d: number, t: string) {
    if (isLocked(p, d)) return false;
    const c = p.shifts[d];
    if (c !== null && c !== 'O') return false;
    if (t === 'D' && isOffDay(d + 1) && countShift(d, 'D') >= 1) return false;
    if (t === 'D' && !isOffDay(d + 1) && countShift(d, 'D') >= 3) return false;
    if (d > 0 && p.shifts[d - 1] === 'N') return false;
    if (d > 1 && p.shifts[d - 2] === 'N') return false;
    if (t === 'D' && d > 0 && p.shifts[d - 1] === 'E') return false;
    if (t === 'D' && d > 1 && p.shifts[d - 2] === 'E' && (p.shifts[d - 1] === 'O' || p.shifts[d - 1] === 'Off')) return false;
    return true;
  }
  function hasEOP(p: Person, d: number) {
    return d > 1 && p.shifts[d - 2] === 'E' && (p.shifts[d - 1] === 'O' || p.shifts[d - 1] === 'Off');
  }
  function canPlaceP(p: Person, d: number, t: string) { return canPlace(p, d, t); }
  function pickP(cands: Person[], d: number, t: string, sf: (a: Person, b: Person) => number) {
    const pr = cands.filter((p) => canPlaceP(p, d, t)).sort(sf);
    if (pr.length > 0) return pr[0];
    return cands.filter((p) => canPlace(p, d, t)).sort(sf)[0];
  }
  function isWork(s: string | null) { return ['D', 'E', 'N', 'MD', 'D1', 'DH'].includes(s as string); }
  function runBounds(p: Person, d: number) {
    let s = d, e = d;
    while (s > 0 && isWork(p.shifts[s - 1])) s--;
    while (e < total - 1 && isWork(p.shifts[e + 1])) e++;
    return { start: s, end: e, len: e - s + 1 };
  }
  function canTWO(p: Person, d: number) {
    if (isLocked(p, d)) return false;
    const s = p.shifts[d];
    if (!['D', 'E'].includes(s as string)) return false;
    if (s === 'E') {
      if (countShift(d, 'E') <= targetE(d)) return false;
      if (d + 1 < total && p.shifts[d + 1] === 'D') return false;
      return true;
    }
    if (d > 1 && p.shifts[d - 2] === 'E' && (p.shifts[d - 1] === 'O' || p.shifts[d - 1] === 'Off')) return false;
    if (d > 0 && p.shifts[d - 1] === 'E' && d + 1 < total && p.shifts[d + 1] === 'D') return false;
    if (isOffDay(d + 1)) return countShift(d, 'D') > 1;
    if (p.role === 'charge' && workers.filter((w) => w.shifts[d] === 'D' && w.role === 'charge').length <= 1) return false;
    if (p.role === 'acting' && workers.filter((w) => w.shifts[d] === 'D' && w.role === 'acting').length <= 1) return false;
    return true;
  }
  function canOE(p: Person, d: number) {
    if (isLocked(p, d)) return false;
    if (!['O', 'Off', null, ''].includes(p.shifts[d] as string | null)) return false;
    if (countShift(d, 'E') >= targetE(d)) return false;
    if (d > 0 && p.shifts[d - 1] === 'N') return false;
    if (d > 1 && p.shifts[d - 2] === 'N') return false;
    if (d < total - 1 && p.shifts[d + 1] === 'D') return false;
    return true;
  }
  function canTE(p: Person, d: number) {
    if (d < 0 || d >= total || isLocked(p, d)) return false;
    const c = p.shifts[d];
    if (!['O', 'Off', null, '', 'D'].includes(c as string | null)) return false;
    if ((c === 'O' || c === 'Off' || c === null || c === '') && offCount(p) <= 11) return false;
    if (c === 'D' && !canTWO(p, d)) return false;
    if (d > 0 && p.shifts[d - 1] === 'N') return false;
    if (d > 1 && p.shifts[d - 2] === 'N') return false;
    if (d < total - 1 && p.shifts[d + 1] === 'D') return false;
    return true;
  }
  function canTSD(r: Person, donor: Person, d: number) {
    if (r === donor || isLocked(r, d) || isLocked(donor, d)) return false;
    if (!['O', 'Off', null, ''].includes(r.shifts[d] as string | null)) return false;
    const s = donor.shifts[d];
    if (!['D', 'E'].includes(s as string)) return false;
    if (d > 0 && r.shifts[d - 1] === 'N') return false;
    if (d > 1 && r.shifts[d - 2] === 'N') return false;
    if (s === 'D') {
      if (d > 0 && r.shifts[d - 1] === 'E') return false;
      if (d > 1 && r.shifts[d - 2] === 'E' && (r.shifts[d - 1] === 'O' || r.shifts[d - 1] === 'Off')) return false;
      if (!isOffDay(d + 1) && donor.role !== r.role) return false;
    }
    if (s === 'E' && d < total - 1 && r.shifts[d + 1] === 'D') return false;
    return true;
  }
  function balance() {
    for (let pass = 0; pass < 20; pass++) {
      let ch = false;
      for (const p of workers) {
        while (offCount(p) < 11) {
          const d = [...Array(total).keys()].find((day) => canTWO(p, day));
          if (d === undefined) break;
          p.shifts[d] = 'O';
          ch = true;
        }
      }
      for (const p of workers) {
        while (offCount(p) > 13) {
          let mv = false;
          for (const d of [...Array(total).keys()]) {
            if (offCount(p) <= 13) break;
            if (!['O', 'Off', null, ''].includes(p.shifts[d] as string | null)) continue;
            const donor = workers
              .filter((q) => offCount(q) < 13 && canTSD(p, q, d))
              .sort((a, b) => offCount(a) - offCount(b))[0];
            if (donor) { p.shifts[d] = donor.shifts[d]; donor.shifts[d] = 'O'; mv = true; ch = true; continue; }
            if (canOE(p, d)) { p.shifts[d] = 'E'; mv = true; ch = true; continue; }
            if (canPlaceP(p, d, 'D')) { p.shifts[d] = 'D'; mv = true; ch = true; }
          }
          if (!mv) break;
        }
      }
      if (!ch) break;
    }
  }

  // 야간(N) 3연속 배치 + 이후 2일 휴무
  const nPool = [...actings.sort(() => Math.random() - 0.5), ...charges.sort(() => Math.random() - 0.5)];
  let nIdx = 0;
  for (let d = 0; d < total;) {
    if (countShift(d, 'N') >= 1) { d++; continue; }
    let placed = false;
    for (let a = 0; a < nPool.length; a++) {
      const p = nPool[(nIdx + a) % nPool.length];
      let ok = true;
      for (let k = 0; k < 3 && d + k < total; k++) { if (!isFree(p, d + k)) { ok = false; break; } }
      if (!ok) continue;
      for (let k = 0; k < 3 && d + k < total; k++) p.shifts[d + k] = 'N';
      for (let o = 3; o <= 4 && d + o < total; o++) { if (isFree(p, d + o)) p.shifts[d + o] = 'O'; }
      nIdx = (nIdx + a + 1) % nPool.length;
      placed = true;
      break;
    }
    if (!placed) { const fb = nPool.find((p) => isFree(p, d)); if (fb) fb.shifts[d] = 'N'; }
    d++;
  }

  // 저녁(E) 배치 — 평일 2명(charge/acting 각 1 우선), 휴일 1명
  const eC: Record<string, number> = Object.fromEntries(workers.map((p) => [p.name, 0]));
  for (let d = 0; d < total; d++) {
    const od = isOffDay(d + 1), tg = od ? 1 : 2;
    workers.filter((p) => p.shifts[d] === 'E').forEach((p) => eC[p.name]++);
    let need = tg - workers.filter((p) => p.shifts[d] === 'E').length;
    if (need <= 0) continue;
    if (!od) {
      const hc = workers.some((p) => p.shifts[d] === 'E' && p.role === 'charge');
      if (!hc && need > 0) {
        const c = charges.filter((p) => canPlace(p, d, 'E') && p.shifts[d] !== 'E').sort((a, b) => eC[a.name] - eC[b.name])[0];
        if (c) { c.shifts[d] = 'E'; eC[c.name]++; need--; }
      }
      const ha = workers.some((p) => p.shifts[d] === 'E' && p.role === 'acting');
      if (!ha && need > 0) {
        const a = actings.filter((p) => canPlace(p, d, 'E') && p.shifts[d] !== 'E').sort((a, b) => eC[a.name] - eC[b.name])[0];
        if (a) { a.shifts[d] = 'E'; eC[a.name]++; need--; }
      }
      if (need > 0) {
        const ex = workers.filter((p) => canPlace(p, d, 'E') && p.shifts[d] !== 'E').sort((a, b) => eC[a.name] - eC[b.name]);
        for (const p of ex) { if (need <= 0) break; p.shifts[d] = 'E'; eC[p.name]++; need--; }
      }
    } else {
      const c = workers.filter((p) => canPlace(p, d, 'E') && p.shifts[d] !== 'E').sort((a, b) => eC[a.name] - eC[b.name])[0];
      if (c) { c.shifts[d] = 'E'; eC[c.name]++; }
    }
  }

  // 주간(D) 블록 배치
  const dC: Record<string, number> = Object.fromEntries(workers.map((p) => [p.name, 0]));
  function assignD(p: Person) {
    let d = 0;
    while (d < total) {
      while (d < total && !isFree(p, d)) d++;
      if (d >= total) break;
      if (d > 0 && p.shifts[d - 1] === 'E') { d++; continue; }
      if (hasEOP(p, d)) { d++; continue; }
      const bl = 3 + Math.floor(Math.random() * 3);
      let pl = 0;
      for (let k = 0; k < bl && d + k < total; k++) {
        if (!isFree(p, d + k)) break;
        if (d + k > 0 && p.shifts[d + k - 1] === 'E') break;
        if (hasEOP(p, d + k)) break;
        if (countShift(d + k, 'D') >= 3) break;
        p.shifts[d + k] = 'D';
        dC[p.name]++;
        pl++;
      }
      if (pl === 0) { d++; continue; }
      d += pl;
      const ol = offCount(p) < targetOff[p.name] ? 1 + Math.floor(Math.random() * 2) : 0;
      let op = 0;
      for (let o = 0; o < ol && d + o < total; o++) {
        if (offCount(p) >= targetOff[p.name]) break;
        if (!isFree(p, d + o)) break;
        p.shifts[d + o] = 'O';
        op++;
      }
      d += op;
    }
  }
  for (const p of [...workers].sort(() => Math.random() - 0.5)) assignD(p);

  // 평일 charge/acting 최소 1명 보장, 휴일 D/E 최소 1명 보장
  for (let d = 0; d < total; d++) {
    const od = isOffDay(d + 1);
    if (!od) {
      if (!workers.some((p) => p.shifts[d] === 'D' && p.role === 'charge')) {
        const c = pickP(charges.filter((p) => canPlace(p, d, 'D')), d, 'D', (a, b) => dC[a.name] - dC[b.name]);
        if (c) { c.shifts[d] = 'D'; dC[c.name]++; }
      }
      if (!workers.some((p) => p.shifts[d] === 'D' && p.role === 'acting')) {
        const a = pickP(actings.filter((p) => canPlace(p, d, 'D')), d, 'D', (a, b) => dC[a.name] - dC[b.name]);
        if (a) { a.shifts[d] = 'D'; dC[a.name]++; }
        else {
          const c2 = pickP(charges.filter((p) => canPlace(p, d, 'D')), d, 'D', (a, b) => dC[a.name] - dC[b.name]);
          if (c2) { c2.shifts[d] = 'D'; dC[c2.name]++; }
        }
      }
    } else {
      if (countShift(d, 'D') < 1) {
        const p = pickP(workers.filter((w) => canPlace(w, d, 'D')), d, 'D', (a, b) => dC[a.name] - dC[b.name]);
        if (p) { p.shifts[d] = 'D'; dC[p.name]++; }
      }
      if (countShift(d, 'E') < 1) {
        const p = workers.filter((w) => canPlace(w, d, 'E')).sort((a, b) => eC[a.name] - eC[b.name])[0];
        if (p) { p.shifts[d] = 'E'; eC[p.name]++; }
      }
    }
  }

  // 잔여 슬롯 채우기
  for (const p of workers) {
    for (let d = 0; d < total; d++) {
      if (!isFree(p, d)) continue;
      if (offCount(p) < targetOff[p.name]) p.shifts[d] = 'O';
      else if (canPlaceP(p, d, 'D')) p.shifts[d] = 'D';
      else p.shifts[d] = 'O';
    }
  }

  // 초과 인원 정리
  for (let d = 0; d < total; d++) {
    while (countShift(d, 'N') > 1) {
      const ex = workers.find((p) => p.shifts[d] === 'N' && !isLocked(p, d));
      if (!ex) break;
      ex.shifts[d] = 'O';
    }
    while (countShift(d, 'E') > targetE(d)) {
      const ex = workers.find((p) => p.shifts[d] === 'E' && !isLocked(p, d));
      if (!ex) break;
      ex.shifts[d] = 'O';
      if (d + 1 < total && ex.shifts[d + 1] === 'D' && !isLocked(ex, d + 1)) ex.shifts[d + 1] = 'O';
    }
    const mx = isOffDay(d + 1) ? 1 : 3;
    while (countShift(d, 'D') > mx) {
      const ex = workers.find((p) => p.shifts[d] === 'D' && canTWO(p, d));
      if (!ex) break;
      ex.shifts[d] = 'O';
    }
  }
  for (let d = 0; d < total; d++) {
    while (countShift(d, 'D') > 3) {
      const ex = workers.find((p) => p.shifts[d] === 'D' && canTWO(p, d));
      if (!ex) break;
      ex.shifts[d] = 'O';
    }
  }

  // 연속 오프 4일 초과 방지
  for (const p of workers) {
    let run = 0;
    for (let d = 0; d < total; d++) {
      if (p.shifts[d] === 'O') {
        if ((d > 0 && p.shifts[d - 1] === 'N') || (d > 1 && p.shifts[d - 2] === 'N')) { run = 0; continue; }
        run++;
        if (run > 4 && !isLocked(p, d)) {
          const eb = d > 0 && p.shifts[d - 1] === 'E';
          if (!eb && canPlaceP(p, d, 'D')) { p.shifts[d] = 'D'; run = 0; }
        }
      } else run = 0;
    }
  }
  balance();

  // 1일짜리 근무 확장 / 5일 초과 연속근무 분할
  function tryExtE(p: Person, d: number) {
    if (p.shifts[d] !== 'E' || runBounds(p, d).len !== 1) return false;
    const tg = [d - 1, d + 1].filter((x) => x >= 0 && x < total);
    for (const day of tg) {
      if (!canTE(p, day)) continue;
      const donor = workers
        .filter((q) => {
          if (q === p || q.shifts[day] !== 'E' || isLocked(q, day)) return false;
          if (day + 1 < total && q.shifts[day + 1] === 'D') return false;
          return true;
        })
        .sort((a, b) => runBounds(b, day).len - runBounds(a, day).len)[0];
      if (!donor) continue;
      p.shifts[day] = 'E';
      donor.shifts[day] = 'O';
      return true;
    }
    return false;
  }
  function tryExtW(p: Person, d: number) {
    if (!isWork(p.shifts[d])) return false;
    if (runBounds(p, d).len !== 1) return false;
    if (offCount(p) <= 11) return false;
    if (d > 0 && canPlaceP(p, d - 1, 'D')) { p.shifts[d - 1] = 'D'; return true; }
    if (p.shifts[d] !== 'E' && d < total - 1 && canPlaceP(p, d + 1, 'D')) { p.shifts[d + 1] = 'D'; return true; }
    return false;
  }
  for (let pass = 0; pass < 3; pass++) {
    let ch = false;
    for (const p of workers) {
      for (let d = 0; d < total; d++) {
        if (!isWork(p.shifts[d])) continue;
        const run = runBounds(p, d);
        if (run.start !== d) continue;
        if (run.len === 1) {
          if (p.shifts[d] === 'E' && tryExtE(p, d)) ch = true;
          else if (tryExtW(p, d)) ch = true;
        } else if (run.len > 5) {
          if (offCount(p) >= 13) continue;
          const cuts: number[] = [];
          for (let day = run.start + 5; day <= run.end; day += 5) cuts.push(day);
          for (const day of cuts) { if (canTWO(p, day)) { p.shifts[day] = 'O'; ch = true; } }
        }
      }
    }
    if (!ch) break;
  }
  balance();

  // E-O-D 패턴 제거
  for (const p of workers) {
    for (let d = 2; d < total; d++) {
      if (p.shifts[d] === 'D' && (p.shifts[d - 1] === 'O' || p.shifts[d - 1] === 'Off') && p.shifts[d - 2] === 'E' && !isLocked(p, d)) {
        p.shifts[d] = 'O';
      }
    }
  }

  return schedule;
}
