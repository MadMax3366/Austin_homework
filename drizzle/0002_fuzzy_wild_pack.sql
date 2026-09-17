ALTER TABLE `lesson_sessions` ADD `completion_key` text;--> statement-breakpoint
ALTER TABLE `lesson_sessions` ADD `completion_hash` text;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_lesson_sessions_completion_key` ON `lesson_sessions` (`completion_key`);