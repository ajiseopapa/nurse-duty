'use client';

export interface ConfirmState {
  title: string;
  message: string;
  sub: string;
  okLabel?: string;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({ state, onClose }: { state: ConfirmState | null; onClose: () => void }) {
  return (
    <div className={'overlay' + (state ? ' open' : '')} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      {state && (
        <div className="confirm-modal">
          <div className="confirm-icon">🗑️</div>
          <h3>{state.title}</h3>
          <p>{state.message}</p>
          <p style={{ fontSize: 12, color: '#adb5bd', marginTop: 6 }}>{state.sub}</p>
          <div className="confirm-btns">
            <button onClick={onClose}>취소</button>
            <button
              className="confirm-ok"
              onClick={async () => { const fn = state.onConfirm; onClose(); await fn(); }}
            >
              {state.okLabel || '초기화'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function LockDialog({ message, onResolve }: { message: string | null; onResolve: (lock: boolean) => void }) {
  return (
    <div
      className={'overlay' + (message !== null ? ' open' : '')}
      onClick={(e) => { if (e.target === e.currentTarget) onResolve(false); }}
    >
      {message !== null && (
        <div className="confirm-modal">
          <div className="confirm-icon">🔒</div>
          <h3>근무를 고정할까요?</h3>
          <p>{message}</p>
          <p style={{ fontSize: 12, color: '#adb5bd', marginTop: 6 }}>고정하면 자동 생성 시 변경되지 않습니다.</p>
          <div className="confirm-btns">
            <button onClick={() => onResolve(false)} style={{ background: '#f2f4f6', color: '#4e5968' }}>고정 안 함</button>
            <button onClick={() => onResolve(true)} className="confirm-ok" style={{ background: 'var(--blue)' }}>🔒 고정</button>
          </div>
        </div>
      )}
    </div>
  );
}

export interface AlertState {
  title: string;
  message: string;
  sub?: string;
}

export function AlertDialog({ state, onClose }: { state: AlertState | null; onClose: () => void }) {
  return (
    <div className={'overlay' + (state ? ' open' : '')} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      {state && (
        <div className="confirm-modal">
          <div className="confirm-icon">📋</div>
          <h3>{state.title}</h3>
          <p>{state.message}</p>
          <p>{state.sub || ''}</p>
          <div className="confirm-btns">
            <button className="confirm-ok" style={{ background: 'var(--blue)' }} onClick={onClose}>확인</button>
          </div>
        </div>
      )}
    </div>
  );
}
