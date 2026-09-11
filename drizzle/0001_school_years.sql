CREATE TABLE `school_years` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`active` integer DEFAULT false NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`archived_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `school_years_name_unique` ON `school_years` (`name`);
--> statement-breakpoint
CREATE INDEX `school_years_active_idx` ON `school_years` (`active`,`archived`);
--> statement-breakpoint
INSERT INTO `school_years` (`id`, `name`, `start_date`, `end_date`, `active`, `archived`)
VALUES ('legacy-school-year', '2026–2027', '2026-07-01', '2027-06-30', 1, 0);
--> statement-breakpoint
ALTER TABLE `students` ADD COLUMN `school_year_id` text REFERENCES `school_years`(`id`);
--> statement-breakpoint
UPDATE `students` SET `school_year_id` = 'legacy-school-year' WHERE `school_year_id` IS NULL;
--> statement-breakpoint
DROP INDEX `students_name_class_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX `students_name_class_year_unique` ON `students` (`normalized_name`,`class_id`,`school_year_id`);
--> statement-breakpoint
ALTER TABLE `attendance_sheets` ADD COLUMN `school_year_id` text REFERENCES `school_years`(`id`);
--> statement-breakpoint
UPDATE `attendance_sheets` SET `school_year_id` = 'legacy-school-year' WHERE `school_year_id` IS NULL;
--> statement-breakpoint
DROP INDEX `attendance_sheets_date_class_period_unique`;
--> statement-breakpoint
DROP INDEX `attendance_sheets_class_date_idx`;
--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_sheets_year_date_class_period_unique` ON `attendance_sheets` (`school_year_id`,`school_date`,`class_id`,`period_id`);
--> statement-breakpoint
CREATE INDEX `attendance_sheets_year_class_date_idx` ON `attendance_sheets` (`school_year_id`,`class_id`,`school_date`);
