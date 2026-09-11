CREATE TABLE `attendance_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`sheet_id` text NOT NULL,
	`student_id` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`sheet_id`) REFERENCES `attendance_sheets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_entries_sheet_student_unique` ON `attendance_entries` (`sheet_id`,`student_id`);--> statement-breakpoint
CREATE INDEX `attendance_entries_student_idx` ON `attendance_entries` (`student_id`);--> statement-breakpoint
CREATE TABLE `attendance_sheets` (
	`id` text PRIMARY KEY NOT NULL,
	`school_date` text NOT NULL,
	`class_id` text NOT NULL,
	`period_id` text NOT NULL,
	`period_name` text NOT NULL,
	`period_order` integer NOT NULL,
	`submitted_by_uid` text NOT NULL,
	`submitted_by_email` text NOT NULL,
	`submitted_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_sheets_date_class_period_unique` ON `attendance_sheets` (`school_date`,`class_id`,`period_id`);--> statement-breakpoint
CREATE INDEX `attendance_sheets_class_date_idx` ON `attendance_sheets` (`class_id`,`school_date`);--> statement-breakpoint
CREATE TABLE `classes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`schedule_mode` text DEFAULT 'inherit' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `classes_name_unique` ON `classes` (`name`);--> statement-breakpoint
CREATE TABLE `meeting_days` (
	`id` text PRIMARY KEY NOT NULL,
	`schedule_owner` text NOT NULL,
	`weekday` integer NOT NULL,
	`enabled` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `periods` (
	`id` text PRIMARY KEY NOT NULL,
	`schedule_owner` text NOT NULL,
	`name` text NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`sort_order` integer NOT NULL,
	`attendance_required` integer DEFAULT true NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `school_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`timezone` text DEFAULT 'America/New_York' NOT NULL,
	`notice_threshold` integer DEFAULT 3 NOT NULL,
	`multi_period_enabled` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `students` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`class_id` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `students_class_active_idx` ON `students` (`class_id`,`active`);--> statement-breakpoint
CREATE UNIQUE INDEX `students_name_class_unique` ON `students` (`normalized_name`,`class_id`);
--> statement-breakpoint
INSERT INTO school_settings (id, name, timezone, notice_threshold, multi_period_enabled) VALUES (1, 'My School', 'America/New_York', 3, 1);
--> statement-breakpoint
INSERT INTO meeting_days (id, schedule_owner, weekday, enabled) VALUES
  ('school-mon', 'school', 1, 1), ('school-tue', 'school', 2, 1), ('school-wed', 'school', 3, 1), ('school-thu', 'school', 4, 1), ('school-fri', 'school', 5, 1);
--> statement-breakpoint
INSERT INTO periods (id, schedule_owner, name, start_time, end_time, sort_order, attendance_required, active) VALUES
  ('school-p1', 'school', 'Period 1', '08:30', '09:30', 1, 1, 1),
  ('school-recess', 'school', 'Recess', '10:30', '10:45', 2, 0, 1),
  ('school-p2', 'school', 'Period 2', '10:45', '11:45', 3, 1, 1);
