CREATE TABLE `ai_generations` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`lesson_session_id` text NOT NULL,
	`input_hash` text NOT NULL,
	`source` text NOT NULL,
	`status` text NOT NULL,
	`error_code` text,
	`latency_ms` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `staff_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lesson_session_id`) REFERENCES `lesson_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_ai_generations_source" CHECK("ai_generations"."source" IN ('ai', 'fallback')),
	CONSTRAINT "ck_ai_generations_status" CHECK("ai_generations"."status" IN ('succeeded', 'fallback'))
);
--> statement-breakpoint
CREATE INDEX `idx_ai_generations_actor_created` ON `ai_generations` (`actor_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `ai_rate_limit_buckets` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`subject_id` text NOT NULL,
	`bucket_start` text NOT NULL,
	`request_count` integer DEFAULT 1 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "ck_ai_rate_limit_scope" CHECK("ai_rate_limit_buckets"."scope" IN ('teacher_minute', 'session_day')),
	CONSTRAINT "ck_ai_rate_limit_count" CHECK("ai_rate_limit_buckets"."request_count" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_ai_rate_limit_scope_subject_bucket` ON `ai_rate_limit_buckets` (`scope`,`subject_id`,`bucket_start`);--> statement-breakpoint
CREATE TABLE `billing_exception_resolution_claims` (
	`billing_exception_id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`expected_version` integer NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`action` text NOT NULL,
	`state` text DEFAULT 'processing' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`billing_exception_id`) REFERENCES `billing_exceptions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `staff_users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_billing_resolution_action" CHECK("billing_exception_resolution_claims"."action" IN ('charge', 'waive')),
	CONSTRAINT "ck_billing_resolution_state" CHECK("billing_exception_resolution_claims"."state" IN ('processing', 'completed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_billing_resolution_actor_idempotency` ON `billing_exception_resolution_claims` (`actor_id`,`idempotency_key`);--> statement-breakpoint
CREATE TABLE `billing_exceptions` (
	`id` text PRIMARY KEY NOT NULL,
	`attendance_id` text NOT NULL,
	`student_id` text NOT NULL,
	`account_id` text NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`resolution_note` text,
	`resolution_type` text,
	`resolution_transaction_id` text,
	`assigned_to_id` text,
	`resolved_by_id` text,
	`resolved_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`attendance_id`) REFERENCES `attendance`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `credit_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resolution_transaction_id`) REFERENCES `credit_transactions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_to_id`) REFERENCES `staff_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resolved_by_id`) REFERENCES `staff_users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_billing_exceptions_reason" CHECK("billing_exceptions"."reason" = 'insufficient_credit'),
	CONSTRAINT "ck_billing_exceptions_status" CHECK("billing_exceptions"."status" IN ('open', 'resolved', 'waived', 'cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_billing_exceptions_attendance` ON `billing_exceptions` (`attendance_id`);--> statement-breakpoint
CREATE INDEX `idx_billing_exceptions_status_created` ON `billing_exceptions` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `session_completion_claims` (
	`lesson_session_id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`expected_version` integer NOT NULL,
	`operation` text DEFAULT 'complete_class' NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`state` text DEFAULT 'processing' NOT NULL,
	`response_schema_version` integer DEFAULT 1 NOT NULL,
	`response_json` text,
	`completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`lesson_session_id`) REFERENCES `lesson_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `staff_users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_completion_claims_operation" CHECK("session_completion_claims"."operation" = 'complete_class'),
	CONSTRAINT "ck_completion_claims_state" CHECK("session_completion_claims"."state" IN ('processing', 'completed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_completion_claims_actor_operation_idempotency` ON `session_completion_claims` (`actor_id`,`operation`,`idempotency_key`);--> statement-breakpoint
CREATE TABLE `session_participants` (
	`id` text PRIMARY KEY NOT NULL,
	`lesson_session_id` text NOT NULL,
	`student_id` text NOT NULL,
	`enrollment_id` text,
	`credit_account_id` text NOT NULL,
	`display_name` text NOT NULL,
	`date_of_birth` text NOT NULL,
	`is_new` integer DEFAULT false NOT NULL,
	`source` text DEFAULT 'enrollment' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`removed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`lesson_session_id`) REFERENCES `lesson_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`credit_account_id`) REFERENCES `credit_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_session_participants_source" CHECK("session_participants"."source" IN ('enrollment', 'trial', 'makeup', 'manual'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_session_participants_session_student` ON `session_participants` (`lesson_session_id`,`student_id`);--> statement-breakpoint
CREATE INDEX `idx_session_participants_student` ON `session_participants` (`student_id`);--> statement-breakpoint
ALTER TABLE `lesson_sessions` ADD `roster_frozen_at` text;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_enrollments_active_student_series` ON `enrollments` (`student_id`,`class_series_id`) WHERE "enrollments"."status" = 'active';