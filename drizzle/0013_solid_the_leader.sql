CREATE TABLE `teacher_leave_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`teacher_id` text NOT NULL,
	`starts_on` text NOT NULL,
	`ends_on` text NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'requested' NOT NULL,
	`requested_by_account_id` text NOT NULL,
	`decided_by_id` text,
	`decided_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`teacher_id`) REFERENCES `staff_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requested_by_account_id`) REFERENCES `user_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`decided_by_id`) REFERENCES `staff_users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_teacher_leave_status" CHECK("teacher_leave_requests"."status" IN ('requested','approved','rejected','cancelled')),
	CONSTRAINT "ck_teacher_leave_date_order" CHECK("teacher_leave_requests"."starts_on" <= "teacher_leave_requests"."ends_on")
);
--> statement-breakpoint
CREATE INDEX `idx_teacher_leave_teacher_dates` ON `teacher_leave_requests` (`teacher_id`,`starts_on`,`ends_on`);--> statement-breakpoint
CREATE INDEX `idx_teacher_leave_status_dates` ON `teacher_leave_requests` (`status`,`starts_on`);--> statement-breakpoint
CREATE TABLE `teacher_substitutions` (
	`id` text PRIMARY KEY NOT NULL,
	`leave_request_id` text,
	`lesson_session_id` text NOT NULL,
	`original_teacher_id` text NOT NULL,
	`substitute_teacher_id` text NOT NULL,
	`assigned_by_id` text NOT NULL,
	`status` text DEFAULT 'assigned' NOT NULL,
	`reason` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`leave_request_id`) REFERENCES `teacher_leave_requests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lesson_session_id`) REFERENCES `lesson_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`original_teacher_id`) REFERENCES `staff_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`substitute_teacher_id`) REFERENCES `staff_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_by_id`) REFERENCES `staff_users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_teacher_substitution_status" CHECK("teacher_substitutions"."status" IN ('assigned','completed','cancelled')),
	CONSTRAINT "ck_teacher_substitution_distinct" CHECK("teacher_substitutions"."original_teacher_id" <> "teacher_substitutions"."substitute_teacher_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_teacher_substitution_session` ON `teacher_substitutions` (`lesson_session_id`);--> statement-breakpoint
CREATE INDEX `idx_teacher_substitution_teacher_status` ON `teacher_substitutions` (`substitute_teacher_id`,`status`);