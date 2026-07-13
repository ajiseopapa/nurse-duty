'use client';
import { WARD_CONFIG } from '@/lib/wards';

export default function WardSelectModal({
  open,
  currentWardId,
  onSelect,
}: {
  open: boolean;
  currentWardId: string | null;
  onSelect: (wardId: string) => void;
}) {
  return (
    <div className={'overlay' + (open ? ' open' : '')}>
      <div className="ward-select-modal">
        <div style={{ fontSize: 36, marginBottom: 12 }}>🏥</div>
        <h3>병동 선택</h3>
        <p>근무표를 관리할 병동을 선택해주세요.</p>
        <div className="ward-btn-group">
          {WARD_CONFIG.map((w) => (
            <button
              key={w.id}
              className={'ward-option-btn' + (currentWardId === w.id ? ' selected' : '')}
              onClick={() => onSelect(w.id)}
            >
              <span style={{ fontSize: 22 }}>{w.icon}</span>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div>{w.name}</div>
                <div className="ward-option-sub">{w.description}</div>
              </div>
              {currentWardId === w.id && <span style={{ color: 'var(--blue)', fontSize: 18 }}>✓</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
