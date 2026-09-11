import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { AttendanceStatus, Notice, Workspace } from '../lib/types'
import { adminMiddleware } from './auth'
import { getRawDb } from './db'

const statusSchema = z.enum(['P', 'L', 'A'])
const id = () => crypto.randomUUID()
const normalise = (name: string) => name.trim().toLocaleLowerCase().replace(/\s+/g, ' ')

type Row = Record<string, unknown>
const rows = <T extends Row>(result: D1Result<unknown>): T[] => (result.results ?? []) as T[]

function todayInTimeZone(timezone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())
}

function classPeriodOwner(classId: string) {
  return `class:${classId}`
}

async function resolvedPeriods(database: D1Database, classId: string) {
  const custom = rows<{ id: string; name: string; start_time: string; end_time: string; sort_order: number; attendance_required: number }>(
    await database.prepare('SELECT id, name, start_time, end_time, sort_order, attendance_required FROM periods WHERE schedule_owner = ? AND active = 1 ORDER BY sort_order').bind(classPeriodOwner(classId)).all(),
  )
  const source = custom.length ? custom : rows<{ id: string; name: string; start_time: string; end_time: string; sort_order: number; attendance_required: number }>(
    await database.prepare("SELECT id, name, start_time, end_time, sort_order, attendance_required FROM periods WHERE schedule_owner = 'school' AND active = 1 ORDER BY sort_order").all(),
  )
  return source.map((period) => ({
    id: period.id,
    name: period.name,
    startTime: period.start_time,
    endTime: period.end_time,
    order: period.sort_order,
    attendanceRequired: Boolean(period.attendance_required),
  }))
}

export const getWorkspace = createServerFn({ method: 'GET' })
  .middleware([adminMiddleware])
  .handler(async (): Promise<Workspace> => {
    const database = getRawDb()
    const [settingsResult, daysResult, periodResult, classResult, studentResult] = await database.batch([
      database.prepare('SELECT name, timezone, notice_threshold, multi_period_enabled FROM school_settings WHERE id = 1'),
      database.prepare("SELECT weekday FROM meeting_days WHERE schedule_owner = 'school' AND enabled = 1 ORDER BY weekday"),
      database.prepare("SELECT id, name, start_time, end_time, sort_order, attendance_required FROM periods WHERE schedule_owner = 'school' AND active = 1 ORDER BY sort_order"),
      database.prepare('SELECT id, name, schedule_mode, active FROM classes ORDER BY name'),
      database.prepare('SELECT id, display_name, class_id, active FROM students ORDER BY display_name'),
    ])
    const setting = rows<{ name: string; timezone: string; notice_threshold: number; multi_period_enabled: number }>(settingsResult)[0]
    if (!setting) throw new Error('School settings have not been initialized. Apply the D1 migration first.')
    const classes = rows<{ id: string; name: string; schedule_mode: 'inherit' | 'custom'; active: number }>(classResult)
    const loadedClasses = await Promise.all(classes.map(async (schoolClass) => ({
      id: schoolClass.id,
      name: schoolClass.name,
      scheduleMode: schoolClass.schedule_mode,
      active: Boolean(schoolClass.active),
      periods: await resolvedPeriods(database, schoolClass.id),
    })))
    return {
      school: {
        name: setting.name,
        timezone: setting.timezone,
        noticeThreshold: setting.notice_threshold,
        multiPeriodEnabled: Boolean(setting.multi_period_enabled),
        meetingDays: rows<{ weekday: number }>(daysResult).map((day) => day.weekday),
      },
      periods: rows<{ id: string; name: string; start_time: string; end_time: string; sort_order: number; attendance_required: number }>(periodResult).map((period) => ({
        id: period.id,
        name: period.name,
        startTime: period.start_time,
        endTime: period.end_time,
        order: period.sort_order,
        attendanceRequired: Boolean(period.attendance_required),
      })),
      classes: loadedClasses,
      students: rows<{ id: string; display_name: string; class_id: string; active: number }>(studentResult).map((student) => ({
        id: student.id,
        displayName: student.display_name,
        classId: student.class_id,
        active: Boolean(student.active),
      })),
    }
  })

