export type Role = 'head' | 'charge' | 'acting';
export type Grade = 'RN' | 'AN';

export interface Nurse {
  id: string | number;
  name: string;
  role: Role;
  grade: Grade;
  offDays: number[];
  annualLeaveTotal: number;
}

/** 근무표의 한 사람(한 행). shifts[di]는 근무 코드, 미배정은 null 또는 ''. */
export interface Person {
  name: string;
  grade: Grade;
  role: Role;
  shifts: (string | null)[];
  locked: Record<string, string>;
}

export interface Ward {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
}

export type StatusState = 'ok' | 'err' | 'loading';
