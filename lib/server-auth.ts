import "server-only";

import { getD1 } from "@/db";
import { requirePlatformRole } from "@/lib/account-auth";
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
  const { assignment } = await requirePlatformRole("teacher");
  if (!assignment.staffUserId) {
    throw new AppError(403, "STAFF_ACCESS_REQUIRED", "教师账号未关联员工档案。");
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
       WHERE id = ?
       LIMIT 1`,
    )
    .bind(assignment.staffUserId)
    .first<StaffUser>();

  if (!row || !row.active) {
    throw new AppError(
      403,
      "STAFF_ACCESS_REQUIRED",
      "当前教师账号已停用或不存在。",
    );
  }

  if (allowedRoles && !allowedRoles.includes(row.role)) {
    throw new AppError(
      403,
      "ROLE_FORBIDDEN",
      "当前账号无权执行此操作。",
    );
  }

  return row;
}
