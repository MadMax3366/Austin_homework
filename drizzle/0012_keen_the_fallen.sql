CREATE TABLE `account_credentials` (
	`account_id` text PRIMARY KEY NOT NULL,
	`password_salt` text NOT NULL,
	`password_hash` text NOT NULL,
	`iterations` integer NOT NULL,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` text,
	`password_updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `user_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_account_credentials_iterations" CHECK("account_credentials"."iterations" BETWEEN 100000 AND 1000000),
	CONSTRAINT "ck_account_credentials_failed_attempts" CHECK("account_credentials"."failed_attempts" BETWEEN 0 AND 20)
);
--> statement-breakpoint
CREATE TABLE `account_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `user_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_account_sessions_account_expiry` ON `account_sessions` (`account_id`,`expires_at`);