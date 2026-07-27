export type Role = "prefect" | "vice-head" | "head" | "teacher";

export const STAFF_ROLES: Role[] = ["head", "vice-head", "teacher"];

export function isStaffRole(role: Role | null | undefined): boolean {
  return !!role && STAFF_ROLES.includes(role);
}

export interface UserProfile {
  name: string;
  classCode: string; // e.g. "S3C"
  role: Role;
  dutyGroup: string; // e.g. "Gate A"
  active: boolean;
}

export type Severity = "normal" | "caution" | "suspended" | "special";

export type WeatherRuleKey =
  | "VHOT"
  | "COLD"
  | "TS"
  | "TC13"
  | "RAIN_A"
  | "SUSPEND_TC8"
  | "RAIN_R_0530"
  | "RAIN_R_0600"
  | "RAIN_R_0800";

export interface WeatherRule {
  order: number;
  key: WeatherRuleKey;
  condition: string; // display name
  dutyArrangement: string; // markdown
  hkoMeasure: string; // markdown
  severity: Severity;
}
