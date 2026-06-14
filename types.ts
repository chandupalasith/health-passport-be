export type TestFlag = 'normal' | 'high' | 'low' | 'critical';
export type Gender = 'male' | 'female' | 'other';
export type UserRole = 'admin' | 'staff';

export interface TestItem {
  name: string;
  value: string;
  unit?: string;
  referenceRange?: string;
  flag: TestFlag;
}

export interface CreatePatientPayload {
  name: string;
  phone: string;
  nic?: string;
  dateOfBirth?: string;
  gender?: Gender;
  address?: string;
}

export interface CreateTestPayload {
  patientId: string;
  testType: string;
  collectedAt?: string;
  items: TestItem[];
  notes?: string;
}
