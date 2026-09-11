import type { AttendanceStatus } from './types'

export function isCompleteAttendance(studentIds: string[], entries: Record<string, AttendanceStatus>) {
  return studentIds.length > 0 && studentIds.every((studentId) => entries[studentId] === 'P' || entries[studentId] === 'L' || entries[studentId] === 'A')
}

export function countConsecutiveAbsences(days: Array<{ scheduled: boolean; complete: boolean; statuses: AttendanceStatus[] }>) {
  let streak = 0
  for (const day of days) {
    if (!day.scheduled) continue
    if (!day.complete || !day.statuses.length || day.statuses.some((status) => status !== 'A')) break
    streak += 1
  }
  return streak
}

export function normaliseStudentName(name: string) {
  return name.trim().toLocaleLowerCase().replace(/\s+/g, ' ')
}
