'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import { SHIFT_ITEMS } from '@/lib/schedule';

export interface DropdownAnchor {
  top: number;
  bottom: number;
  left: number;
}

export default function ShiftDropdown({
  anchor,
  onSelect,
}: {
  anchor: DropdownAnchor;
  onSelect: (v: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // 화면 아래 공간이 부족하면 셀 위쪽으로 배치 (원본 positionDropdown 로직)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = el.offsetHeight;
    const sp = window.innerHeight - anchor.bottom;
    const top = sp > h + 8 ? anchor.bottom + window.scrollY + 4 : anchor.top + window.scrollY - h - 4;
    let left = anchor.left + window.scrollX;
    if (left + 160 > window.innerWidth) left = window.innerWidth - 168;
    setPos({ top, left });
  }, [anchor]);

  return (
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        zIndex: 9999,
        background: 'white',
        borderRadius: 14,
        boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
        border: '1px solid #f2f4f6',
        minWidth: 160,
        maxHeight: 320,
        overflowY: 'auto',
        top: pos ? pos.top : 0,
        left: pos ? pos.left : -9999,
      }}
    >
      {SHIFT_ITEMS.map(({ group, items }) => (
        <div key={group}>
          <div style={{ padding: '3px 0 5px', fontSize: 10, fontWeight: 800, color: '#aaa', textAlign: 'center', borderTop: '1px solid #f2f4f6' }}>
            {group}
          </div>
          {items.map(([v, desc]) => (
            <div
              key={v}
              className="shift-dropdown-item"
              onClick={() => onSelect(v)}
              style={{ padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 12 }}
            >
              <span>{v}</span>
              <span style={{ color: '#aaa', fontWeight: 400 }}>{desc}</span>
            </div>
          ))}
        </div>
      ))}
      <div style={{ borderTop: '1px solid #f2f4f6' }}>
        <div
          className="shift-dropdown-item"
          onClick={() => onSelect('')}
          style={{ padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#aaa' }}
        >
          - (비움)
        </div>
      </div>
    </div>
  );
}
