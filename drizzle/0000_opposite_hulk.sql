CREATE TABLE `attendance` (
	`id` text PRIMARY KEY NOT NULL,
	`lesson_session_id` text NOT NULL,
	`student_id` text NOT NULL,
	`status` text NOT NULL,
	`recorded_by_id` text NOT NULL,
	`recorded_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`lesson_session_id`) REFERENCES `lesson_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recorded_by_id`) REFERENCES `staff_users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_attendance_status" CHECK("attendance"."status" IN ('present', 'late', 'absent'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_attendance_session_student` ON `attendance` (`lesson_session_id`,`student_id`);--> statement-breakpoint
CREATE INDEX `idx_attendance_student` ON `attendance` (`student_id`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `staff_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_audit_events_entity_created` ON `audit_events` (`entity_type`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `class_series` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`subject` text NOT NULL,
	`room` text NOT NULL,
	`weekday` integer NOT NULL,
	`local_start_time` text NOT NULL,
	`local_end_time` text NOT NULL,
	`timezone` text DEFAULT 'Australia/Melbourne' NOT NULL,
	`default_teacher_id` text NOT NULL,
	`capacity` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`default_teacher_id`) REFERENCES `staff_users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_class_series_weekday" CHECK("class_series"."weekday" BETWEEN 0 AND 6),
	CONSTRAINT "ck_class_series_capacity" CHECK("class_series"."capacity" > 0)
);
--> statement-breakpoint
CREATE INDEX `idx_class_series_teacher_weekday` ON `class_series` (`default_teacher_id`,`weekday`);--> statement-breakpoint
CREATE TABLE `credit_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_credit_accounts_student` ON `credit_accounts` (`student_id`);--> statement-breakpoint
CREATE TABLE `credit_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`kind` text NOT NULL,
	`quantity` integer NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`note` text,
	`created_by_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `credit_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_id`) REFERENCES `staff_users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_credit_transactions_quantity" CHECK("credit_transactions"."quantity" <> 0),
	CONSTRAINT "ck_credit_transactions_kind" CHECK("credit_transactions"."kind" IN ('purchase', 'attendance', 'adjustment', 'reversal'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_credit_transactions_source` ON `credit_transactions` (`account_id`,`kind`,`source_type`,`source_id`);--> statement-breakpoint
CREATE INDEX `idx_credit_transactions_account_created` ON `credit_transactions` (`account_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `enrollments` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`class_series_id` text NOT NULL,
	`starts_on` text NOT NULL,
	`ends_on` text,
	`status` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`class_series_id`) REFERENCES `class_series`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_enrollments_status" CHECK("enrollments"."status" IN ('active', 'ended'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_enrollments_student_series_start` ON `enrollments` (`student_id`,`class_series_id`,`starts_on`);--> statement-breakpoint
CREATE INDEX `idx_enrollments_series_status` ON `enrollments` (`class_series_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_enrollments_student_status` ON `enrollments` (`student_id`,`status`);--> statement-breakpoint
CREATE TABLE `guardians` (
	`id` text PRIMARY KEY NOT NULL,
	`full_name` text NOT NULL,
	`email` text,
	`phone` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `lesson_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`class_series_id` text NOT NULL,
	`teacher_id` text NOT NULL,
	`session_date` text NOT NULL,
	`local_start_time` text NOT NULL,
	`local_end_time` text NOT NULL,
	`timezone` text DEFAULT 'Australia/Melbourne' NOT NULL,
	`status` text NOT NULL,
	`raw_class_notes` text,
	`feedback_json` text,
	`completed_at` text,
	`completed_by_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`class_series_id`) REFERENCES `class_series`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`teacher_id`) REFERENCES `staff_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`completed_by_id`) REFERENCES `staff_users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_lesson_sessions_status" CHECK("lesson_sessions"."status" IN ('scheduled', 'completed', 'cancelled')),
	CONSTRAINT "ck_lesson_sessions_time_order" CHECK("lesson_sessions"."local_start_time" < "lesson_sessions"."local_end_time")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_lesson_sessions_series_date` ON `lesson_sessions` (`class_series_id`,`session_date`);--> statement-breakpoint
CREATE INDEX `idx_lesson_sessions_teacher_date` ON `lesson_sessions` (`teacher_id`,`session_date`);--> statement-breakpoint
CREATE TABLE `staff_users` (
	`id` text PRIMARY KEY NOT NULL,
	`auth_user_id` text NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "ck_staff_users_role" CHECK("staff_users"."role" IN ('teacher', 'admin', 'manager'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_staff_users_auth_user_id` ON `staff_users` (`auth_user_id`);--> statement-breakpoint
CREATE TABLE `student_guardians` (
	`student_id` text NOT NULL,
	`guardian_id` text NOT NULL,
	`relationship` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`guardian_id`) REFERENCES `guardians`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_student_guardians_pair` ON `student_guardians` (`student_id`,`guardian_id`);--> statement-breakpoint
CREATE INDEX `idx_student_guardians_guardian` ON `student_guardians` (`guardian_id`);--> statement-breakpoint
CREATE TABLE `students` (
	`id` text PRIMARY KEY NOT NULL,
	`legal_name` text NOT NULL,
	`preferred_name` text,
	`date_of_birth` text NOT NULL,
	`lifecycle_status` text NOT NULL,
	`owner_admin_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_admin_id`) REFERENCES `staff_users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_students_lifecycle_status" CHECK("students"."lifecycle_status" IN ('prospect', 'active', 'paused', 'inactive'))
);
--> statement-breakpoint
CREATE INDEX `idx_students_owner_status` ON `students` (`owner_admin_id`,`lifecycle_status`);