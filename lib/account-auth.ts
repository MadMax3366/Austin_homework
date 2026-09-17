import "server-only";

import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getD1 } from "@/db";
import { AppError } from "@/lib/domain";

export type PlatformRole =
  | "teacher"
  | "operations_admin"
  | "manager_admin"
  | "student"
  | "guardian"
  | "system_admin";

export type RoleAssignment = {
  id: string;
  role: PlatformRole;
  staffUserId: string | null;
  studentId: string | null;
  guardianId: string | null;
  scopeType: "organization" | "owner" | "self";
  scopeId: string | null;
};

export type PlatformAccount = {
  id: string;
  organizationId: string;
  displayName: string;
  email: string;
  roles: RoleAssignment[];
};

export async function getPlatformAccount(): Promise<PlatformAccount | null> {
  const identity = await getChatGPTUser();
  if (!identity) return null;
  const account = await getD1()
    .prepare(
      `SELECT account_record.id,
              account_record.organization_id AS organizationId,
              account_record.display_name AS displayName,
              account_record.email
       FROM user_accounts account_record
       JOIN organizations organization
         ON organization.id=account_record.organization_id
       WHERE account_record.auth_user_id = ?
         AND account_record.status = 'active'
         AND organization.status = 'active'
       LIMIT 1`,
    )
    .bind(identity.userId)
    .first<Omit<PlatformAccount, "roles">>();
  if (!account) return null;

  const assignments = await getD1()
    .prepare(
      `SELECT id, role, staff_user_id AS staffUserId,
              student_id AS studentId, guardian_id AS guardianId,
              scope_type AS scopeType, scope_id AS scopeId
       FROM account_role_assignments
       WHERE account_id = ? AND active = 1
         AND (staff_user_id IS NULL OR EXISTS (
           SELECT 1 FROM staff_users staff
           WHERE staff.id=staff_user_id AND staff.active=1
         ))
       ORDER BY role`,
    )
    .bind(account.id)
    .all<RoleAssignment>();
  return { ...account, roles: assignments.results };
}

export async function requirePlatformAccount(): Promise<PlatformAccount> {
  const identity = await getChatGPTUser();
  if (!identity) {
    throw new AppError(401, "AUTH_REQUIRED", "Sign in to continue.");
  }
  const account = await getPlatformAccount();
  if (!account) {
    throw new AppError(
      403,
      "PLATFORM_ACCOUNT_REQUIRED",
      "This identity has not been provisioned for the organization.",
    );
  }
  return account;
}

export async function requirePlatformRole(
  role: PlatformRole,
): Promise<{ account: PlatformAccount; assignment: RoleAssignment }> {
  const account = await requirePlatformAccount();
  const assignment = account.roles.find((item) => item.role === role);
  if (!assignment) {
    throw new AppError(
      403,
      "ROLE_FORBIDDEN",
      `The ${role} workspace is not assigned to this account.`,
    );
  }
  return { account, assignment };
}

export async function requireAnyPlatformRole(
  roles: PlatformRole[],
): Promise<{ account: PlatformAccount; assignment: RoleAssignment }> {
  const account = await requirePlatformAccount();
  const assignment = account.roles.find((item) => roles.includes(item.role));
  if (!assignment) {
    throw new AppError(
      403,
      "ROLE_FORBIDDEN",
      "This account cannot perform the requested operation.",
    );
  }
  return { account, assignment };
}
