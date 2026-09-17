CREATE TABLE `account_role_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`role` text NOT NULL,
	`staff_user_id` text,
	`student_id` text,
	`guardian_id` text,
	`scope_type` text DEFAULT 'organization' NOT NULL,
	`scope_id` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `user_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`staff_user_id`) REFERENCES `staff_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`guardian_id`) REFERENCES `guardians`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_account_role_assignments_role" CHECK("account_role_assignments"."role" IN ('teacher','operations_admin','manager_admin','student','guardian','system_admin')),
	CONSTRAINT "ck_account_role_assignments_scope" CHECK("account_role_assignments"."scope_type" IN ('organization','owner','self')),
	CONSTRAINT "ck_account_role_assignments_active" CHECK("account_role_assignments"."active" IN (0,1)),
	CONSTRAINT "ck_account_role_assignments_subject" CHECK((
        ("account_role_assignments"."role" IN ('teacher','operations_admin','manager_admin')
          AND "account_role_assignments"."staff_user_id" IS NOT NULL
          AND "account_role_assignments"."student_id" IS NULL AND "account_role_assignments"."guardian_id" IS NULL)
        OR ("account_role_assignments"."role" = 'student' AND "account_role_assignments"."student_id" IS NOT NULL
          AND "account_role_assignments"."staff_user_id" IS NULL AND "account_role_assignments"."guardian_id" IS NULL)
        OR ("account_role_assignments"."role" = 'guardian' AND "account_role_assignments"."guardian_id" IS NOT NULL
          AND "account_role_assignments"."staff_user_id" IS NULL AND "account_role_assignments"."student_id" IS NULL)
        OR ("account_role_assignments"."role" = 'system_admin' AND "account_role_assignments"."student_id" IS NULL
          AND "account_role_assignments"."guardian_id" IS NULL)
      ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_account_role_assignments_account_role` ON `account_role_assignments` (`account_id`,`role`);--> statement-breakpoint
