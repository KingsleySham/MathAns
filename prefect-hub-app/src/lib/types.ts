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

// Weather types come from the engine at the repo root so the app, the
// serverless function and the tests can never drift apart.
export type {
  Severity,
  WeatherRule,
  WeatherRuleKey,
} from "../../../lib/prefect-weather";
