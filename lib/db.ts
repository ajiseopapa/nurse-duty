import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Grade, Nurse, Person, Role } from './types';

// 모든 DB 키에 병동 prefix 적용 → 완벽하게 병동별 데이터 분리
const wk = (wardId: string, key: string) => `${wardId}__${key}`;

interface NurseDoc {
  name?: string;
  role?: Role;
  grade?: Grade;
  sort_order?: number;
  off_days?: number[];
  annual_leave_total?: number;
  ward_id?: string;
}

export async function fetchNurses(wardId: string): Promise<Nurse[]> {
  const snap = await getDocs(query(collection(db, 'nurses'), where('ward_id', '==', wardId)));
  const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as NurseDoc) }));
  list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  return list
    .filter((n) => n.name && n.name.trim() !== '')
    .map((n) => ({
      id: n.id,
      name: n.name!.trim(),
      role: n.role ?? 'acting',
      grade: n.grade ?? 'RN',
      offDays: n.off_days || [],
      annualLeaveTotal: n.annual_leave_total ?? 15,
    }));
}

/** 해당 병동 인력만 삭제 후 재삽입 (배치 처리) */
export async function replaceNurses(wardId: string, nurses: Nurse[]): Promise<void> {
  const existing = await getDocs(query(collection(db, 'nurses'), where('ward_id', '==', wardId)));
  const batch = writeBatch(db);
  existing.docs.forEach((d) => batch.delete(d.ref));
  nurses.forEach((n, i) => {
    const ref = doc(collection(db, 'nurses'));
    batch.set(ref, {
      name: n.name,
      role: n.role,
      grade: n.grade,
      sort_order: i,
      off_days: n.offDays || [],
      annual_leave_total: n.annualLeaveTotal ?? 15,
      ward_id: wardId,
    });
  });
  await batch.commit();
}

export async function fetchSchedule(wardId: string, year: number, month: number): Promise<Person[] | null> {
  try {
    const snap = await getDoc(doc(db, 'schedules', wk(wardId, `${year}-${month}`)));
    return snap.exists() ? (snap.data().data as Person[]) : null;
  } catch {
    return null;
  }
}

export async function saveSchedule(wardId: string, year: number, month: number, data: Person[]): Promise<void> {
  await setDoc(doc(db, 'schedules', wk(wardId, `${year}-${month}`)), {
    year,
    month,
    data,
    ward_id: wardId,
    updated_at: new Date().toISOString(),
  });
}

export async function deleteSchedule(wardId: string, year: number, month: number): Promise<void> {
  await deleteDoc(doc(db, 'schedules', wk(wardId, `${year}-${month}`)));
}

export async function fetchDraft(wardId: string, year: number, month: number): Promise<Person[] | null> {
  try {
    const snap = await getDoc(doc(db, 'schedules', wk(wardId, `draft-${year}-${month}`)));
    return snap.exists() ? (snap.data().data as Person[]) : null;
  } catch {
    return null;
  }
}

export async function saveDraft(wardId: string, year: number, month: number, data: Person[]): Promise<void> {
  await setDoc(doc(db, 'schedules', wk(wardId, `draft-${year}-${month}`)), {
    year,
    month,
    data,
    ward_id: wardId,
  });
}

export async function deleteDraft(wardId: string, year: number, month: number): Promise<void> {
  await deleteDoc(doc(db, 'schedules', wk(wardId, `draft-${year}-${month}`)));
}
