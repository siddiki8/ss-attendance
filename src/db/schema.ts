import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

const timestamps = {
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}

export const schoolSettings = sqliteTable('school_settings', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  timezone: text('timezone').notNull().default('America/New_York'),
  noticeThreshold: integer('notice_threshold').notNull().default(3),
  multiPeriodEnabled: integer('multi_period_enabled', { mode: 'boolean' }).notNull().default(true),
  ...timestamps,
})

export const meetingDays = sqliteTable('meeting_days', {
  id: text('id').primaryKey(),
  scheduleOwner: text('schedule_owner').notNull(),
  weekday: integer('weekday').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
})

export const periods = sqliteTable('periods', {
  id: text('id').primaryKey(),
  scheduleOwner: text('schedule_owner').notNull(),
  name: text('name').notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  sortOrder: integer('sort_order').notNull(),
  attendanceRequired: integer('attendance_required', { mode: 'boolean' }).notNull().default(true),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
})

export const classes = sqliteTable('classes', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  scheduleMode: text('schedule_mode', { enum: ['inherit', 'custom'] }).notNull().default('inherit'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  ...timestamps,
}, (table) => [uniqueIndex('classes_name_unique').on(table.name)])

export const students = sqliteTable('students', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  normalizedName: text('normalized_name').notNull(),
  classId: text('class_id').notNull().references(() => classes.id),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  ...timestamps,
}, (table) => [
  index('students_class_active_idx').on(table.classId, table.active),
  uniqueIndex('students_name_class_unique').on(table.normalizedName, table.classId),
])

export const attendanceSheets = sqliteTable('attendance_sheets', {
  id: text('id').primaryKey(),
  schoolDate: text('school_date').notNull(),
  classId: text('class_id').notNull().references(() => classes.id),
  periodId: text('period_id').notNull(),
  periodName: text('period_name').notNull(),
  periodOrder: integer('period_order').notNull(),
  submittedByUid: text('submitted_by_uid').notNull(),
  submittedByEmail: text('submitted_by_email').notNull(),
  submittedAt: text('submitted_at').notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex('attendance_sheets_date_class_period_unique').on(table.schoolDate, table.classId, table.periodId),
  index('attendance_sheets_class_date_idx').on(table.classId, table.schoolDate),
])

export const attendanceEntries = sqliteTable('attendance_entries', {
  id: text('id').primaryKey(),
  sheetId: text('sheet_id').notNull().references(() => attendanceSheets.id),
  studentId: text('student_id').notNull().references(() => students.id),
  status: text('status', { enum: ['P', 'L', 'A'] }).notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex('attendance_entries_sheet_student_unique').on(table.sheetId, table.studentId),
  index('attendance_entries_student_idx').on(table.studentId),
])
