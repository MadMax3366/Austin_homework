DROP TRIGGER IF EXISTS `trg_attendance_student_on_roster`;
--> statement-breakpoint
CREATE TRIGGER `trg_attendance_student_on_roster`
BEFORE INSERT ON `attendance`
WHEN NOT EXISTS (
  SELECT 1 FROM `session_participants` AS participant
  WHERE participant.lesson_session_id = NEW.lesson_session_id
    AND participant.student_id = NEW.student_id
    AND participant.removed_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'STUDENT_NOT_IN_SESSION_ROSTER');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_completion_claim_valid`
BEFORE INSERT ON `session_completion_claims`
WHEN NOT EXISTS (
  SELECT 1 FROM `lesson_sessions` AS session
  WHERE session.id = NEW.lesson_session_id
    AND session.status = 'scheduled'
    AND session.version = NEW.expected_version
    AND session.teacher_id = NEW.actor_id
    AND session.roster_frozen_at IS NOT NULL
)
BEGIN
  SELECT RAISE(ABORT, 'SESSION_COMPLETION_CLAIM_REJECTED');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_billing_resolution_claim_valid`
BEFORE INSERT ON `billing_exception_resolution_claims`
WHEN NOT EXISTS (
  SELECT 1
  FROM `billing_exceptions` AS exception_record
  JOIN `students` AS student ON student.id = exception_record.student_id
  JOIN `staff_users` AS actor ON actor.id = NEW.actor_id
  WHERE exception_record.id = NEW.billing_exception_id
    AND exception_record.status = 'open'
    AND exception_record.version = NEW.expected_version
    AND actor.active = 1
    AND (
      actor.role = 'manager'
      OR (actor.role = 'admin' AND student.owner_admin_id = actor.id)
    )
)
BEGIN
  SELECT RAISE(ABORT, 'BILLING_EXCEPTION_CLAIM_REJECTED');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_participant_insert_frozen`
BEFORE INSERT ON `session_participants`
WHEN EXISTS (
  SELECT 1 FROM `lesson_sessions` AS session
  WHERE session.id = NEW.lesson_session_id
    AND (session.roster_frozen_at IS NOT NULL OR session.status <> 'scheduled')
)
BEGIN
  SELECT RAISE(ABORT, 'SESSION_ROSTER_IS_FROZEN');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_participant_update_frozen`
BEFORE UPDATE ON `session_participants`
WHEN EXISTS (
  SELECT 1 FROM `lesson_sessions` AS session
  WHERE session.id = OLD.lesson_session_id
    AND (session.roster_frozen_at IS NOT NULL OR session.status <> 'scheduled')
)
BEGIN
  SELECT RAISE(ABORT, 'SESSION_ROSTER_IS_FROZEN');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_participant_delete_frozen`
BEFORE DELETE ON `session_participants`
WHEN EXISTS (
  SELECT 1 FROM `lesson_sessions` AS session
  WHERE session.id = OLD.lesson_session_id
    AND (session.roster_frozen_at IS NOT NULL OR session.status <> 'scheduled')
)
BEGIN
  SELECT RAISE(ABORT, 'SESSION_ROSTER_IS_FROZEN');
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_attendance_credit_source`;
--> statement-breakpoint
CREATE TRIGGER `trg_attendance_credit_source`
BEFORE INSERT ON `credit_transactions`
WHEN NEW.kind = 'attendance'
  AND (
    NEW.source_type <> 'attendance'
    OR NEW.quantity <> -1
    OR NOT EXISTS (
      SELECT 1
      FROM `attendance` AS attendance_record
      JOIN `credit_accounts` AS account
        ON account.id = NEW.account_id
       AND account.student_id = attendance_record.student_id
      WHERE attendance_record.id = NEW.source_id
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'INVALID_ATTENDANCE_CREDIT_SOURCE');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_billing_exception_valid`
BEFORE INSERT ON `billing_exceptions`
WHEN NOT EXISTS (
  SELECT 1
  FROM `attendance` AS attendance_record
  JOIN `credit_accounts` AS account
    ON account.id = NEW.account_id AND account.student_id = NEW.student_id
  WHERE attendance_record.id = NEW.attendance_id
    AND attendance_record.student_id = NEW.student_id
    AND attendance_record.billing_status = 'pending_insufficient_credit'
    AND NOT EXISTS (
      SELECT 1 FROM `credit_transactions` AS transaction_record
      WHERE transaction_record.kind = 'attendance'
        AND transaction_record.source_type = 'attendance'
        AND transaction_record.source_id = attendance_record.id
    )
)
BEGIN
  SELECT RAISE(ABORT, 'INVALID_BILLING_EXCEPTION');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_enrollment_date_order_insert`
BEFORE INSERT ON `enrollments`
WHEN NEW.ends_on IS NOT NULL AND NEW.ends_on < NEW.starts_on
BEGIN
  SELECT RAISE(ABORT, 'ENROLLMENT_DATE_ORDER_INVALID');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_enrollment_date_order_update`
BEFORE UPDATE ON `enrollments`
WHEN NEW.ends_on IS NOT NULL AND NEW.ends_on < NEW.starts_on
BEGIN
  SELECT RAISE(ABORT, 'ENROLLMENT_DATE_ORDER_INVALID');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_class_series_time_order_insert`
BEFORE INSERT ON `class_series`
WHEN NEW.local_start_time >= NEW.local_end_time
BEGIN
  SELECT RAISE(ABORT, 'CLASS_SERIES_TIME_ORDER_INVALID');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_class_series_time_order_update`
BEFORE UPDATE ON `class_series`
WHEN NEW.local_start_time >= NEW.local_end_time
BEGIN
  SELECT RAISE(ABORT, 'CLASS_SERIES_TIME_ORDER_INVALID');
END;
--> statement-breakpoint
PRAGMA optimize;
