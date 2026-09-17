CREATE UNIQUE INDEX `uq_support_sessions_open_admin` ON `support_sessions` (`system_admin_account_id`) WHERE "support_sessions"."status" IN ('requested','active');--> statement-breakpoint
CREATE UNIQUE INDEX `uq_trial_bookings_pending_inquiry` ON `trial_bookings` (`inquiry_id`) WHERE "trial_bookings"."outcome" = 'pending';--> statement-breakpoint
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
CREATE TRIGGER `trg_teacher_pay_rate_overlap_update`
BEFORE UPDATE OF teacher_id,session_kind,starts_on,ends_on ON `teacher_pay_rates`
WHEN EXISTS (
  SELECT 1 FROM teacher_pay_rates existing
  WHERE existing.id<>NEW.id
    AND existing.teacher_id=NEW.teacher_id
    AND existing.session_kind=NEW.session_kind
    AND existing.starts_on<=COALESCE(NEW.ends_on,'9999-12-31')
    AND NEW.starts_on<=COALESCE(existing.ends_on,'9999-12-31')
)
BEGIN SELECT RAISE(ABORT, 'TEACHER_PAY_RATE_OVERLAP'); END;--> statement-breakpoint
CREATE TRIGGER `trg_payroll_period_overlap_insert`
BEFORE INSERT ON `payroll_periods`
WHEN EXISTS (
  SELECT 1 FROM payroll_periods existing
  WHERE existing.id<>NEW.id
    AND existing.organization_id=NEW.organization_id
    AND existing.starts_on<=NEW.ends_on AND NEW.starts_on<=existing.ends_on
)
BEGIN SELECT RAISE(ABORT, 'PAYROLL_PERIOD_OVERLAP'); END;--> statement-breakpoint
CREATE TRIGGER `trg_payroll_period_transition`
BEFORE UPDATE OF status ON `payroll_periods`
WHEN NOT (
  NEW.status=OLD.status
  OR (OLD.status='open' AND NEW.status='approved')
  OR (OLD.status='approved' AND NEW.status='paid')
)
BEGIN SELECT RAISE(ABORT, 'INVALID_PAYROLL_TRANSITION'); END;--> statement-breakpoint
CREATE TRIGGER `trg_order_transition`
BEFORE UPDATE OF status ON `orders`
WHEN NOT (
  NEW.status=OLD.status
  OR (OLD.status='pending' AND NEW.status IN ('paid','cancelled'))
  OR (OLD.status='paid' AND NEW.status IN ('partially_refunded','refunded'))
  OR (OLD.status='partially_refunded' AND NEW.status='refunded')
)
BEGIN SELECT RAISE(ABORT, 'INVALID_ORDER_TRANSITION'); END;--> statement-breakpoint
CREATE TRIGGER `trg_order_paid_timestamp_insert`
BEFORE INSERT ON `orders`
WHEN NEW.status IN ('paid','partially_refunded','refunded') AND NEW.paid_at IS NULL
BEGIN SELECT RAISE(ABORT, 'PAID_ORDER_REQUIRES_TIMESTAMP'); END;--> statement-breakpoint
CREATE TRIGGER `trg_order_paid_timestamp_update`
BEFORE UPDATE OF status,paid_at ON `orders`
WHEN NEW.status IN ('paid','partially_refunded','refunded') AND NEW.paid_at IS NULL
BEGIN SELECT RAISE(ABORT, 'PAID_ORDER_REQUIRES_TIMESTAMP'); END;--> statement-breakpoint
CREATE TRIGGER `trg_refund_amount_insert`
BEFORE INSERT ON `refunds`
WHEN NEW.amount_cents > (
  SELECT amount_cents FROM orders WHERE id=NEW.order_id
)
BEGIN SELECT RAISE(ABORT, 'REFUND_EXCEEDS_ORDER'); END;--> statement-breakpoint
CREATE TRIGGER `trg_refund_transition`
BEFORE UPDATE OF status ON `refunds`
WHEN NOT (
  NEW.status=OLD.status
  OR (OLD.status='requested' AND NEW.status IN ('approved','completed','rejected'))
  OR (OLD.status='approved' AND NEW.status IN ('completed','rejected'))
)
BEGIN SELECT RAISE(ABORT, 'INVALID_REFUND_TRANSITION'); END;--> statement-breakpoint
CREATE TRIGGER `trg_trial_booking_transition`
BEFORE UPDATE OF outcome,conversion_decision ON `trial_bookings`
WHEN OLD.outcome<>'pending'
  AND (NEW.outcome<>OLD.outcome OR NEW.conversion_decision<>OLD.conversion_decision)
BEGIN SELECT RAISE(ABORT, 'TRIAL_OUTCOME_IMMUTABLE'); END;--> statement-breakpoint
CREATE TRIGGER `trg_support_session_transition`
BEFORE UPDATE OF status ON `support_sessions`
WHEN NOT (
  NEW.status=OLD.status
  OR (OLD.status='requested' AND NEW.status IN ('active','revoked'))
  OR (OLD.status='active' AND NEW.status IN ('expired','revoked'))
)
BEGIN SELECT RAISE(ABORT, 'INVALID_SUPPORT_TRANSITION'); END;--> statement-breakpoint
CREATE TRIGGER `trg_outbox_transition`
BEFORE UPDATE OF status ON `outbox_events`
WHEN NOT (
  NEW.status=OLD.status
  OR (OLD.status IN ('pending','failed') AND NEW.status IN ('processing','completed'))
  OR (OLD.status='processing' AND NEW.status IN ('completed','failed'))
)
BEGIN SELECT RAISE(ABORT, 'INVALID_OUTBOX_TRANSITION'); END;
