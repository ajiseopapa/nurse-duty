import type { Ward } from './types';

// ══════════════════════════════════════════════════════════
// 병동 설정 — 이 부분만 수정하면 됩니다
// ══════════════════════════════════════════════════════════
export const WARD_CONFIG: Ward[] = [
  { id: 'ward7', name: '7병동', icon: '🏥', color: '#3182f6', description: '' },
  { id: 'ward6', name: '6병동', icon: '🏥', color: '#00b386', description: '' },
  { id: 'ward5', name: '5병동', icon: '🏥', color: '#f59e0b', description: '' },
];

export function getWard(wardId: string | null): Ward {
  return WARD_CONFIG.find((w) => w.id === wardId) || WARD_CONFIG[0];
}
