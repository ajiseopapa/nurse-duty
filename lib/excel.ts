import * as XLSX from 'xlsx';
import { computeStats, daysInMonth } from './schedule';
import type { Nurse, Person } from './types';

export function exportScheduleToExcel(
  wardName: string,
  year: number,
  month: number,
  saved: Person[],
  nurses: Nurse[],
): void {
  const dim = daysInMonth(year, month);
  const wd = ['일', '월', '화', '수', '목', '금', '토'];
  const header: (string | number)[] = ['이름'];
  for (let d = 1; d <= dim; d++) {
    const dow = new Date(year, month, d).getDay();
    header.push(`${d}(${wd[dow]})`);
  }
  header.push('D', 'E', 'N', 'Off', '연차사용', '연차잔여');
  const rows: (string | number)[][] = [header];
  saved.forEach((p) => {
    const row: (string | number)[] = [`[${p.grade || 'RN'}] ${p.name || ''}`];
    p.shifts.forEach((s) => row.push(s || ''));
    const st = computeStats(p, nurses);
    row.push(st.D, st.E, st.N, st.Off, st.leaveUsed, st.leaveRemain);
    rows.push(row);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `${year}-${month + 1}`);
  XLSX.writeFile(wb, `${wardName}_근무표_${year}_${month + 1}.xlsx`);
}
