CREATE TABLE `faq_interactions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`account_id` text NOT NULL,
	`student_id` text,
	`question_text` text NOT NULL,
	`faq_id` text,
	`category` text NOT NULL,
	`resolution` text NOT NULL,
	`source` text NOT NULL,
	`answer_text` text,
	`handoff_task_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `user_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`handoff_task_id`) REFERENCES `follow_up_tasks`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_faq_interactions_category" CHECK("faq_interactions"."category" IN ('schedule','trial','credits','attendance','feedback','payment','account','other')),
	CONSTRAINT "ck_faq_interactions_resolution" CHECK("faq_interactions"."resolution" IN ('answered','handoff')),
	CONSTRAINT "ck_faq_interactions_source" CHECK("faq_interactions"."source" IN ('ai','fallback','policy')),
	CONSTRAINT "ck_faq_interactions_answer_shape" CHECK(("faq_interactions"."resolution"='answered' AND "faq_interactions"."answer_text" IS NOT NULL AND "faq_interactions"."faq_id" IS NOT NULL AND "faq_interactions"."handoff_task_id" IS NULL)
          OR ("faq_interactions"."resolution"='handoff' AND "faq_interactions"."answer_text" IS NULL AND "faq_interactions"."handoff_task_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `idx_faq_interactions_account_created` ON `faq_interactions` (`account_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_faq_interactions_resolution_created` ON `faq_interactions` (`resolution`,`created_at`);