export const getAttendanceSheet = createServerFn({ method: 'GET' })
  .middleware([adminMiddleware])
  .validator(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), classId: z.string().min(1), periodId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const database = getRawDb()
    const sheet = await database.prepare('SELECT id, submitted_at FROM attendance_sheets WHERE school_date = ? AND class_id = ? AND period_id = ?').bind(data.date, data.classId, data.periodId).first<{ id: string; submitted_at: string }>()
    if (!sheet) return { id: undefined, savedAt: undefined, entries: {} as Record<string, AttendanceStatus> }
    const entryRows = rows<{ student_id: string; status: AttendanceStatus }>(await database.prepare('SELECT student_id, status FROM attendance_entries WHERE sheet_id = ?').bind(sheet.id).all())
    return { id: sheet.id, savedAt: sheet.submitted_at, entries: Object.fromEntries(entryRows.map((entry) => [entry.student_id, entry.status])) }
  })

export const saveAttendanceSheet = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .validator(z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    classId: z.string().min(1),
    periodId: z.string().min(1),
    entries: z.record(z.string(), statusSchema),
  }))
  .handler(async ({ data, context }) => {
    const database = getRawDb()
    const students = rows<{ id: string }>(await database.prepare('SELECT id FROM students WHERE class_id = ? AND active = 1').bind(data.classId).all())
    const expected = students.map((student) => student.id).sort()
    const submitted = Object.keys(data.entries).sort()
    if (expected.length !== submitted.length || expected.some((student, index) => student !== submitted[index])) {
      throw new Error('Every active student in this class must receive P, L, or A before saving.')
    }
    const period = (await resolvedPeriods(database, data.classId)).find((item) => item.id === data.periodId)
    if (!period || !period.attendanceRequired) throw new Error('Choose an active attendance period for this class.')
    const sheetId = id()
    const now = new Date().toISOString()
    const statements: D1PreparedStatement[] = [
      database.prepare(`INSERT INTO attendance_sheets (id, school_date, class_id, period_id, period_name, period_order, submitted_by_uid, submitted_by_email, submitted_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(school_date, class_id, period_id) DO UPDATE SET submitted_by_uid = excluded.submitted_by_uid, submitted_by_email = excluded.submitted_by_email, submitted_at = excluded.submitted_at, updated_at = excluded.updated_at`)
        .bind(sheetId, data.date, data.classId, period.id, period.name, period.order, context.user.uid, context.user.email, now, now, now),
    ]
    const existing = await database.prepare('SELECT id FROM attendance_sheets WHERE school_date = ? AND class_id = ? AND period_id = ?').bind(data.date, data.classId, data.periodId).first<{ id: string }>()
    const finalSheetId = existing?.id ?? sheetId
    for (const [studentId, status] of Object.entries(data.entries)) {
      statements.push(database.prepare(`INSERT INTO attendance_entries (id, sheet_id, student_id, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(sheet_id, student_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`)
        .bind(id(), finalSheetId, studentId, status, now, now))
    }
    await database.batch(statements)
    return { id: finalSheetId, savedAt: now }
  })

