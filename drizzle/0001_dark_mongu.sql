ALTER TABLE `attendance`
ADD COLUMN `billing_status` text DEFAULT 'not_charged' NOT NULL
CHECK(`billing_status` IN ('charged', 'not_charged', 'pending_insufficient_credit'));
