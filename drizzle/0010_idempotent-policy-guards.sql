DROP TRIGGER IF EXISTS `trg_teacher_pay_rate_overlap_insert`;--> statement-breakpoint
CREATE TRIGGER `trg_teacher_pay_rate_overlap_insert`
BEFORE INSERT ON `teacher_pay_rates`
WHEN EXISTS (
  SELECT 1 FROM teacher_pay_rates existing
  WHERE existing.id<>NEW.id
    AND existing.teacher_id=NEW.teacher_id
    AND existing.session_kind=NEW.session_kind
    AND existing.starts_on<=COALESCE(NEW.ends_on,'9999-12-31')
    AND NEW.starts_on<=COALESCE(existing.ends_on,'9999-12-31')
)
BEGIN SELECT RAISE(ABORT, 'TEACHER_PAY_RATE_OVERLAP'); END;--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_payroll_period_overlap_insert`;--> statement-breakpoint
CREATE TRIGGER `trg_payroll_period_overlap_insert`
BEFORE INSERT ON `payroll_periods`
WHEN EXISTS (
  SELECT 1 FROM payroll_periods existing
  WHERE existing.id<>NEW.id
    AND existing.organization_id=NEW.organization_id
    AND existing.starts_on<=NEW.ends_on AND NEW.starts_on<=existing.ends_on
)
BEGIN SELECT RAISE(ABORT, 'PAYROLL_PERIOD_OVERLAP'); END;
