'use client';
import { useEffect, useRef } from 'react';
import { computeStats } from '@/lib/schedule';
import type { Nurse, Person, Role } from '@/lib/types';

function RoleBadge({ role }: { role: Role }) {
  const styles: Record<Role, { bg: string; color: string; label: string }> = {
    head: { bg: '#e3f2fd', color: '#4facfe', label: 'H' },
    charge: { bg: '#e8f5e9', color: '#388e3c', label: 'C' },
    acting: { bg: '#fff8e1', color: '#f9a825', label: 'A' },
  };
  const s = styles[role];
  if (!s) return null;
  return (
    <span style={{ fontSize: 9, fontWeight: 800, background: s.bg, color: s.color, borderRadius: 4, padding: '1px 5px', marginLeft: 3 }}>
      {s.label}
    </span>
  );
}

function StatCells({ p, nurses }: { p: Person; nurses: Nurse[] }) {
  const st = computeStats(p, nurses);
  const base = { fontWeight: 700, fontSize: 12, background: '#f8f9fa', color: '#333' } as const;
  return (
    <>
      <td style={base}>{st.D}</td>
      <td style={base}>{st.E}</td>
      <td style={base}>{st.N}</td>
      <td style={base}>{st.Off}</td>
      <td style={{ fontWeight: 700, fontSize: 11, background: '#fff3e0', color: '#e65100' }} title={`사용/총 ${st.leaveTotal}일`}>
        {st.leaveUsed}/{st.leaveRemain}
      </td>
    </>
  );
}

export default function ScheduleTable({
  mode,
  people,
  year,
  month,
  daysInMonth,
  nurses,
  onCellClick,
  onCellContextMenu,
}: {
  mode: 'confirmed' | 'draft';
  people: Person[];
  year: number;
  month: number;
  daysInMonth: number;
  nurses: Nurse[];
  onCellClick: (e: React.MouseEvent<HTMLTableCellElement>, ni: number, di: number) => void;
  onCellContextMenu: (ni: number, di: number) => void;
}) {
  const tableRef = useRef<HTMLTableElement>(null);
  const wd = ['일', '월', '화', '수', '목', '금', '토'];

  // 행/열 하이라이트 — 셀 수가 많아 상태 갱신 대신 원본처럼 DOM 클래스로 처리
  useEffect(() => {
    const table: HTMLTableElement | null = tableRef.current;
    if (!table) return;
    function clear() {
      if (!table) return;
      table.querySelectorAll('tbody tr').forEach((r) => r.classList.remove('row-hover'));
      table.querySelectorAll('.col-hover').forEach((el) => el.classList.remove('col-hover'));
    }
    function onOver(e: MouseEvent) {
      if (!table) return;
      const td = (e.target as Element).closest('td, th');
      if (!td || !table.contains(td)) { clear(); return; }
      const row = td.closest('tr');
      if (!row) return;
      const ci = Array.from(row.cells).indexOf(td as HTMLTableCellElement);
      table.querySelectorAll('tbody tr').forEach((r) => r.classList.remove('row-hover'));
      const tr = td.closest('tbody tr');
      if (tr) tr.classList.add('row-hover');
      table.querySelectorAll('.col-hover').forEach((el) => el.classList.remove('col-hover'));
      if (ci >= 0) {
        table.querySelectorAll('tr').forEach((r) => { const c = r.cells[ci]; if (c) c.classList.add('col-hover'); });
      }
    }
    function onOut(e: MouseEvent) {
      if (!e.relatedTarget || !(e.relatedTarget as Element).closest('table')) clear();
    }
    table.addEventListener('mouseover', onOver);
    table.addEventListener('mouseout', onOut);
    return () => {
      table.removeEventListener('mouseover', onOver);
      table.removeEventListener('mouseout', onOut);
    };
  }, []);

  return (
    <table ref={tableRef} id="schedTable">
      <thead>
        <tr>
          <th style={{ width: 100 }}>이름</th>
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
            const dow = new Date(year, month, d).getDay();
            const dc = dow === 0 ? 'sun' : dow === 6 ? 'sat' : '';
            return (
              <th key={d} className={dc} style={{ fontSize: 11, padding: '5px 0' }}>
                {d}
                <br />
                <span style={{ fontWeight: 'normal', fontSize: 10 }}>({wd[dow]})</span>
              </th>
            );
          })}
          <th style={{ width: 34, background: '#f1f3f5', fontSize: 11 }}>D</th>
          <th style={{ width: 34, background: '#f1f3f5', fontSize: 11 }}>E</th>
          <th style={{ width: 34, background: '#f1f3f5', fontSize: 11 }}>N</th>
          <th style={{ width: 34, background: '#f1f3f5', fontSize: 11 }}>Off</th>
          <th style={{ width: 58, background: '#fff3e0', fontSize: 11 }}>
            연차<br /><span style={{ fontWeight: 400, fontSize: 9 }}>사용/잔여</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {people.map((p, ni) => (
          <tr key={p.name || ni}>
            <td
              style={{
                fontWeight: 'bold',
                fontSize: 12,
                ...(p.role === 'head' ? { background: '#FFF3E0', color: '#E65100' } : {}),
              }}
            >
              [{p.grade || 'RN'}] {p.name || ''} <RoleBadge role={p.role} />
            </td>
            {p.shifts.map((s, di) => {
              const lk = !!(p.locked || {})[di];
              return (
                <td
                  key={di}
                  className={`shift-${s}${lk ? ' cell-locked' : ''}`}
                  onClick={(e) => onCellClick(e, ni, di)}
                  onContextMenu={(e) => { e.preventDefault(); onCellContextMenu(ni, di); }}
                  style={
                    mode === 'confirmed'
                      ? { cursor: 'pointer', fontSize: 13, fontWeight: 'bold', padding: '6px 2px' }
                      : { cursor: 'pointer', fontSize: 13, fontWeight: 'bold', ...(s ? {} : { color: '#ddd' }) }
                  }
                  title={mode === 'draft' ? (lk ? '🔒 수동 고정' : '클릭: 근무 선택 / 우클릭: 초기화') : undefined}
                >
                  {s || (mode === 'confirmed' ? '-' : '·')}
                </td>
              );
            })}
            <StatCells p={p} nurses={nurses} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}