export const saveStudent = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .validator(z.object({ id: z.string().optional(), displayName: z.string().trim().min(1).max(120), classId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const database = getRawDb()
    const now = new Date().toISOString()
    const studentId = data.id ?? id()
    await database.prepare(`INSERT INTO students (id, display_name, normalized_name, class_id, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name, normalized_name = excluded.normalized_name, class_id = excluded.class_id, active = 1, updated_at = excluded.updated_at`)
      .bind(studentId, data.displayName.trim(), normalise(data.displayName), data.classId, now, now).run()
    return { id: studentId }
  })

export const archiveStudent = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .validator(z.object({ id: z.string().min(1), active: z.boolean() }))
  .handler(async ({ data }) => {
    const database = getRawDb()
    await database.prepare('UPDATE students SET active = ?, updated_at = ? WHERE id = ?').bind(data.active ? 1 : 0, new Date().toISOString(), data.id).run()
    return { ok: true }
  })

export const saveClass = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .validator(z.object({ id: z.string().optional(), name: z.string().trim().min(1).max(64), scheduleMode: z.enum(['inherit', 'custom']) }))
  .handler(async ({ data }) => {
    const database = getRawDb()
    const classId = data.id ?? id()
    const now = new Date().toISOString()
    await database.prepare(`INSERT INTO classes (id, name, schedule_mode, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, schedule_mode = excluded.schedule_mode, updated_at = excluded.updated_at`)
      .bind(classId, data.name.trim(), data.scheduleMode, now, now).run()
    if (data.scheduleMode === 'custom') {
      const existing = await database.prepare('SELECT id FROM periods WHERE schedule_owner = ? LIMIT 1').bind(classPeriodOwner(classId)).first()
      if (!existing) {
        const global = await resolvedPeriods(database, classId)
        await database.batch(global.map((period) => database.prepare('INSERT INTO periods (id, schedule_owner, name, start_time, end_time, sort_order, attendance_required, active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)')
          .bind(id(), classPeriodOwner(classId), period.name, period.startTime, period.endTime, period.order, period.attendanceRequired ? 1 : 0)))
      }
    }
    return { id: classId }
  })

export const saveSchedule = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .validator(z.object({
    classId: z.string().nullable(),
    meetingDays: z.array(z.number().int().min(0).max(6)).min(1),
    multiPeriodEnabled: z.boolean(),
    periods: z.array(z.object({
      id: z.string().optional(),
      name: z.string().trim().min(1).max(64),
      startTime: z.string().regex(/^\d{2}:\d{2}$/),
      endTime: z.string().regex(/^\d{2}:\d{2}$/),
      attendanceRequired: z.boolean(),
    })).min(1),
  }))
  .handler(async ({ data }) => {
    const database = getRawDb()
    const owner = data.classId ? classPeriodOwner(data.classId) : 'school'
    if (data.classId) {
      const schoolClass = await database.prepare('SELECT id FROM classes WHERE id = ? AND active = 1').bind(data.classId).first()
      if (!schoolClass) throw new Error('That class is no longer active.')
      await database.prepare("UPDATE classes SET schedule_mode = 'custom', updated_at = ? WHERE id = ?").bind(new Date().toISOString(), data.classId).run()
    } else {
      await database.prepare('UPDATE school_settings SET multi_period_enabled = ?, updated_at = ? WHERE id = 1').bind(data.multiPeriodEnabled ? 1 : 0, new Date().toISOString()).run()
    }
    const statements: D1PreparedStatement[] = [
      database.prepare('DELETE FROM periods WHERE schedule_owner = ?').bind(owner),
      database.prepare('DELETE FROM meeting_days WHERE schedule_owner = ?').bind(owner),
      ...data.meetingDays.map((weekday) => database.prepare('INSERT INTO meeting_days (id, schedule_owner, weekday, enabled) VALUES (?, ?, ?, 1)').bind(id(), owner, weekday)),
      ...data.periods.map((period, order) => database.prepare('INSERT INTO periods (id, schedule_owner, name, start_time, end_time, sort_order, attendance_required, active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)')
        .bind(id(), owner, period.name.trim(), period.startTime, period.endTime, order + 1, period.attendanceRequired ? 1 : 0)),
    ]
    await database.batch(statements)
    return { ok: true }
  })

export const importStudents = createServerFn({ method: 'POST' })
  .middleware([adminMiddleware])
  .validator(z.object({ rows: z.array(z.object({ displayName: z.string().trim().min(1).max(120), classId: z.string().min(1) })).min(1).max(1000) }))
  .handler(async ({ data }) => {
    const database = getRawDb()
    const now = new Date().toISOString()
    const seen = new Set<string>()
    const uniqueRows = data.rows.filter((student) => {
      const key = `${student.classId}:${normalise(student.displayName)}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    const existing = rows<{ normalized_name: string; class_id: string }>(await database.prepare('SELECT normalized_name, class_id FROM students').all())
    const existingKeys = new Set(existing.map((student) => `${student.class_id}:${student.normalized_name}`))
    const accepted = uniqueRows.filter((student) => !existingKeys.has(`${student.classId}:${normalise(student.displayName)}`))
    await database.batch(accepted.map((student) => database.prepare('INSERT INTO students (id, display_name, normalized_name, class_id, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)')
      .bind(id(), student.displayName.trim(), normalise(student.displayName), student.classId, now, now)))
    return { created: accepted.length, skipped: data.rows.length - accepted.length }
  })

export const getNotices = createServerFn({ method: 'GET' })
  .middleware([adminMiddleware])
  .handler(async (): Promise<Notice[]> => {
    const database = getRawDb()
    const settings = await database.prepare('SELECT timezone, notice_threshold FROM school_settings WHERE id = 1').first<{ timezone: string; notice_threshold: number }>()
    if (!settings) throw new Error('School settings have not been initialized.')
    const [dayResult, classResult, studentResult] = await database.batch([
      database.prepare("SELECT weekday FROM meeting_days WHERE schedule_owner = 'school' AND enabled = 1"),
      database.prepare('SELECT id, name FROM classes WHERE active = 1'),
      database.prepare('SELECT id, display_name, class_id FROM students WHERE active = 1'),
    ])
    const workspace = {
      school: { timezone: settings.timezone, noticeThreshold: settings.notice_threshold, meetingDays: rows<{ weekday: number }>(dayResult).map((day) => day.weekday) },
      classes: rows<{ id: string; name: string }>(classResult),
      students: rows<{ id: string; display_name: string; class_id: string }>(studentResult).map((student) => ({ id: student.id, displayName: student.display_name, classId: student.class_id, active: true })),
    }
    const today = todayInTimeZone(workspace.school.timezone)
    const start = new Date(`${today}T00:00:00Z`)
    start.setUTCDate(start.getUTCDate() - 45)
    const earliest = start.toISOString().slice(0, 10)
    const records = rows<{ school_date: string; student_id: string; status: AttendanceStatus; period_id: string; class_id: string }>(await database.prepare(`SELECT s.school_date, e.student_id, e.status, s.period_id, s.class_id
      FROM attendance_sheets s JOIN attendance_entries e ON e.sheet_id = s.id WHERE s.school_date >= ? AND s.school_date <= ?`).bind(earliest, today).all())
    const classById = new Map(workspace.classes.map((item) => [item.id, item]))
    const notices: Notice[] = []
    for (const student of workspace.students.filter((item) => item.active)) {
      const schoolClass = classById.get(student.classId)
      if (!schoolClass) continue
      const required = (await resolvedPeriods(database, student.classId)).filter((period) => period.attendanceRequired).map((period) => period.id)
      let streak = 0
      let lastAbsentDate = ''
      for (let offset = 0; offset < 45; offset += 1) {
        const date = new Date(`${today}T00:00:00Z`)
        date.setUTCDate(date.getUTCDate() - offset)
        const localDate = date.toISOString().slice(0, 10)
        if (!workspace.school.meetingDays.includes(date.getUTCDay())) continue
        const byPeriod = records.filter((record) => record.student_id === student.id && record.school_date === localDate && record.class_id === student.classId)
        if (required.length === 0 || required.some((periodId) => !byPeriod.some((record) => record.period_id === periodId)) || byPeriod.some((record) => record.status !== 'A')) break
        if (!lastAbsentDate) lastAbsentDate = localDate
        streak += 1
      }
      if (streak >= workspace.school.noticeThreshold) notices.push({ studentId: student.id, studentName: student.displayName, className: schoolClass.name, consecutiveDays: streak, lastAbsentDate })
    }
    return notices.sort((a, b) => b.consecutiveDays - a.consecutiveDays || a.studentName.localeCompare(b.studentName))
  })
