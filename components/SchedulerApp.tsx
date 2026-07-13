'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import ScheduleTable from './ScheduleTable';
import ShiftDropdown, { type DropdownAnchor } from './ShiftDropdown';
import WardSelectModal from './WardSelectModal';
import NurseModal from './NurseModal';
import { AlertDialog, ConfirmDialog, LockDialog, type AlertState, type ConfirmState } from './dialogs';
import {
  deleteDraft,
  deleteSchedule,
  fetchDraft,
  fetchNurses,
  fetchSchedule,
  replaceNurses,
  saveDraft,
  saveSchedule,
} from '@/lib/db';
import { blankPerson, buildSchedule, daysInMonth } from '@/lib/schedule';
import { exportScheduleToExcel } from '@/lib/excel';
import { getWard, WARD_CONFIG } from '@/lib/wards';
import type { Nurse, Person, StatusState } from '@/lib/types';

type ScheduleCache = Record<string, Person[] | null>;

interface DropdownState {
  mode: 'confirmed' | 'draft';
  cacheKey: string;
  ni: number;
  di: number;
  anchor: DropdownAnchor;
}

const DEFAULT_NURSES: Nurse[] = [
  { id: 1, name: '수선생님', role: 'head', grade: 'RN', offDays: [], annualLeaveTotal: 15 },
  { id: 2, name: '간호사A', role: 'charge', grade: 'RN', offDays: [], annualLeaveTotal: 15 },
  { id: 3, name: '간호사B', role: 'acting', grade: 'RN', offDays: [], annualLeaveTotal: 15 },
  { id: 4, name: '간호사C', role: 'acting', grade: 'RN', offDays: [], annualLeaveTotal: 15 },
  { id: 5, name: '간호사D', role: 'acting', grade: 'AN', offDays: [], annualLeaveTotal: 15 },
];

function clonePeople(people: Person[]): Person[] {
  return people.map((p) => ({ ...p, shifts: [...p.shifts], locked: { ...(p.locked || {}) } }));
}

