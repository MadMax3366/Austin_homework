CREATE TRIGGER `trg_attendance_session_writable`
BEFORE INSERT ON `attendance`
WHEN NOT EXISTS (
  SELECT 1
  FROM `lesson_sessions` AS ls
  WHERE ls.id = NEW.lesson_session_id
    AND ls.status = 'scheduled'
    AND ls.teacher_id = NEW.recorded_by_id
)
BEGIN
  SELECT RAISE(ABORT, 'ATTENDANCE_SESSION_NOT_WRITABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_attendance_student_on_roster`
BEFORE INSERT ON `attendance`
WHEN NOT EXISTS (
  SELECT 1
  FROM `lesson_sessions` AS ls
  JOIN `enrollments` AS e
    ON e.class_series_id = ls.class_series_id
  WHERE ls.id = NEW.lesson_session_id
    AND e.student_id = NEW.student_id
    AND e.status = 'active'
    AND e.starts_on <= ls.session_date
    AND (e.ends_on IS NULL OR e.ends_on >= ls.session_date)
)
BEGIN
  SELECT RAISE(ABORT, 'STUDENT_NOT_IN_SESSION_ROSTER');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_attendance_credit_cannot_overdraw`
BEFORE INSERT ON `credit_transactions`
WHEN NEW.kind = 'attendance'
  AND (
    SELECT COALESCE(SUM(quantity), 0)
    FROM `credit_transactions`
    WHERE account_id = NEW.account_id
  ) + NEW.quantity < 0
BEGIN
  SELECT RAISE(ABORT, 'INSUFFICIENT_CREDIT');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_attendance_credit_source`
BEFORE INSERT ON `credit_transactions`
WHEN NEW.kind = 'attendance'
  AND (
    NEW.source_type <> 'attendance'
    OR NEW.quantity <> -1
    OR NOT EXISTS (
      SELECT 1 FROM `attendance` AS a WHERE a.id = NEW.source_id
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'INVALID_ATTENDANCE_CREDIT_SOURCE');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_attendance_credit_mark_charged`
AFTER INSERT ON `credit_transactions`
WHEN NEW.kind = 'attendance'
BEGIN
  UPDATE `attendance`
  SET billing_status = 'charged'
  WHERE id = NEW.source_id;
END;
--> statement-breakpoint
CREATE TRIGGER `trg_credit_transactions_immutable_update`
BEFORE UPDATE ON `credit_transactions`
BEGIN
  SELECT RAISE(ABORT, 'CREDIT_LEDGER_IS_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_credit_transactions_immutable_delete`
BEFORE DELETE ON `credit_transactions`
BEGIN
  SELECT RAISE(ABORT, 'CREDIT_LEDGER_IS_IMMUTABLE');
END;
