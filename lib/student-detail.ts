import "server-only";

import { getD1 } from "@/db";
import { AppError, melbourneDate, weekRangeForDate } from "@/lib/domain";

export type StudentDetail = {
  student: Record<string, string | number | null>;
  guardians: Array<Record<string, string | number | null>>;
  enrollments: Array<Record<string, string | number | null>>;
  schedule: Array<Record<string, string | number | null>>;
  attendance: Array<Record<string, string | number | null>>;
  orders: Array<Record<string, string | number | null>>;
  week: { startsOn: string; endsOn: string };
};

export async function loadStudentDetail(studentId: string): Promise<StudentDetail> {
  if (!studentId || studentId.length > 120) {
    throw new AppError(400, "INVALID_STUDENT_ID", "学生编号无效。");
  }
  const db = getD1();
  const week = weekRangeForDate(melbourneDate());
  const [student, guardians, enrollments, schedule, attendance, orders] =
    await Promise.all([
      db.prepare(
        `SELECT student.id,
                student.legal_name AS legalName,
                student.preferred_name AS preferredName,
                student.date_of_birth AS dateOfBirth,
                student.lifecycle_status AS status,
                staff.display_name AS owner,
                COALESCE(SUM(transaction_record.quantity),0) AS credits
         FROM students student
         LEFT JOIN staff_users staff ON staff.id=student.owner_admin_id
         LEFT JOIN credit_accounts account_record ON account_record.student_id=student.id
         LEFT JOIN credit_transactions transaction_record
           ON transaction_record.account_id=account_record.id
         WHERE student.id=?
         GROUP BY student.id,staff.display_name
         LIMIT 1`,
      )
        .bind(studentId)
        .first<Record<string, string | number | null>>(),
      db.prepare(
        `SELECT guardian.full_name AS name,
                guardian.email,
                guardian.phone,
                link.relationship,
                link.is_primary AS isPrimary
         FROM student_guardians link
         JOIN guardians guardian ON guardian.id=link.guardian_id
         WHERE link.student_id=?
         ORDER BY link.is_primary DESC,guardian.full_name`,
      )
        .bind(studentId)
        .all<Record<string, string | number | null>>(),
      db.prepare(
        `SELECT series.id,
                series.name AS className,
                series.subject,
                series.weekday,
                series.local_start_time AS startTime,
                series.local_end_time AS endTime,
                series.room,
                teacher.display_name AS teacher,
                enrollment.status
         FROM enrollments enrollment
         JOIN class_series series ON series.id=enrollment.class_series_id
         JOIN staff_users teacher ON teacher.id=series.default_teacher_id
         WHERE enrollment.student_id=?
         ORDER BY enrollment.status,series.weekday,series.local_start_time`,
      )
        .bind(studentId)
        .all<Record<string, string | number | null>>(),
      db.prepare(
        `SELECT session.id,
                series.name AS className,
                session.session_kind AS kind,
                session.session_date AS sessionDate,
                session.local_start_time AS startTime,
                session.local_end_time AS endTime,
                series.room,
                teacher.display_name AS teacher,
                session.status
         FROM session_participants participant
         JOIN lesson_sessions session ON session.id=participant.lesson_session_id
         JOIN class_series series ON series.id=session.class_series_id
         JOIN staff_users teacher ON teacher.id=session.teacher_id
         WHERE participant.student_id=?
           AND session.session_date BETWEEN ? AND ?
           AND participant.removed_at IS NULL
         ORDER BY session.session_date,session.local_start_time`,
      )
        .bind(studentId, week.startsOn, week.endsOn)
        .all<Record<string, string | number | null>>(),
      db.prepare(
        `SELECT series.name AS className,
                session.session_date AS sessionDate,
                attendance.status,
                attendance.billing_status AS billingStatus
         FROM attendance
         JOIN lesson_sessions session ON session.id=attendance.lesson_session_id
         JOIN class_series series ON series.id=session.class_series_id
         WHERE attendance.student_id=?
         ORDER BY session.session_date DESC LIMIT 12`,
      )
        .bind(studentId)
        .all<Record<string, string | number | null>>(),
      db.prepare(
        `SELECT id,description,status,amount_cents AS amountCents,
                credit_quantity AS credits,created_at AS createdAt
         FROM orders
         WHERE student_id=?
         ORDER BY created_at DESC LIMIT 12`,
      )
        .bind(studentId)
        .all<Record<string, string | number | null>>(),
    ]);
  if (!student) {
    throw new AppError(404, "STUDENT_NOT_FOUND", "未找到该学生。");
  }
  return {
    student,
    guardians: guardians.results,
    enrollments: enrollments.results,
    schedule: schedule.results,
    attendance: attendance.results,
    orders: orders.results,
    week,
  };
}