CREATE INDEX `idx_account_role_assignments_role_active` ON `account_role_assignments` (`role`,`active`);--> statement-breakpoint
CREATE TABLE `class_series_programs` (
	`class_series_id` text PRIMARY KEY NOT NULL,
	`program_id` text NOT NULL,
	FOREIGN KEY (`class_series_id`) REFERENCES `class_series`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_class_series_programs_program` ON `class_series_programs` (`program_id`);--> statement-breakpoint
CREATE TABLE `follow_up_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`student_id` text,
	`inquiry_id` text,
	`assignee_id` text NOT NULL,
	`task_type` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`due_at` text NOT NULL,
	`completion_note` text,
	`completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assignee_id`) REFERENCES `staff_users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_follow_up_tasks_type" CHECK("follow_up_tasks"."task_type" IN ('trial_follow_up','renewal','billing_exception','general')),
	CONSTRAINT "ck_follow_up_tasks_status" CHECK("follow_up_tasks"."status" IN ('open','completed','cancelled'))
);
--> statement-breakpoint
CREATE INDEX `idx_follow_up_tasks_assignee_status_due` ON `follow_up_tasks` (`assignee_id`,`status`,`due_at`);--> statement-breakpoint
CREATE INDEX `idx_follow_up_tasks_organization_status_due` ON `follow_up_tasks` (`organization_id`,`status`,`due_at`);--> statement-breakpoint
CREATE TABLE `inquiries` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`student_id` text NOT NULL,
	`guardian_id` text,
	`owner_admin_id` text NOT NULL,
	`source` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`notes` text,
	`next_follow_up_at` text,
	`lost_reason` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`guardian_id`) REFERENCES `guardians`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_admin_id`) REFERENCES `staff_users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_inquiries_status" CHECK("inquiries"."status" IN ('new','contacted','trial_scheduled','trial_completed','won','lost'))
);
--> statement-breakpoint
CREATE INDEX `idx_inquiries_owner_status_followup` ON `inquiries` (`owner_admin_id`,`status`,`next_follow_up_at`);--> statement-breakpoint
CREATE INDEX `idx_inquiries_student` ON `inquiries` (`student_id`);--> statement-breakpoint
CREATE INDEX `idx_inquiries_organization_status_followup` ON `inquiries` (`organization_id`,`status`,`next_follow_up_at`);--> statement-breakpoint
CREATE TABLE `integration_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`integration_type` text NOT NULL,
	`provider_name` text NOT NULL,
	`mode` text DEFAULT 'disabled' NOT NULL,
	`public_config_json` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'unknown' NOT NULL,
	`last_checked_at` text,
	`updated_by_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by_id`) REFERENCES `staff_users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_integration_configs_type" CHECK("integration_configs"."integration_type" IN ('identity','llm','payment','bank','email','sms','wechat')),
	CONSTRAINT "ck_integration_configs_mode" CHECK("integration_configs"."mode" IN ('disabled','sandbox','live')),
	CONSTRAINT "ck_integration_configs_status" CHECK("integration_configs"."status" IN ('healthy','degraded','unknown')),
	CONSTRAINT "ck_integration_configs_json" CHECK(json_valid("integration_configs"."public_config_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_integration_configs_type` ON `integration_configs` (`organization_id`,`integration_type`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`student_id` text,
	`guardian_id` text,
	`created_by_id` text,
	`channel` text NOT NULL,
	`subject` text,
	`body` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`sent_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`guardian_id`) REFERENCES `guardians`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_id`) REFERENCES `staff_users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_messages_channel" CHECK("messages"."channel" IN ('in_app','email','sms','wechat')),
	CONSTRAINT "ck_messages_status" CHECK("messages"."status" IN ('draft','queued','sent','failed','cancelled'))
);
--> statement-breakpoint
CREATE INDEX `idx_messages_student_status` ON `messages` (`student_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_messages_guardian_status` ON `messages` (`guardian_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_messages_organization_status_created` ON `messages` (`organization_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`student_id` text NOT NULL,
	`created_by_account_id` text,
	`order_type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`amount_cents` integer NOT NULL,
	`credit_quantity` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'AUD' NOT NULL,
	`description` text NOT NULL,
	`paid_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_account_id`) REFERENCES `user_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_orders_amount" CHECK("orders"."amount_cents" > 0),
	CONSTRAINT "ck_orders_credit_quantity" CHECK("orders"."credit_quantity" >= 0),
	CONSTRAINT "ck_orders_type" CHECK("orders"."order_type" IN ('credit_top_up','tuition','other')),
	CONSTRAINT "ck_orders_status" CHECK("orders"."status" IN ('pending','paid','partially_refunded','refunded','cancelled'))
);
--> statement-breakpoint
CREATE INDEX `idx_orders_student_status_created` ON `orders` (`student_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_orders_organization_status_created` ON `orders` (`organization_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `organization_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`setting_key` text NOT NULL,
	`value_json` text NOT NULL,
	`updated_by_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by_id`) REFERENCES `staff_users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_organization_settings_json" CHECK(json_valid("organization_settings"."value_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_organization_settings_key` ON `organization_settings` (`organization_id`,`setting_key`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`timezone` text DEFAULT 'Australia/Melbourne' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "ck_organizations_status" CHECK("organizations"."status" IN ('active','suspended'))
);
--> statement-breakpoint
CREATE TABLE `outbox_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_type` text NOT NULL,
	`aggregate_type` text NOT NULL,
	`aggregate_id` text NOT NULL,
	`dedupe_key` text,
	`payload_json` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` text,
	`last_error` text,
	`completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_outbox_events_attempts" CHECK("outbox_events"."attempts" >= 0),
	CONSTRAINT "ck_outbox_events_payload" CHECK(json_valid("outbox_events"."payload_json")),
	CONSTRAINT "ck_outbox_events_status" CHECK("outbox_events"."status" IN ('pending','processing','completed','failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_outbox_events_dedupe_key` ON `outbox_events` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `idx_outbox_events_status_next_attempt` ON `outbox_events` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `payment_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_event_id` text NOT NULL,
	`transaction_type` text NOT NULL,
	`status` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`raw_reference` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_payment_transactions_amount" CHECK("payment_transactions"."amount_cents" > 0),
	CONSTRAINT "ck_payment_transactions_type" CHECK("payment_transactions"."transaction_type" IN ('payment','refund')),
	CONSTRAINT "ck_payment_transactions_status" CHECK("payment_transactions"."status" IN ('succeeded','failed','pending'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_payment_transactions_provider_event` ON `payment_transactions` (`provider`,`provider_event_id`);--> statement-breakpoint
CREATE INDEX `idx_payment_transactions_order` ON `payment_transactions` (`order_id`);--> statement-breakpoint
CREATE TABLE `payroll_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`payroll_period_id` text,
	`lesson_session_id` text NOT NULL,
	`teacher_id` text NOT NULL,
	`session_kind` text NOT NULL,
	`minutes` integer NOT NULL,
	`base_amount_cents` integer NOT NULL,
	`adjustment_cents` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'accrued' NOT NULL,
	`note` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`payroll_period_id`) REFERENCES `payroll_periods`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lesson_session_id`) REFERENCES `lesson_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`teacher_id`) REFERENCES `staff_users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_payroll_entries_minutes" CHECK("payroll_entries"."minutes" > 0),
	CONSTRAINT "ck_payroll_entries_base_amount" CHECK("payroll_entries"."base_amount_cents" >= 0),
	CONSTRAINT "ck_payroll_entries_kind" CHECK("payroll_entries"."session_kind" IN ('regular','trial','makeup','private')),
	CONSTRAINT "ck_payroll_entries_status" CHECK("payroll_entries"."status" IN ('accrued','approved','paid','void'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_payroll_entries_session` ON `payroll_entries` (`lesson_session_id`);--> statement-breakpoint
CREATE INDEX `idx_payroll_entries_teacher_status` ON `payroll_entries` (`teacher_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_payroll_entries_period_status` ON `payroll_entries` (`payroll_period_id`,`status`);--> statement-breakpoint
CREATE TABLE `payroll_periods` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`starts_on` text NOT NULL,
	`ends_on` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`approved_by_id` text,
	`paid_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by_id`) REFERENCES `staff_users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_payroll_periods_dates" CHECK("payroll_periods"."starts_on" <= "payroll_periods"."ends_on"),
	CONSTRAINT "ck_payroll_periods_status" CHECK("payroll_periods"."status" IN ('open','approved','paid'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_payroll_periods_organization_dates` ON `payroll_periods` (`organization_id`,`starts_on`,`ends_on`);--> statement-breakpoint
CREATE TABLE `programs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`subject` text NOT NULL,
	`default_session_minutes` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_programs_session_minutes" CHECK("programs"."default_session_minutes" > 0),
	CONSTRAINT "ck_programs_active" CHECK("programs"."active" IN (0,1))
);
--> statement-breakpoint
CREATE INDEX `idx_programs_organization_active` ON `programs` (`organization_id`,`active`);--> statement-breakpoint
CREATE TABLE `refunds` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`requested_by_id` text NOT NULL,
	`approved_by_id` text,
	`status` text DEFAULT 'requested' NOT NULL,
	`amount_cents` integer NOT NULL,
	`reason` text NOT NULL,
	`completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requested_by_id`) REFERENCES `staff_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by_id`) REFERENCES `staff_users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_refunds_amount" CHECK("refunds"."amount_cents" > 0),
	CONSTRAINT "ck_refunds_status" CHECK("refunds"."status" IN ('requested','approved','completed','rejected'))
);
--> statement-breakpoint
CREATE INDEX `idx_refunds_order_status` ON `refunds` (`order_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_refunds_open_order` ON `refunds` (`order_id`) WHERE "refunds"."status" IN ('requested','approved','completed');--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`capacity` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_rooms_capacity" CHECK("rooms"."capacity" > 0),
	CONSTRAINT "ck_rooms_active" CHECK("rooms"."active" IN (0,1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_rooms_organization_name` ON `rooms` (`organization_id`,`name`);--> statement-breakpoint
CREATE TABLE `support_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`system_admin_account_id` text NOT NULL,
	`approved_by_id` text,
	`reason` text NOT NULL,
	`scope_json` text NOT NULL,
	`status` text DEFAULT 'requested' NOT NULL,
	`starts_at` text,
	`expires_at` text,
	`ended_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`system_admin_account_id`) REFERENCES `user_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by_id`) REFERENCES `staff_users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_support_sessions_scope" CHECK(json_valid("support_sessions"."scope_json")),
	CONSTRAINT "ck_support_sessions_status" CHECK("support_sessions"."status" IN ('requested','active','expired','revoked')),
	CONSTRAINT "ck_support_sessions_times" CHECK("support_sessions"."expires_at" IS NULL OR "support_sessions"."starts_at" IS NULL OR datetime("support_sessions"."starts_at") < datetime("support_sessions"."expires_at"))
);
--> statement-breakpoint
CREATE INDEX `idx_support_sessions_admin_status` ON `support_sessions` (`system_admin_account_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_support_sessions_organization_status_expiry` ON `support_sessions` (`organization_id`,`status`,`expires_at`);--> statement-breakpoint
CREATE TABLE `system_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`job_type` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`requested_by_account_id` text,
	`started_at` text,
	`finished_at` text,
	`last_error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requested_by_account_id`) REFERENCES `user_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_system_jobs_attempts" CHECK("system_jobs"."attempts" >= 0),
	CONSTRAINT "ck_system_jobs_payload" CHECK(json_valid("system_jobs"."payload_json")),
	CONSTRAINT "ck_system_jobs_status" CHECK("system_jobs"."status" IN ('queued','running','succeeded','failed'))
);
--> statement-breakpoint
CREATE INDEX `idx_system_jobs_status_created` ON `system_jobs` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_system_jobs_organization_status_created` ON `system_jobs` (`organization_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `teacher_pay_rates` (
	`id` text PRIMARY KEY NOT NULL,
	`teacher_id` text NOT NULL,
	`session_kind` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`starts_on` text NOT NULL,
	`ends_on` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`teacher_id`) REFERENCES `staff_users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_teacher_pay_rates_amount" CHECK("teacher_pay_rates"."amount_cents" >= 0),
	CONSTRAINT "ck_teacher_pay_rates_kind" CHECK("teacher_pay_rates"."session_kind" IN ('regular','trial','makeup','private')),
	CONSTRAINT "ck_teacher_pay_rates_dates" CHECK("teacher_pay_rates"."ends_on" IS NULL OR "teacher_pay_rates"."starts_on" <= "teacher_pay_rates"."ends_on")
);
--> statement-breakpoint
CREATE INDEX `idx_teacher_pay_rates_teacher_kind_start` ON `teacher_pay_rates` (`teacher_id`,`session_kind`,`starts_on`);--> statement-breakpoint
CREATE TABLE `trial_bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`inquiry_id` text NOT NULL,
	`lesson_session_id` text NOT NULL,
	`outcome` text DEFAULT 'pending' NOT NULL,
	`conversion_decision` text DEFAULT 'pending' NOT NULL,
	`raw_notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lesson_session_id`) REFERENCES `lesson_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_trial_bookings_outcome" CHECK("trial_bookings"."outcome" IN ('pending','attended','no_show','cancelled')),
	CONSTRAINT "ck_trial_bookings_conversion" CHECK("trial_bookings"."conversion_decision" IN ('pending','enrol','follow_up','not_fit'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_trial_bookings_inquiry_session` ON `trial_bookings` (`inquiry_id`,`lesson_session_id`);--> statement-breakpoint
CREATE INDEX `idx_trial_bookings_session` ON `trial_bookings` (`lesson_session_id`);--> statement-breakpoint
CREATE TABLE `user_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`auth_user_id` text NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_user_accounts_status" CHECK("user_accounts"."status" IN ('active','disabled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_user_accounts_auth_user_id` ON `user_accounts` (`auth_user_id`);--> statement-breakpoint
CREATE INDEX `idx_user_accounts_organization_status` ON `user_accounts` (`organization_id`,`status`);--> statement-breakpoint
ALTER TABLE `class_series` ADD `session_kind` text DEFAULT 'regular' NOT NULL;--> statement-breakpoint
ALTER TABLE `lesson_sessions` ADD `session_kind` text DEFAULT 'regular' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_lesson_sessions_date_status_time` ON `lesson_sessions` (`session_date`,`status`,`local_start_time`);--> statement-breakpoint
CREATE TRIGGER `trg_class_series_kind_insert`
BEFORE INSERT ON `class_series`
WHEN NEW.session_kind NOT IN ('regular','trial','makeup','private') OR NEW.active NOT IN (0,1)
BEGIN SELECT RAISE(ABORT, 'INVALID_CLASS_SERIES_POLICY'); END;--> statement-breakpoint
CREATE TRIGGER `trg_class_series_kind_update`
BEFORE UPDATE OF session_kind,active ON `class_series`
WHEN NEW.session_kind NOT IN ('regular','trial','makeup','private') OR NEW.active NOT IN (0,1)
BEGIN SELECT RAISE(ABORT, 'INVALID_CLASS_SERIES_POLICY'); END;--> statement-breakpoint
CREATE TRIGGER `trg_lesson_session_kind_insert`
BEFORE INSERT ON `lesson_sessions`
WHEN NEW.session_kind NOT IN ('regular','trial','makeup','private')
BEGIN SELECT RAISE(ABORT, 'INVALID_SESSION_KIND'); END;--> statement-breakpoint
CREATE TRIGGER `trg_lesson_session_kind_update`
BEFORE UPDATE OF session_kind ON `lesson_sessions`
WHEN NEW.session_kind NOT IN ('regular','trial','makeup','private')
BEGIN SELECT RAISE(ABORT, 'INVALID_SESSION_KIND'); END;--> statement-breakpoint
CREATE TRIGGER `trg_lesson_session_conflict_insert`
BEFORE INSERT ON `lesson_sessions`
WHEN NEW.status <> 'cancelled' AND EXISTS (
  SELECT 1 FROM lesson_sessions existing
  WHERE existing.teacher_id=NEW.teacher_id
    AND existing.session_date=NEW.session_date
    AND existing.status<>'cancelled'
    AND existing.local_start_time<NEW.local_end_time
    AND NEW.local_start_time<existing.local_end_time
)
BEGIN SELECT RAISE(ABORT, 'TEACHER_SCHEDULE_CONFLICT'); END;--> statement-breakpoint
CREATE TRIGGER `trg_lesson_session_conflict_update`
BEFORE UPDATE OF teacher_id,session_date,local_start_time,local_end_time,status ON `lesson_sessions`
WHEN NEW.status <> 'cancelled' AND EXISTS (
  SELECT 1 FROM lesson_sessions existing
  WHERE existing.id<>NEW.id AND existing.teacher_id=NEW.teacher_id
    AND existing.session_date=NEW.session_date
    AND existing.status<>'cancelled'
    AND existing.local_start_time<NEW.local_end_time
    AND NEW.local_start_time<existing.local_end_time
)
BEGIN SELECT RAISE(ABORT, 'TEACHER_SCHEDULE_CONFLICT'); END;--> statement-breakpoint
CREATE TRIGGER `trg_room_conflict_insert`
BEFORE INSERT ON `lesson_sessions`
WHEN NEW.status <> 'cancelled' AND EXISTS (
  SELECT 1 FROM lesson_sessions existing
  JOIN class_series existing_series ON existing_series.id=existing.class_series_id
  JOIN class_series new_series ON new_series.id=NEW.class_series_id
  WHERE existing_series.room=new_series.room
    AND existing.session_date=NEW.session_date
    AND existing.status<>'cancelled'
    AND existing.local_start_time<NEW.local_end_time
    AND NEW.local_start_time<existing.local_end_time
)
BEGIN SELECT RAISE(ABORT, 'ROOM_SCHEDULE_CONFLICT'); END;--> statement-breakpoint
CREATE TRIGGER `trg_room_conflict_update`
BEFORE UPDATE OF class_series_id,session_date,local_start_time,local_end_time,status ON `lesson_sessions`
WHEN NEW.status <> 'cancelled' AND EXISTS (
  SELECT 1 FROM lesson_sessions existing
  JOIN class_series existing_series ON existing_series.id=existing.class_series_id
  JOIN class_series new_series ON new_series.id=NEW.class_series_id
  WHERE existing.id<>NEW.id AND existing_series.room=new_series.room
    AND existing.session_date=NEW.session_date
    AND existing.status<>'cancelled'
    AND existing.local_start_time<NEW.local_end_time
    AND NEW.local_start_time<existing.local_end_time
)
BEGIN SELECT RAISE(ABORT, 'ROOM_SCHEDULE_CONFLICT'); END;--> statement-breakpoint
CREATE TRIGGER `trg_participant_schedule_conflict`
BEFORE INSERT ON `session_participants`
WHEN EXISTS (
  SELECT 1 FROM session_participants existing_participant
  JOIN lesson_sessions existing_session
    ON existing_session.id=existing_participant.lesson_session_id
  JOIN lesson_sessions new_session ON new_session.id=NEW.lesson_session_id
  WHERE existing_participant.student_id=NEW.student_id
    AND existing_participant.removed_at IS NULL
    AND existing_session.id<>new_session.id
    AND existing_session.session_date=new_session.session_date
    AND existing_session.status<>'cancelled' AND new_session.status<>'cancelled'
    AND existing_session.local_start_time<new_session.local_end_time
    AND new_session.local_start_time<existing_session.local_end_time
)
BEGIN SELECT RAISE(ABORT, 'STUDENT_SCHEDULE_CONFLICT'); END;--> statement-breakpoint
CREATE TRIGGER `trg_session_capacity`
BEFORE INSERT ON `session_participants`
WHEN (
  SELECT COUNT(*) FROM session_participants existing
  WHERE existing.lesson_session_id=NEW.lesson_session_id
    AND existing.removed_at IS NULL
) >= (
  SELECT series.capacity FROM lesson_sessions session
  JOIN class_series series ON series.id=session.class_series_id
  WHERE session.id=NEW.lesson_session_id
)
BEGIN SELECT RAISE(ABORT, 'CLASS_CAPACITY_EXCEEDED'); END;--> statement-breakpoint
CREATE TRIGGER `trg_audit_events_no_update`
BEFORE UPDATE ON `audit_events`
BEGIN SELECT RAISE(ABORT, 'AUDIT_EVENT_IMMUTABLE'); END;--> statement-breakpoint
CREATE TRIGGER `trg_audit_events_no_delete`
BEFORE DELETE ON `audit_events`
BEGIN SELECT RAISE(ABORT, 'AUDIT_EVENT_IMMUTABLE'); END;--> statement-breakpoint
CREATE TRIGGER `trg_credit_transactions_no_update`
BEFORE UPDATE ON `credit_transactions`
BEGIN SELECT RAISE(ABORT, 'CREDIT_LEDGER_IS_IMMUTABLE'); END;--> statement-breakpoint
CREATE TRIGGER `trg_credit_transactions_no_delete`
BEFORE DELETE ON `credit_transactions`
BEGIN SELECT RAISE(ABORT, 'CREDIT_LEDGER_IS_IMMUTABLE'); END;--> statement-breakpoint
CREATE TRIGGER `trg_payment_transactions_no_update`
BEFORE UPDATE ON `payment_transactions`
BEGIN SELECT RAISE(ABORT, 'PAYMENT_LEDGER_IMMUTABLE'); END;--> statement-breakpoint
CREATE TRIGGER `trg_payment_transactions_no_delete`
BEFORE DELETE ON `payment_transactions`
BEGIN SELECT RAISE(ABORT, 'PAYMENT_LEDGER_IMMUTABLE'); END;--> statement-breakpoint
CREATE TRIGGER `trg_attendance_identity_immutable`
BEFORE UPDATE OF lesson_session_id,student_id,status,recorded_by_id,recorded_at ON `attendance`
WHEN NEW.lesson_session_id<>OLD.lesson_session_id
  OR NEW.student_id<>OLD.student_id
  OR NEW.status<>OLD.status
  OR NEW.recorded_by_id<>OLD.recorded_by_id
  OR NEW.recorded_at<>OLD.recorded_at
BEGIN SELECT RAISE(ABORT, 'ATTENDANCE_IMMUTABLE'); END;--> statement-breakpoint
CREATE TRIGGER `trg_attendance_no_delete`
BEFORE DELETE ON `attendance`
BEGIN SELECT RAISE(ABORT, 'ATTENDANCE_IMMUTABLE'); END;--> statement-breakpoint
CREATE TRIGGER `trg_payroll_paid_immutable_update`
BEFORE UPDATE ON `payroll_entries`
WHEN OLD.status='paid'
BEGIN SELECT RAISE(ABORT, 'PAID_PAYROLL_IMMUTABLE'); END;--> statement-breakpoint
CREATE TRIGGER `trg_payroll_paid_immutable_delete`
BEFORE DELETE ON `payroll_entries`
WHEN OLD.status='paid'
BEGIN SELECT RAISE(ABORT, 'PAID_PAYROLL_IMMUTABLE'); END;