export default function SchedulerApp() {
  const searchParams = useSearchParams();
  const initialWard = searchParams.get('ward');
  const validInitial = WARD_CONFIG.some((w) => w.id === initialWard) ? initialWard : null;

  const [mounted, setMounted] = useState(false);
  const [wardId, setWardId] = useState<string | null>(validInitial);
  const [wardSelectOpen, setWardSelectOpen] = useState(validInitial === null);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [nurses, setNurses] = useState<Nurse[]>([]);
  const [status, setStatus] = useState<{ state: StatusState; msg: string }>({ state: 'loading', msg: '연결 중...' });
  const [nurseModalOpen, setNurseModalOpen] = useState(false);
  const [dropdown, setDropdown] = useState<DropdownState | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [alertState, setAlertState] = useState<AlertState | null>(null);
  const [lockMessage, setLockMessage] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const [schedules, _setSchedules] = useState<ScheduleCache>({});
  const schedulesRef = useRef<ScheduleCache>(schedules);
  const setSchedules = useCallback((updater: ScheduleCache | ((prev: ScheduleCache) => ScheduleCache)) => {
    const next = typeof updater === 'function' ? updater(schedulesRef.current) : updater;
    schedulesRef.current = next;
    _setSchedules(next);
  }, []);

  const lockResolveRef = useRef<((lock: boolean) => void) | null>(null);
  const lockOpenRef = useRef(false);
  lockOpenRef.current = lockMessage !== null;

  const ward = getWard(wardId);
  const key = `${year}-${month}`;
  const draftKey = key + '-draft';
  const dim = daysInMonth(year, month);

  useEffect(() => setMounted(true), []);

  // 병동 문서 타이틀
  useEffect(() => {
    if (wardId) document.title = `${ward.name} 근무표`;
  }, [wardId, ward.name]);

  // 병동 선택 → 인력 로드
  useEffect(() => {
    if (!mounted || !wardId) return;
    let cancelled = false;
    (async () => {
      setStatus({ state: 'loading', msg: `${getWard(wardId).name} 로딩 중...` });
      try {
        const list = await fetchNurses(wardId);
        if (cancelled) return;
        setNurses(list.length > 0 ? list : DEFAULT_NURSES);
        setStatus({ state: 'ok', msg: `${getWard(wardId).name} · Firebase 연결됨` });
      } catch (e) {
        if (cancelled) return;
        console.error('[status:err] DB 연결 실패', e);
        setNurses(DEFAULT_NURSES);
        setStatus({ state: 'err', msg: 'DB 연결 실패' });
      }
    })();
    return () => { cancelled = true; };
  }, [mounted, wardId]);

  // 현재 월 데이터 준비: 확정 근무표 → 없으면 임시저장(draft)
  const refreshMonth = useCallback(async () => {
    if (!wardId || nurses.length === 0) return;
    const k = `${year}-${month}`;
    const dk = k + '-draft';
    const total = daysInMonth(year, month);
    let saved = schedulesRef.current[k];
    if (saved === undefined) saved = await fetchSchedule(wardId, year, month);
    if (saved) {
      const merged = nurses
        .map((n) => saved!.find((p) => p.name === n.name) || blankPerson(n, total, 'O'))
        .map((p) => ({ ...p, locked: p.locked || {} }));
      setSchedules((prev) => ({ ...prev, [k]: merged }));
    } else {
      let draft = schedulesRef.current[dk];
      if (!draft) {
        const remote = await fetchDraft(wardId, year, month);
        draft = nurses.map((n) => {
          const f = remote?.find((d) => d.name === n.name);
          return f
            ? { ...f, grade: n.grade || 'RN', role: n.role || 'acting', locked: f.locked || {} }
            : blankPerson(n, total, '');
        });
      } else {
        draft = nurses.map((n) => draft!.find((d) => d.name === n.name) || blankPerson(n, total, ''));
      }
      setSchedules((prev) => ({ ...prev, [k]: null, [dk]: draft! }));
    }
  }, [wardId, year, month, nurses, setSchedules]);

  useEffect(() => {
    if (!mounted) return;
    refreshMonth();
  }, [mounted, refreshMonth]);

  // 화면 아무 곳 클릭 → 드롭다운 닫기, ESC/Enter 처리
  useEffect(() => {
    function onClick() { setDropdown(null); }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setNurseModalOpen(false); setDropdown(null); }
      if (e.key === 'Enter' && lockOpenRef.current) { e.preventDefault(); resolveLock(true); }
    }
    window.addEventListener('click', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', onClick);
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function askLock(personName: string, shiftVal: string, day: number): Promise<boolean> {
    return new Promise((resolve) => {
      lockResolveRef.current = resolve;
      const d = new Date(year, month, day + 1);
      const wd = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
      setLockMessage(`${personName} · ${month + 1}/${day + 1}(${wd}) → ${shiftVal || '비움'}`);
    });
  }
  function resolveLock(doLock: boolean) {
    setLockMessage(null);
    lockResolveRef.current?.(doLock);
    lockResolveRef.current = null;
  }

  function selectWard(id: string) {
    const url = new URL(window.location.href);
    url.searchParams.set('ward', id);
    window.history.replaceState(null, '', url.toString());
    setWardSelectOpen(false);
    if (id !== wardId) {
      // 병동 전환 시 캐시 초기화
      setNurses([]);
      setSchedules({});
      setWardId(id);
    }
  }

  function changeMonth(diff: number) {
    let m = month + diff;
    let y = year;
    if (m > 11) { y++; m = 0; }
    if (m < 0) { y--; m = 11; }
    setYear(y);
    setMonth(m);
  }
  function goCurrentMonth() {
    const t = new Date();
    setYear(t.getFullYear());
    setMonth(t.getMonth());
  }

  // ── 확정 근무표 셀 편집 ──────────────────────────────────
  async function persistConfirmed(arr: Person[]) {
    if (!wardId) return;
    try {
      setStatus({ state: 'loading', msg: '저장 중...' });
      await saveSchedule(wardId, year, month, arr);
      setStatus({ state: 'ok', msg: '자동 저장됨' });
    } catch {
      setStatus({ state: 'err', msg: '저장 실패' });
    }
  }

  async function updateShiftCell(ni: number, di: number, v: string) {
    const arr = clonePeople(schedulesRef.current[key] || []);
    if (!arr[ni]) return;
    arr[ni].shifts[di] = v;
    setSchedules((prev) => ({ ...prev, [key]: arr }));
    const doLock = await askLock(arr[ni].name, v, di);
    const arr2 = clonePeople(schedulesRef.current[key] || []);
    if (doLock) arr2[ni].locked[di] = v;
    else delete arr2[ni].locked[di];
    setSchedules((prev) => ({ ...prev, [key]: arr2 }));
    await persistConfirmed(arr2);
  }

  async function deleteShiftCell(ni: number, di: number) {
    const arr = clonePeople(schedulesRef.current[key] || []);
    if (!arr[ni]) return;
    arr[ni].shifts[di] = '';
    delete arr[ni].locked[di];
    setSchedules((prev) => ({ ...prev, [key]: arr }));
    await persistConfirmed(arr);
  }

  // ── 임시저장(draft) 셀 편집 ──────────────────────────────
  async function persistDraft(arr: Person[]) {
    if (!wardId) return;
    try { await saveDraft(wardId, year, month, arr); } catch { /* 원본과 동일하게 조용히 무시 */ }
  }

  async function setDraftCell(ni: number, di: number, v: string) {
    const cur = schedulesRef.current[draftKey] || nurses.map((n) => blankPerson(n, dim, ''));
    const arr = clonePeople(cur);
    if (!arr[ni]) return;
    arr[ni].shifts[di] = v;
    setSchedules((prev) => ({ ...prev, [draftKey]: arr }));
    const doLock = await askLock(arr[ni].name, v, di);
    const arr2 = clonePeople(schedulesRef.current[draftKey] || []);
    if (doLock) arr2[ni].locked[di] = v;
    else delete arr2[ni].locked[di];
    setSchedules((prev) => ({ ...prev, [draftKey]: arr2 }));
    await persistDraft(arr2);
  }

  async function clearDraftCell(ni: number, di: number) {
    const cur = schedulesRef.current[draftKey];
    if (!cur) return;
    const arr = clonePeople(cur);
    arr[ni].shifts[di] = '';
    delete arr[ni].locked[di];
    setSchedules((prev) => ({ ...prev, [draftKey]: arr }));
    await persistDraft(arr);
  }

  // ── 셀 클릭 → 드롭다운 토글 ──────────────────────────────
  function handleCellClick(mode: 'confirmed' | 'draft', e: React.MouseEvent<HTMLTableCellElement>, ni: number, di: number) {
    e.stopPropagation();
    if (dropdown && dropdown.ni === ni && dropdown.di === di) { setDropdown(null); return; }
    const r = e.currentTarget.getBoundingClientRect();
    setDropdown({
      mode,
      cacheKey: mode === 'confirmed' ? key : draftKey,
      ni,
      di,
      anchor: { top: r.top, bottom: r.bottom, left: r.left },
    });
  }

  async function handleDropdownSelect(v: string) {
    const dd = dropdown;
    setDropdown(null);
    if (!dd) return;
    if (dd.mode === 'confirmed') await updateShiftCell(dd.ni, dd.di, v);
    else await setDraftCell(dd.ni, dd.di, v);
  }

  // ── 근무표 자동 생성 ─────────────────────────────────────
  async function generateSchedule() {
    if (!wardId) return;
    setGenerating(true);
    try {
      const confirmedData = schedulesRef.current[key] || [];
      const draftData = schedulesRef.current[draftKey] || [];
      const schedule = buildSchedule(year, month, nurses, confirmedData, draftData);
      setSchedules((prev) => ({ ...prev, [key]: schedule }));
      await saveSchedule(wardId, year, month, schedule);
      setStatus({ state: 'ok', msg: `${ward.name} 근무표 생성 완료` });
    } catch (e) {
      console.error(e);
      setAlertState({ title: '오류 발생', message: e instanceof Error ? e.message : String(e), sub: '다시 시도해주세요.' });
      setStatus({ state: 'err', msg: '생성 실패' });
    } finally {
      setGenerating(false);
    }
  }

  // ── 초기화 ───────────────────────────────────────────────
  function resetCurrentMonth() {
    setConfirmState({
      title: '근무표 초기화',
      message: `${year}년 ${month + 1}월 근무표를 초기화할까요?`,
      sub: '확정 생성된 근무표만 삭제됩니다.',
      onConfirm: async () => {
        if (!wardId) return;
        try {
          setStatus({ state: 'loading', msg: '초기화 중...' });
          await deleteSchedule(wardId, year, month);
          setSchedules((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
          await refreshMonth();
          setStatus({ state: 'ok', msg: '초기화 완료' });
        } catch {
          setStatus({ state: 'err', msg: '초기화 실패' });
        }
      },
    });
  }

  function resetCurrentMonthAll() {
    setConfirmState({
      title: '전체 초기화',
      message: `${year}년 ${month + 1}월 모든 근무 입력을 삭제할까요?`,
      sub: '확정 근무표, 임시저장, 수동 고정 모두 삭제됩니다.',
      onConfirm: async () => {
        if (!wardId) return;
        try {
          setStatus({ state: 'loading', msg: '전체 초기화 중...' });
          await deleteSchedule(wardId, year, month);
          try { await deleteDraft(wardId, year, month); } catch { /* ignore */ }
          setSchedules((prev) => {
            const next = { ...prev };
            delete next[key];
            delete next[draftKey];
            return next;
          });
          await refreshMonth();
          setStatus({ state: 'ok', msg: '전체 초기화 완료' });
        } catch (e) {
          setStatus({ state: 'err', msg: '전체 초기화 실패' });
          setAlertState({ title: '초기화 실패', message: e instanceof Error ? e.message : String(e), sub: '다시 시도해주세요.' });
        }
      },
    });
  }

  // ── 인력 저장 ────────────────────────────────────────────
  async function handleSaveNurses(list: Nurse[]) {
    if (!wardId) return;
    setStatus({ state: 'loading', msg: '저장 중...' });
    try {
      await replaceNurses(wardId, list);
      const fresh = await fetchNurses(wardId);
      setNurses(fresh);
      setNurseModalOpen(false);
      setStatus({ state: 'ok', msg: `${ward.name} 저장 완료` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus({ state: 'err', msg: '저장 실패: ' + msg });
      setAlertState({ title: '저장 실패', message: msg });
    }
  }

  function handleExport() {
    const saved = schedulesRef.current[key];
    if (!saved) {
      setAlertState({ title: '먼저 근무표를 생성해주세요!', message: '상단의 근무표 생성 버튼을 눌러 근무표를 먼저 만들어주세요.' });
      return;
    }
    exportScheduleToExcel(ward.name, year, month, saved, nurses);
  }

  if (!mounted) return null;

  const saved = schedules[key];
  const draft = schedules[draftKey];
  const mode: 'confirmed' | 'draft' = saved ? 'confirmed' : 'draft';
  const people = saved || draft || [];

  return (
    <>
      <WardSelectModal open={wardSelectOpen} currentWardId={wardId} onSelect={selectWard} />

      <div className="card">
        <div className="ward-banner">
          <div className="ward-dot" style={{ background: ward.color }} />
          <span>
            {wardId ? (
              <>
                <strong style={{ color: ward.color }}>{ward.icon} {ward.name}</strong>
                <span style={{ fontWeight: 400, fontSize: 12, color: '#adb5bd', marginLeft: 6 }}>{ward.description}</span>
              </>
            ) : (
              '병동 로딩 중...'
            )}
          </span>
          <button className="ward-switch-btn" onClick={() => setWardSelectOpen(true)}>병동 전환 ↔</button>
        </div>

        <div className="header">
          <button className="nav-btn" onClick={() => changeMonth(-1)}>◀</button>
          <h2>
            {year}년 {month + 1}월
            <button
              onClick={goCurrentMonth}
              style={{ marginLeft: 8, padding: '4px 8px', fontSize: 12, fontWeight: 600, color: '#3182f6', background: '#e8f3ff', border: 'none', borderRadius: 6, cursor: 'pointer', verticalAlign: 'middle' }}
            >
              이번 달
            </button>
          </h2>
          <button className="nav-btn" onClick={() => changeMonth(1)}>▶</button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <ScheduleTable
            mode={mode}
            people={people}
            year={year}
            month={month}
            daysInMonth={dim}
            nurses={nurses}
            onCellClick={(e, ni, di) => handleCellClick(mode, e, ni, di)}
            onCellContextMenu={(ni, di) => (mode === 'confirmed' ? deleteShiftCell(ni, di) : clearDraftCell(ni, di))}
          />
        </div>

        <div className="legend">
          <span>클릭: 근무 변경</span><span style={{ color: '#ccc' }}>│</span>
          <span>우클릭: 초기화</span><span style={{ color: '#ccc' }}>│</span>
          <div className="legend-item"><div className="legend-locked" /><span>🔒 수동 고정</span></div>
          <span style={{ color: '#ccc' }}>│</span>
          <span style={{ fontSize: 9, fontWeight: 800, background: '#e3f2fd', color: '#4facfe', borderRadius: 4, padding: '1px 5px' }}>H</span><span>Head</span>
          <span style={{ fontSize: 9, fontWeight: 800, background: '#e8f5e9', color: '#388e3c', borderRadius: 4, padding: '1px 5px' }}>C</span><span>Charge</span>
          <span style={{ fontSize: 9, fontWeight: 800, background: '#fff8e1', color: '#f9a825', borderRadius: 4, padding: '1px 5px' }}>A</span><span>Acting</span>
        </div>

        <div className="btn-row">
          <button className="btn btn-primary" onClick={generateSchedule} disabled={generating}>
            {generating ? '생성 중...' : '근무표 생성'}
          </button>
          <button className="btn btn-outline" onClick={() => setNurseModalOpen(true)}>인력관리</button>
          <button className="btn btn-outline" onClick={handleExport}>엑셀 내보내기</button>
          <button className="btn btn-danger" onClick={resetCurrentMonth}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
            초기화
          </button>
          <button className="btn btn-danger" onClick={resetCurrentMonthAll}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M5 6l1 14c.1 1.1 1 2 2.1 2h7.8c1.1 0 2-.9 2.1-2l1-14" /></svg>
            전체 초기화
          </button>
        </div>
      </div>

      <div className="status-bar">
        <div className={'dot ' + status.state} />
        <span>{status.msg}</span>
      </div>

      {dropdown && <ShiftDropdown anchor={dropdown.anchor} onSelect={handleDropdownSelect} />}

      <NurseModal
        open={nurseModalOpen}
        wardName={ward.name}
        nurses={nurses}
        onClose={() => setNurseModalOpen(false)}
        onSave={handleSaveNurses}
      />

      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
      <LockDialog message={lockMessage} onResolve={resolveLock} />
      <AlertDialog state={alertState} onClose={() => setAlertState(null)} />
    </>
  );
}
