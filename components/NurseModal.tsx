'use client';
import { useEffect, useRef, useState } from 'react';
import type { Grade, Nurse, Role } from '@/lib/types';

const ROLE_COLORS: Record<Role, string> = { head: '#4facfe', charge: '#66bb6a', acting: '#fbc02d' };

export default function NurseModal({
  open,
  wardName,
  nurses,
  onClose,
  onSave,
}: {
  open: boolean;
  wardName: string;
  nurses: Nurse[];
  onClose: () => void;
  onSave: (nurses: Nurse[]) => Promise<void>;
}) {
  const [list, setList] = useState<Nurse[]>([]);
  const [openDrop, setOpenDrop] = useState<{ type: 'grade' | 'role'; index: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const dragIndexRef = useRef<number | null>(null);

  // 모달을 열 때마다 현재 인력으로 편집 목록 초기화
  useEffect(() => {
    if (open) {
      setList(nurses.map((n) => ({ ...n, offDays: [...n.offDays] })));
      setOpenDrop(null);
    }
  }, [open, nurses]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpenDrop(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [open]);

  function update(i: number, patch: Partial<Nurse>) {
    setList((prev) => prev.map((n, idx) => (idx === i ? { ...n, ...patch } : n)));
  }

  function handleDragOver(e: React.DragEvent, overIndex: number) {
    e.preventDefault();
    const from = dragIndexRef.current;
    if (from === null || from === overIndex) return;
    setList((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(overIndex, 0, moved);
      return next;
    });
    dragIndexRef.current = overIndex;
  }

  async function handleSave() {
    setSaving(true);
    try {
      // 빈 이름 / 중복 이름 제거
      const valid: Nurse[] = [];
      const seen = new Set<string>();
      for (const n of list) {
        const name = (n.name || '').trim();
        if (!name || seen.has(name)) continue;
        seen.add(name);
        valid.push({ ...n, name });
      }
      await onSave(valid);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={'overlay' + (open ? ' open' : '')} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <h3>
          인력 관리 <span style={{ fontSize: 13, fontWeight: 600, color: '#adb5bd', marginLeft: 6 }}>— {wardName}</span>
        </h3>
        <div id="nurse-list">
          {list.map((n, i) => {
            const g = n.grade || 'RN';
            const r = n.role || 'acting';
            const gBg = g === 'RN' ? '#feecef' : '#e8f3ff';
            const gCol = g === 'RN' ? '#f04452' : '#3182f6';
            const rc = ROLE_COLORS[r] || ROLE_COLORS.acting;
            return (
              <div
                key={n.id}
                className="nurse-item"
                draggable
                onDragStart={() => { dragIndexRef.current = i; }}
                onDragOver={(e) => handleDragOver(e, i)}
                onDragEnd={() => { dragIndexRef.current = null; }}
              >
                <span style={{ color: '#d1d6db', fontSize: 18 }}>☰</span>
                <input
                  type="text"
                  value={n.name || ''}
                  onChange={(e) => update(i, { name: e.target.value })}
                  placeholder="성함 입력"
                />
                <div className="dropdown-wrap" style={{ flex: 0.8, position: 'relative' }}>
                  <div
                    className="grade-btn"
                    style={{ background: gBg, color: gCol }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenDrop((cur) => (cur?.type === 'grade' && cur.index === i ? null : { type: 'grade', index: i }));
                    }}
                  >
                    {g}
                  </div>
                  {openDrop?.type === 'grade' && openDrop.index === i && (
                    <div className="dropdown-panel" style={{ display: 'block', position: 'absolute', top: 38, left: 0, zIndex: 9999 }}>
                      {(['RN', 'AN'] as Grade[]).map((v) => (
                        <div
                          key={v}
                          style={{ color: v === 'RN' ? '#f04452' : '#3182f6' }}
                          onClick={(e) => { e.stopPropagation(); update(i, { grade: v }); setOpenDrop(null); }}
                        >
                          {v}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="dropdown-wrap" style={{ flex: 1.2, position: 'relative' }}>
                  <div
                    className="role-btn"
                    style={{ color: rc, border: `2px solid ${rc}` }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenDrop((cur) => (cur?.type === 'role' && cur.index === i ? null : { type: 'role', index: i }));
                    }}
                  >
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </div>
                  {openDrop?.type === 'role' && openDrop.index === i && (
                    <div className="dropdown-panel" style={{ display: 'block', position: 'absolute', top: 38, left: 0, zIndex: 9999 }}>
                      {(['head', 'charge', 'acting'] as Role[]).map((v) => (
                        <div
                          key={v}
                          style={{ color: ROLE_COLORS[v] }}
                          onClick={(e) => { e.stopPropagation(); update(i, { role: v }); setOpenDrop(null); }}
                        >
                          {v.charAt(0).toUpperCase() + v.slice(1)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <input
                  type="number"
                  step={0.5}
                  min={0}
                  value={n.annualLeaveTotal ?? 15}
                  onChange={(e) => update(i, { annualLeaveTotal: parseFloat(e.target.value) || 0 })}
                  title="연차 총일수"
                  placeholder="연차"
                  style={{ width: 56, flex: '0 0 56px', textAlign: 'center', fontSize: 12, padding: '6px 4px', border: '1px solid #e5e8eb', borderRadius: 6 }}
                />
                <button className="del-btn" onClick={() => setList((prev) => prev.filter((_, idx) => idx !== i))}>✕</button>
              </div>
            );
          })}
        </div>
        <button
          className="add-nurse-btn"
          onClick={() => setList((prev) => [...prev, { id: Date.now(), name: '', role: 'acting', grade: 'RN', offDays: [], annualLeaveTotal: 15 }])}
        >
          + 새로운 인원 추가
        </button>
        <div className="modal-footer">
          <button className="btn" style={{ background: '#f2f4f6', color: '#4e5968' }} onClick={onClose}>닫기</button>
          <button className="btn btn-primary" style={{ flex: 2, borderRadius: 16 }} onClick={handleSave} disabled={saving}>
            {saving ? '저장 중...' : '설정 저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
