import "server-only";

import { getD1 } from "@/db";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { AppError } from "@/lib/domain";

export type StaffUser = {
  id: string;
  authUserId: string;
  email: string;
  displayName: string;
  role: "teacher" | "admin" | "manager";
  active: number;
};

export async function requireStaff(
  allowedRoles?: StaffUser["role"][],
): Promise<StaffUser> {
  const identity = await getChatGPTUser();
  if (!identity) {
    throw new AppError(401, "AUTH_REQUIRED", "Sign in to continue.");
  }

  const row = await getD1()
    .prepare(
      `SELECT
        id,
        auth_user_id AS authUserId,
        email,
        display_name AS displayName,
        role,
        active
       FROM staff_users
       WHERE auth_user_id = ?
       LIMIT 1`,
    )
    .bind(identity.userId)
    .first<StaffUser>();

  if (!row || !row.active) {
    throw new AppError(
      403,
      "STAFF_ACCESS_REQUIRED",
      "This signed-in account is not an active staff member.",
    );
  }

  if (allowedRoles && !allowedRoles.includes(row.role)) {
    throw new AppError(
      403,
      "ROLE_FORBIDDEN",
      "Your role cannot perform this action.",
    );
  }

  return row;
}
