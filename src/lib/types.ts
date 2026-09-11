export const attendanceStatuses = ['P', 'L', 'A'] as const
export type AttendanceStatus = (typeof attendanceStatuses)[number]

export const scheduleModes = ['inherit', 'custom'] as const
export type ScheduleMode = (typeof scheduleModes)[number]

export type Period = {
  id: string
  name: string
  startTime: string
  endTime: string
  order: number
  attendanceRequired: boolean
}

export type SchoolClass = {
  id: string
  name: string
  scheduleMode: ScheduleMode
  active: boolean
  periods?: Period[]
}

export type Student = {
  id: string
  displayName: string
  classId: string
  active: boolean
}

export type AttendanceSheet = {
  id?: string
  date: string
  classId: string
  periodId: string
  savedAt?: string
  entries: Record<string, AttendanceStatus>
}

export type Notice = {
  studentId: string
  studentName: string
  className: string
  consecutiveDays: number
  lastAbsentDate: string
}

export type Workspace = {
  school: {
    name: string
    timezone: string
    noticeThreshold: number
    multiPeriodEnabled: boolean
    meetingDays: number[]
  }
  periods: Period[]
  classes: SchoolClass[]
  students: Student[]
}
