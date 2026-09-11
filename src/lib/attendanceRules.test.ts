import { describe, expect, it } from 'vitest'
import { countConsecutiveAbsences, isCompleteAttendance, normaliseStudentName } from './attendanceRules'

describe('attendance rules', () => {
  it('requires an explicit P, L, or A for each active student', () => {
    expect(isCompleteAttendance(['a', 'b'], { a: 'P', b: 'L' })).toBe(true)
    expect(isCompleteAttendance(['a', 'b'], { a: 'P' })).toBe(false)
  })

  it('counts only complete days that are absent in every required period', () => {
    expect(countConsecutiveAbsences([
      { scheduled: true, complete: true, statuses: ['A', 'A'] },
      { scheduled: false, complete: false, statuses: [] },
      { scheduled: true, complete: true, statuses: ['A', 'A'] },
      { scheduled: true, complete: true, statuses: ['A', 'L'] },
    ])).toBe(2)
  })

  it('normalises CSV names before duplicate checks', () => {
    expect(normaliseStudentName('  Amina   Khan  ')).toBe('amina khan')
  })
})
