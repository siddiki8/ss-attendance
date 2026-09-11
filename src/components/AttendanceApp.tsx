import { Link } from '@tanstack/react-router'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { Archive, CalendarDays, CalendarRange, Check, ChevronLeft, ChevronRight, ClipboardCheck, CloudUpload, Download, FileSpreadsheet, GraduationCap, LogOut, Menu, Moon, Plus, Save, Search, ShieldCheck, Sparkles, Sun, Users, X } from 'lucide-react'
import { type CSSProperties, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { firebaseAuth, firebaseConfigured, signInWithGoogle, signOutOfFirebase } from '../lib/firebase'
import { useAttendanceWebMcp } from '../lib/useAttendanceWebMcp'
import type { AttendanceStatus, Notice, SchoolYear, Workspace } from '../lib/types'
import { activateSchoolYear, archiveSchoolYear, archiveStudent, createSchoolYear, getAttendanceSheet, getNotices, getWorkspace, importStudents, saveAttendanceSheet, saveClass, saveSchedule, saveStudent } from '../server/actions'

type Tab = 'attendance' | 'notices' | 'students' | 'classes' | 'years' | 'schedule' | 'import'
const tabs: Array<{ id: Tab; label: string; icon: typeof ClipboardCheck }> = [
  { id: 'attendance', label: 'Attendance', icon: ClipboardCheck },
  { id: 'notices', label: 'Notices', icon: ShieldCheck },
  { id: 'students', label: 'Students', icon: Users },
  { id: 'classes', label: 'Classes', icon: GraduationCap },
  { id: 'years', label: 'School years', icon: CalendarRange },
  { id: 'schedule', label: 'Schedule', icon: CalendarDays },
  { id: 'import', label: 'CSV import', icon: CloudUpload },
]

const isoToday = () => new Intl.DateTimeFormat('en-CA').format(new Date())
const statusStyle: Record<AttendanceStatus, string> = { P: 'status-present', L: 'status-late', A: 'status-absent' }
const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const isScheduledSchoolDate = (date: string, meetingDays: number[]) => meetingDays.includes(new Date(`${date}T12:00:00Z`).getUTCDay())
const stepToScheduledSchoolDate = (date: string, meetingDays: number[], direction: -1 | 1, minDate?: string, maxDate?: string) => {
  const next = new Date(`${date}T12:00:00Z`)
  for (let attempts = 0; attempts < 14; attempts += 1) {
    next.setUTCDate(next.getUTCDate() + direction)
    const candidate = next.toISOString().slice(0, 10)
    if ((minDate && candidate < minDate) || (maxDate && candidate > maxDate)) return date
    if (isScheduledSchoolDate(candidate, meetingDays)) return candidate
  }
  return date
}
const previewSchoolYear: SchoolYear = { id: 'year-2026', name: '2026–2027', startDate: '2026-07-01', endDate: '2027-06-30', active: true, archived: false }
const previewWorkspace: Workspace = {
  school: { name: 'Cedar Grove School', timezone: 'America/New_York', noticeThreshold: 3, multiPeriodEnabled: true, meetingDays: [1, 2, 3, 4, 5] },
  periods: [
    { id: 'p1', name: 'Homeroom', startTime: '08:00', endTime: '08:30', order: 1, attendanceRequired: true },
    { id: 'recess', name: 'Recess', startTime: '10:30', endTime: '10:45', order: 2, attendanceRequired: false },
    { id: 'p2', name: 'Period 2', startTime: '10:45', endTime: '11:45', order: 3, attendanceRequired: true },
    { id: 'p3', name: 'Period 3', startTime: '12:30', endTime: '13:30', order: 4, attendanceRequired: true },
  ],
  classes: [{ id: '1a', name: '1A', scheduleMode: 'inherit', active: true }],
  students: [
    { id: 's1', displayName: 'Amina Khan', classId: '1a', schoolYearId: previewSchoolYear.id, active: true },
    { id: 's2', displayName: 'Elias Walker', classId: '1a', schoolYearId: previewSchoolYear.id, active: true },
    { id: 's3', displayName: 'Maya Rodriguez', classId: '1a', schoolYearId: previewSchoolYear.id, active: true },
  ],
  schoolYears: [previewSchoolYear, { id: 'year-2025', name: '2025–2026', startDate: '2025-07-01', endDate: '2026-06-30', active: false, archived: true }],
  activeSchoolYear: previewSchoolYear,
}

export default function AttendanceApp() {
  const [previewMode, setPreviewMode] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [tab, setTab] = useState<Tab>('attendance')
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)

  const refresh = useCallback(async () => {
    if (previewMode || !firebaseAuth?.currentUser) return
    setLoading(true)
    setError('')
    try { setWorkspace(await getWorkspace()) } catch (cause) { setError(cause instanceof Error ? cause.message : 'We could not load your school workspace.') }
    finally { setLoading(false) }
  }, [previewMode])

  useEffect(() => {
    const previewRequested = import.meta.env.DEV && new URLSearchParams(window.location.search).has('preview')
    if (previewRequested && !previewMode) {
      setPreviewMode(true)
      setUser({ displayName: 'Preview admin', email: 'admin@example.com' } as User)
      setWorkspace(previewWorkspace)
      setLoading(false)
      return
    }
    if (previewMode) {
      setUser({ displayName: 'Preview admin', email: 'admin@example.com' } as User)
      setWorkspace(previewWorkspace)
      setLoading(false)
      return
    }
    if (!firebaseAuth) { setLoading(false); return }
    return onAuthStateChanged(firebaseAuth, (nextUser) => { setUser(nextUser); if (nextUser) void refresh(); else { setWorkspace(null); setLoading(false) } })
  }, [previewMode, refresh])

  if (!firebaseConfigured && !previewMode) return <SetupScreen />
  if (!user) return <LoginScreen />
  if (loading) return <div className="app-loading"><span className="loading loading-spinner loading-md" /> Preparing your attendance desk…</div>
  if (error || !workspace) return <ApprovalScreen email={user.email ?? ''} error={error} onSignOut={() => void signOutOfFirebase()} />

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="topbar">
        <div className="topbar-inner">
          <button className="icon-button mobile-menu-button" aria-label="Open navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Menu size={21} aria-hidden="true" /></button>
          <Brand schoolName={workspace.school.name} />
          <div className="ml-auto flex items-center gap-2">
            <ThemeButton />
            <div className="hidden text-right sm:block"><p className="m-0 text-sm font-bold leading-tight">{user.displayName ?? 'School admin'}</p><p className="m-0 text-xs opacity-60">Admin</p></div>
            {user.photoURL ? <img className="avatar-image" src={user.photoURL} alt="" /> : <div className="avatar-fallback">{(user.displayName ?? user.email ?? 'A')[0]}</div>}
            <button className="icon-button" aria-label="Sign out" onClick={() => void signOutOfFirebase()}><LogOut size={18} /></button>
          </div>
        </div>
      </header>
      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-mobile-head"><Brand schoolName={workspace.school.name} /><button className="icon-button" onClick={() => setMenuOpen(false)} aria-label="Close navigation"><X /></button></div>
        <nav aria-label="Main navigation">{tabs.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => { setTab(id); setMenuOpen(false) }} className={`nav-item ${tab === id ? 'nav-item-active' : ''}`}><Icon size={19} />{label}</button>)}</nav>
        <div className="sidebar-tip"><Sparkles className="tip-sun" size={17} aria-hidden="true" /><p>Everything saves only after you choose <strong>Save attendance</strong>.</p></div>
      </aside>
      {menuOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
      <main className="workspace" id="main-content" tabIndex={-1}>
        {tab === 'attendance' && (workspace.activeSchoolYear ? <AttendancePanel workspace={workspace} onWorkspaceChange={refresh} preview={previewMode} /> : <NoActiveSchoolYear title="Attendance is paused" />)}
        {tab === 'notices' && (workspace.activeSchoolYear ? <NoticesPanel threshold={workspace.school.noticeThreshold} preview={previewMode} /> : <NoActiveSchoolYear title="Notices are paused" />)}
        {tab === 'students' && (workspace.activeSchoolYear ? <StudentsPanel workspace={workspace} onChanged={refresh} preview={previewMode} /> : <NoActiveSchoolYear title="No active roster" />)}
        {tab === 'classes' && <ClassesPanel workspace={workspace} onChanged={refresh} />}
        {tab === 'years' && <SchoolYearsPanel workspace={workspace} onChanged={refresh} preview={previewMode} />}
        {tab === 'schedule' && <SchedulePanel workspace={workspace} />}
        {tab === 'import' && (workspace.activeSchoolYear ? <ImportPanel workspace={workspace} onChanged={refresh} /> : <NoActiveSchoolYear title="Student import is paused" />)}
      </main>
    </div>
  )
}

function Brand({ schoolName }: { schoolName: string }) { return <Link to="/" className="brand"><span className="brand-mark">a</span><span><strong>Attendance</strong><small>{schoolName}</small></span></Link> }

function LoginScreen() { const [error, setError] = useState(''); return <main className="auth-page"><section className="auth-card"><div className="brand-mark brand-mark-large">a</div><p className="eyebrow">School attendance</p><h1>A calmer way to take roll.</h1><p>Sign in with your approved Google account to begin.</p>{error && <p className="error-callout">{error}</p>}<button className="primary-button w-full" onClick={() => void signInWithGoogle().catch((cause) => setError(cause instanceof Error ? cause.message : 'Google sign-in could not start.'))}><span className="google-g">G</span> Continue with Google</button><p className="auth-fine">Only approved school administrators can access attendance records.</p></section></main> }
function SetupScreen() { return <main className="auth-page"><section className="auth-card"><div className="brand-mark brand-mark-large">a</div><p className="eyebrow">Secure setup</p><h1>Connect Firebase to begin.</h1><p>Add the Firebase web configuration to <code>.env</code>, then restart the app. No student data is available until a secure sign-in is configured.</p></section></main> }
function ApprovalScreen({ email, error, onSignOut }: { email: string; error: string; onSignOut: () => void }) { return <main className="auth-page"><section className="auth-card"><ShieldCheck className="mx-auto text-primary" size={38} /><p className="eyebrow">Approval required</p><h1>Your account is waiting for approval.</h1><p>{email || 'This Google account'} is signed in, but it does not yet have the school admin permission. Ask the school owner to approve it in Firebase, then sign out and sign back in.</p>{error && <p className="error-callout">{error}</p>}<button className="secondary-button" onClick={onSignOut}>Sign out</button></section></main> }
function ThemeButton() { const [dark, setDark] = useState(false); useEffect(() => setDark(document.documentElement.dataset.theme === 'dark'), []); return <button className="icon-button" aria-label="Toggle dark mode" onClick={() => { const next = !dark; setDark(next); document.documentElement.dataset.theme = next ? 'dark' : 'light'; localStorage.setItem('theme', next ? 'dark' : 'light') }}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button> }

function AttendancePanel({ workspace, onWorkspaceChange, preview = false }: { workspace: Workspace; onWorkspaceChange: () => Promise<void>; preview?: boolean }) {
  const activeYear = workspace.activeSchoolYear as SchoolYear
  const activeClasses = workspace.classes.filter((item) => item.active)
  const [classId, setClassId] = useState(activeClasses[0]?.id ?? '')
  const schoolClass = activeClasses.find((item) => item.id === classId) ?? activeClasses[0]
  const periods = useMemo(() => (schoolClass?.periods ?? workspace.periods).filter((item) => item.attendanceRequired), [schoolClass, workspace.periods])
  const periodIds = periods.map((period) => period.id).join('|')
  const [date, setDate] = useState(() => {
    let candidate = isoToday()
    if (candidate < activeYear.startDate) candidate = activeYear.startDate
    if (candidate > activeYear.endDate) candidate = activeYear.endDate
    if (!isScheduledSchoolDate(candidate, workspace.school.meetingDays)) {
      const backward = stepToScheduledSchoolDate(candidate, workspace.school.meetingDays, -1, activeYear.startDate, activeYear.endDate)
      candidate = backward === candidate ? stepToScheduledSchoolDate(candidate, workspace.school.meetingDays, 1, activeYear.startDate, activeYear.endDate) : backward
    }
    return candidate
  })
  const [entries, setEntries] = useState<Record<string, Record<string, AttendanceStatus>>>({})
  const [savedPeriods, setSavedPeriods] = useState<Record<string, string>>({})
  const [dirtyPeriods, setDirtyPeriods] = useState<Set<string>>(() => new Set())
  const [loadingSheets, setLoadingSheets] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [dateError, setDateError] = useState('')
  const rows = useMemo(() => workspace.students.filter((student) => student.active && student.classId === classId), [workspace.students, classId])
  const totalCells = rows.length * periods.length
  const markedCells = periods.reduce((total, period) => total + rows.filter((student) => entries[period.id]?.[student.id]).length, 0)
  const completed = totalCells > 0 && markedCells === totalCells
  const allSaved = periods.length > 0 && periods.every((period) => savedPeriods[period.id])
  const hasUnsaved = dirtyPeriods.size > 0
  const counts = { P: 0, L: 0, A: 0 }
  const meetingDayKey = workspace.school.meetingDays.join('|')
  const activeClassIndex = activeClasses.findIndex((item) => item.id === classId)
  const schoolDaysText = workspace.school.meetingDays.map((day) => weekdayNames[day]).join(', ')
  const previousSchoolDate = stepToScheduledSchoolDate(date, workspace.school.meetingDays, -1, activeYear.startDate, activeYear.endDate)
  const nextSchoolDate = stepToScheduledSchoolDate(date, workspace.school.meetingDays, 1, activeYear.startDate, activeYear.endDate)
  periods.forEach((period) => Object.values(entries[period.id] ?? {}).forEach((status) => { counts[status] += 1 }))

  useEffect(() => {
    let candidate = isoToday()
    if (candidate < activeYear.startDate) candidate = activeYear.startDate
    if (candidate > activeYear.endDate) candidate = activeYear.endDate
    if (!isScheduledSchoolDate(candidate, workspace.school.meetingDays)) {
      const backward = stepToScheduledSchoolDate(candidate, workspace.school.meetingDays, -1, activeYear.startDate, activeYear.endDate)
      candidate = backward === candidate ? stepToScheduledSchoolDate(candidate, workspace.school.meetingDays, 1, activeYear.startDate, activeYear.endDate) : backward
    }
    setDate(candidate)
  }, [meetingDayKey, activeYear.id])

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (hasUnsaved) event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasUnsaved])

  useEffect(() => {
    setMessage('')
    setDateError('')
    setEntries({})
    setSavedPeriods({})
    setDirtyPeriods(new Set())
    if (preview || !classId || !periods.length) return
    let cancelled = false
    setLoadingSheets(true)
    void Promise.all(periods.map(async (period) => ({ periodId: period.id, sheet: await getAttendanceSheet({ data: { date, classId, periodId: period.id } }) })))
      .then((results) => {
        if (cancelled) return
        setEntries(Object.fromEntries(results.map(({ periodId, sheet }) => [periodId, sheet.entries])))
        setSavedPeriods(Object.fromEntries(results.filter(({ sheet }) => sheet.savedAt).map(({ periodId, sheet }) => [periodId, sheet.savedAt as string])))
      })
      .catch((cause) => { if (!cancelled) setMessage(cause instanceof Error ? cause.message : 'Attendance could not be loaded.') })
      .finally(() => { if (!cancelled) setLoadingSheets(false) })
    return () => { cancelled = true }
  }, [date, classId, periodIds, preview])

  const chooseStatus = (studentId: string, periodId: string, status: AttendanceStatus) => {
    setEntries((current) => ({ ...current, [periodId]: { ...(current[periodId] ?? {}), [studentId]: status } }))
    setDirtyPeriods((current) => new Set(current).add(periodId))
    setSavedPeriods((current) => { const next = { ...current }; delete next[periodId]; return next })
  }

  const changeClass = (nextClassId: string) => {
    if (!nextClassId || nextClassId === classId) return true
    if (hasUnsaved && !window.confirm('Discard the attendance marks you have not saved?')) return false
    setClassId(nextClassId)
    return true
  }
  const chooseDate = (nextDate: string) => {
    if (!nextDate || nextDate === date) return true
    if (nextDate < activeYear.startDate || nextDate > activeYear.endDate) {
      setDateError(`Choose a date within ${activeYear.name}: ${activeYear.startDate} through ${activeYear.endDate}.`)
      return false
    }
    if (!isScheduledSchoolDate(nextDate, workspace.school.meetingDays)) {
      setDateError(`Attendance is only available on scheduled school days: ${schoolDaysText}.`)
      return false
    }
    if (hasUnsaved && !window.confirm('Discard the attendance marks you have not saved?')) return false
    setDateError('')
    setDate(nextDate)
    return true
  }

  const save = async () => {
    if (!completed) return
    setBusy(true)
    setMessage('')
    if (preview) {
      const now = new Date().toISOString()
      setSavedPeriods(Object.fromEntries(periods.map((period) => [period.id, now])))
      setDirtyPeriods(new Set())
      setMessage('All periods saved.')
      setBusy(false)
      return
    }
    try {
      const saved = await Promise.all(periods.map((period) => saveAttendanceSheet({ data: { date, classId, periodId: period.id, entries: entries[period.id] ?? {} } })))
      setSavedPeriods(Object.fromEntries(periods.map((period, index) => [period.id, saved[index].savedAt])))
      setDirtyPeriods(new Set())
      setMessage('All periods saved.')
      await onWorkspaceChange()
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Attendance could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  useAttendanceWebMcp({ date, className: schoolClass?.name ?? '', periodName: periods.map((period) => period.name).join(', '), complete: completed, save })

  return <section className="content-section attendance-section">
    <PageIntro eyebrow="Daily desk" title="Attendance register" text={`Mark every period for each student in the active ${activeYear.name} school year, then save the whole day at once.`} />
    <div className="control-card attendance-controls sticky-controls">
      <div className="date-picker-control"><span>Date</span><div><button className="icon-button" aria-label="Previous school day" disabled={previousSchoolDate === date} onClick={() => chooseDate(previousSchoolDate)}><ChevronLeft size={18} aria-hidden="true" /></button><input className="input input-bordered" aria-label="Attendance date" type="date" min={activeYear.startDate} max={activeYear.endDate} value={date} onChange={(event) => { if (!chooseDate(event.target.value)) event.currentTarget.value = date }} aria-describedby="school-day-hint school-day-error" /><button className="icon-button" aria-label="Next school day" disabled={nextSchoolDate === date} onClick={() => chooseDate(nextSchoolDate)}><ChevronRight size={18} aria-hidden="true" /></button></div><small id="school-day-hint">{activeYear.name} · School days: {schoolDaysText}</small>{dateError && <small id="school-day-error" className="date-error" role="alert">{dateError}</small>}</div>
      <div className="class-picker-control"><span>Class</span><div><button className="icon-button" aria-label="Previous class" disabled={activeClassIndex <= 0} onClick={() => changeClass(activeClasses[activeClassIndex - 1]?.id ?? '')}><ChevronLeft size={18} aria-hidden="true" /></button><select aria-label="Attendance class" className="select select-bordered" value={classId} onChange={(event) => { if (!changeClass(event.target.value)) event.currentTarget.value = classId }}>{activeClasses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="icon-button" aria-label="Next class" disabled={activeClassIndex < 0 || activeClassIndex >= activeClasses.length - 1} onClick={() => changeClass(activeClasses[activeClassIndex + 1]?.id ?? '')}><ChevronRight size={18} aria-hidden="true" /></button></div></div>
      <div className="control-status"><strong>{markedCells} / {totalCells}</strong><span>period marks complete</span></div>
    </div>
    <div className="attendance-card attendance-register">
      <div className="sheet-head"><div><h2>{schoolClass?.name ?? 'Choose a class'}</h2><p>{periods.length} attendance period{periods.length === 1 ? '' : 's'} · {rows.length} student{rows.length === 1 ? '' : 's'}</p></div>{allSaved && <span className="saved-pill"><Check size={15} aria-hidden="true" /> Saved</span>}</div>
      {loadingSheets ? <div className="app-loading"><span className="loading loading-spinner loading-sm" /> Loading the register…</div> : rows.length && periods.length ? <div className="attendance-grid-scroll">
        <div className="attendance-grid" style={{ '--period-count': periods.length } as CSSProperties}>
          <div className="attendance-grid-row attendance-grid-head">
            <div className="student-column">Student</div>
            {periods.map((period) => <div className="period-column-head" key={period.id}><strong>{period.name}</strong><span>{period.startTime}–{period.endTime}</span></div>)}
          </div>
          {rows.map((student, index) => <div className="attendance-grid-row" key={student.id}>
            <div className="student-column student-cell"><span className="student-number">{index + 1}</span><strong>{student.displayName}</strong></div>
            {periods.map((period) => <div className="period-status-cell" key={period.id}><div className="status-group" role="group" aria-label={`${period.name} attendance for ${student.displayName}`}>{(['P', 'L', 'A'] as AttendanceStatus[]).map((status) => <button key={status} onClick={() => chooseStatus(student.id, period.id, status)} className={`status-button ${statusStyle[status]} ${entries[period.id]?.[student.id] === status ? 'status-selected' : ''}`} aria-label={`${status === 'P' ? 'Present' : status === 'L' ? 'Late' : 'Absent'} — ${student.displayName}, ${period.name}`} aria-pressed={entries[period.id]?.[student.id] === status}>{status}</button>)}</div></div>)}
          </div>)}
        </div>
      </div> : <Empty title={periods.length ? 'No active students in this class' : 'No attendance periods configured'} text={periods.length ? 'Add students or import a class list to begin.' : 'Add attendance-taking periods in Schedule.'} />}
      <div className="attendance-savebar">
        <div className="attendance-totals">{(['P', 'L', 'A'] as AttendanceStatus[]).map((status) => <span className={`total-chip ${statusStyle[status]}`} key={status}><strong>{counts[status]}</strong> {status === 'P' ? 'present' : status === 'L' ? 'late' : 'absent'}</span>)}</div>
        <div className="save-action"><span className="save-hint">{completed ? 'Every period is complete.' : `${totalCells - markedCells} mark${totalCells - markedCells === 1 ? '' : 's'} remaining`}</span><button className="primary-button" disabled={!completed || busy} onClick={() => void save()}>{busy ? <span className="loading loading-spinner loading-sm" /> : <Save size={17} aria-hidden="true" />} Save all periods</button></div>
      </div>
      {message && <p className={message === 'All periods saved.' ? 'success-callout register-message' : 'error-callout register-message'}>{message}</p>}
    </div>
  </section>
}

function NoticesPanel({ threshold, preview = false }: { threshold: number; preview?: boolean }) { const [notices, setNotices] = useState<Notice[]>([]); const [error, setError] = useState(''); const [loading, setLoading] = useState(!preview); useEffect(() => { if (preview) return; void getNotices().then(setNotices).catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load notices.')).finally(() => setLoading(false)) }, [preview]); return <section className="content-section"><PageIntro eyebrow="Follow up" title="Absence notices" text={`Students shown here have been absent for ${threshold} or more consecutive complete school days.`} />{loading ? <div className="app-loading"><span className="loading loading-spinner" /> Checking attendance…</div> : error ? <p className="error-callout">{error}</p> : notices.length ? <div className="notice-list">{notices.map((notice) => <article key={notice.studentId} className="notice-card"><div className="notice-avatar">{notice.studentName[0]}</div><div><h2>{notice.studentName}</h2><p>{notice.className} · last absent {notice.lastAbsentDate}</p></div><strong className="streak-badge">{notice.consecutiveDays} days</strong><ChevronRight className="ml-auto opacity-40" /></article>)}</div> : <Empty title="No absence notices right now" text="Students will appear here only after complete attendance sheets show a consecutive absence streak." />}</section> }

function StudentsPanel({ workspace, onChanged, preview = false }: { workspace: Workspace; onChanged: () => Promise<void>; preview?: boolean }) {
  const activeClasses = workspace.classes.filter((item) => item.active)
  const [filter, setFilter] = useState('')
  const deferredFilter = useDeferredValue(filter)
  const [classId, setClassId] = useState(activeClasses[0]?.id ?? '')
  const [newName, setNewName] = useState('')
  const [drafts, setDrafts] = useState<Record<string, { displayName: string; classId: string }>>(() => Object.fromEntries(workspace.students.map((student) => [student.id, { displayName: student.displayName, classId: student.classId }])))
  const [savingId, setSavingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => setDrafts(Object.fromEntries(workspace.students.map((student) => [student.id, { displayName: student.displayName, classId: student.classId }]))), [workspace.students])

  const studentList = workspace.students.filter((student) => {
    const draft = drafts[student.id] ?? student
    return draft.classId === classId && draft.displayName.toLowerCase().includes(deferredFilter.toLowerCase())
  })

  const updateDraft = (studentId: string, displayName: string) => setDrafts((current) => ({ ...current, [studentId]: { ...current[studentId], displayName } }))
  const saveExisting = async (studentId: string) => {
    const draft = drafts[studentId]
    if (!draft?.displayName.trim() || !draft.classId) return
    setSavingId(studentId)
    setMessage('')
    if (preview) { setMessage('Student updated.'); setSavingId(null); return }
    try { await saveStudent({ data: { id: studentId, ...draft } }); setMessage('Student updated.'); await onChanged() }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Student could not be updated.') }
    finally { setSavingId(null) }
  }
  const add = async () => {
    if (!newName.trim() || !classId) return
    setSavingId('new')
    setMessage('')
    if (preview) { setNewName(''); setMessage('Student added.'); setSavingId(null); return }
    try { await saveStudent({ data: { displayName: newName, classId } }); setNewName(''); setMessage('Student added.'); await onChanged() }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Student could not be added.') }
    finally { setSavingId(null) }
  }
  const changeActive = async (studentId: string, active: boolean) => {
    setSavingId(studentId)
    setMessage('')
    if (preview) { setMessage(active ? 'Student restored.' : 'Student archived.'); setSavingId(null); return }
    try { await archiveStudent({ data: { id: studentId, active } }); setMessage(active ? 'Student restored.' : 'Student archived.'); await onChanged() }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Student status could not be changed.') }
    finally { setSavingId(null) }
  }

  return <section className="content-section">
    <PageIntro eyebrow="Class lists" title="Student roster" text="Choose a class, then click a student name to edit it. Save each changed row when you are ready." />
    <div className="management-toolbar">
      <label className="search-control"><Search size={18} aria-hidden="true" /><span className="sr-only">Search students</span><input aria-label="Search students" placeholder="Search by student name" value={filter} onChange={(event) => setFilter(event.target.value)} /></label>
      <label className="filter-control roster-class-control"><span>Class</span><select aria-label="Choose class" className="select select-bordered" value={classId} onChange={(event) => setClassId(event.target.value)}>{activeClasses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    </div>
    <div className="table-card student-roster-card">
      <div className="roster-caption"><strong>{activeClasses.find((item) => item.id === classId)?.name ?? 'Class'} roster</strong><span>Click a name to edit · Save stores that row</span></div>
      <div className="student-roster-row student-roster-head"><span>Student name</span><span>Status</span><span className="sr-only">Actions</span></div>
      {studentList.map((student) => {
        const draft = drafts[student.id] ?? { displayName: student.displayName, classId: student.classId }
        const dirty = draft.displayName.trim() !== student.displayName
        return <div className={`student-roster-row ${student.active ? '' : 'student-archived'}`} key={student.id}>
          <label><span className="mobile-field-label">Student name</span><input className="spreadsheet-input" aria-label={`Student name for ${student.displayName}`} value={draft.displayName} onChange={(event) => updateDraft(student.id, event.target.value)} /></label>
          <span className="roster-status">{student.active ? 'Active' : 'Archived'}</span>
          <div className="roster-actions"><button className="compact-button" disabled={!dirty || !draft.displayName.trim() || savingId === student.id} onClick={() => void saveExisting(student.id)}><Save size={15} aria-hidden="true" /> Save</button><button className="icon-button quiet-button" aria-label={student.active ? `Archive ${student.displayName}` : `Restore ${student.displayName}`} disabled={savingId === student.id} onClick={() => void changeActive(student.id, !student.active)}>{student.active ? <Archive size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}</button></div>
        </div>
      })}
      <div className="student-roster-row add-student-row">
        <label><span className="mobile-field-label">Student name</span><input className="spreadsheet-input" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Add a student…" onKeyDown={(event) => { if (event.key === 'Enter') void add() }} /></label>
        <span className="roster-status new-row-label">New student</span>
        <button className="primary-button add-row-button" disabled={!newName.trim() || !classId || savingId === 'new'} onClick={() => void add()}>{savingId === 'new' ? <span className="loading loading-spinner loading-sm" /> : <Plus size={17} aria-hidden="true" />} Add student</button>
      </div>
    </div>
    {!studentList.length && <p className="empty-filter-note">No students in this class match the search. You can still add one below.</p>}
    {message && <p className={message.includes('could not') ? 'error-callout' : 'success-callout'}>{message}</p>}
  </section>
}

function SchoolYearsPanel({ workspace, onChanged, preview = false }: { workspace: Workspace; onChanged: () => Promise<void>; preview?: boolean }) {
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const create = async () => {
    if (!name.trim() || !startDate || !endDate) return
    setBusyId('new')
    setMessage('')
    if (preview) { setMessage('School year created. Mark it active when you are ready to import its roster.'); setBusyId(null); return }
    try { await createSchoolYear({ data: { name, startDate, endDate } }); setName(''); setStartDate(''); setEndDate(''); setMessage('School year created. Mark it active when you are ready to import its roster.'); await onChanged() }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'School year could not be created.') }
    finally { setBusyId(null) }
  }
  const activate = async (year: SchoolYear) => {
    const current = workspace.activeSchoolYear
    const prompt = current ? `Make ${year.name} active instead of ${current.name}? Attendance, rosters, notices, and imports will switch to ${year.name}.` : `Make ${year.name} active? Attendance, rosters, notices, and imports will use this year.`
    if (!window.confirm(prompt)) return
    setBusyId(year.id)
    setMessage('')
    if (preview) { setMessage(`${year.name} is now active.`); setBusyId(null); return }
    try { await activateSchoolYear({ data: { id: year.id } }); setMessage(`${year.name} is now active.`); await onChanged() }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'School year could not be activated.') }
    finally { setBusyId(null) }
  }
  const archive = async (year: SchoolYear) => {
    if (!window.confirm(`Archive ${year.name}? Its roster and attendance will be preserved but can no longer be edited. ${year.active ? 'Attendance and imports will pause until another year is active.' : ''}`)) return
    setBusyId(year.id)
    setMessage('')
    if (preview) { setMessage(`${year.name} was archived.`); setBusyId(null); return }
    try { await archiveSchoolYear({ data: { id: year.id, confirmed: true } }); setMessage(`${year.name} was archived.`); await onChanged() }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'School year could not be archived.') }
    finally { setBusyId(null) }
  }
  return <section className="content-section">
    <PageIntro eyebrow="School setup" title="School years" text="Create a dated school year, make one active, then manage its roster and attendance. Archived years stay preserved." />
    {workspace.activeSchoolYear ? <div className="active-year-banner"><span>Active school year</span><strong>{workspace.activeSchoolYear.name}</strong><span>{workspace.activeSchoolYear.startDate} to {workspace.activeSchoolYear.endDate}</span></div> : <div className="no-active-year-banner" role="status"><strong>No active school year</strong><span>Choose an existing year below or create a new one. Attendance and imports are paused.</span></div>}
    <section className="table-card school-year-create">
      <div className="table-card-head"><div><h2>Create a school year</h2><p>New years start inactive so you can review the dates before switching over.</p></div></div>
      <div className="school-year-form"><label><span>Name</span><input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. 2027–2028" /></label><label><span>Start date</span><input className="input" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label><span>End date</span><input className="input" type="date" min={startDate || undefined} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label><button className="primary-button" disabled={!name.trim() || !startDate || !endDate || startDate > endDate || busyId === 'new'} onClick={() => void create()}>{busyId === 'new' ? <span className="loading loading-spinner loading-sm" /> : <Plus size={17} aria-hidden="true" />} Create year</button></div>
    </section>
    <section className="table-card school-year-list">
      <div className="table-card-head"><div><h2>School year history</h2><p>Only one year can be active at a time.</p></div></div>
      {workspace.schoolYears.map((year) => <div className={`school-year-row ${year.archived ? 'year-archived' : ''}`} key={year.id}><div><strong>{year.name}</strong><span>{year.startDate} to {year.endDate}</span></div><span className={`year-status ${year.active ? 'year-active' : year.archived ? 'year-archived-status' : ''}`}>{year.active ? 'Active' : year.archived ? 'Archived' : 'Inactive'}</span><div className="school-year-actions">{!year.active && !year.archived && <button className="secondary-button" disabled={busyId === year.id} onClick={() => void activate(year)}>Make active</button>}{!year.archived && <button className="danger-button" disabled={busyId === year.id} onClick={() => void archive(year)}><Archive size={16} aria-hidden="true" /> Archive</button>}</div></div>)}
    </section>
    {message && <p className={message.includes('could not') || message.includes('overlap') ? 'error-callout' : 'success-callout'} role="status">{message}</p>}
  </section>
}

function NoActiveSchoolYear({ title }: { title: string }) { return <section className="content-section"><PageIntro eyebrow="School year required" title={title} text="Attendance, rosters, notices, and student imports belong to the active school year." /><div className="empty-state table-card"><CalendarRange size={32} aria-hidden="true" /><h2>Choose an active school year</h2><p>Open School years, create or select a year, and mark it active to continue.</p></div></section> }

function ClassesPanel({ workspace, onChanged }: { workspace: Workspace; onChanged: () => Promise<void> }) { const [name, setName] = useState(''); const [custom, setCustom] = useState(false); const [error, setError] = useState(''); const submit = async () => { try { await saveClass({ data: { name, scheduleMode: custom ? 'custom' : 'inherit' } }); setName(''); await onChanged() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Class could not be saved.') } }; return <section className="content-section"><PageIntro eyebrow="Structure" title="Classes" text="Classes inherit the school timetable until you choose a full class-specific schedule." /><div className="class-grid">{workspace.classes.map((item) => <article className="class-card" key={item.id}><div className="class-token">{item.name.slice(0, 2)}</div><div><h2>{item.name}</h2><p>{workspace.students.filter((student) => student.active && student.classId === item.id).length} active students</p></div><span className="schedule-label">{item.scheduleMode === 'custom' ? 'Custom timing' : 'School timing'}</span></article>)}<article className="class-card class-card-add"><p className="eyebrow">New class</p><input className="input input-bordered" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. 1A" /><label className="check-row"><input type="checkbox" className="checkbox checkbox-sm" checked={custom} onChange={(event) => setCustom(event.target.checked)} /> Use a custom timetable</label><button className="primary-button" disabled={!name.trim()} onClick={() => void submit()}><Plus size={18} /> Add class</button>{error && <p className="error-callout">{error}</p>}</article></div></section> }

function SchedulePanel({ workspace }: { workspace: Workspace }) {
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const [target, setTarget] = useState('school')
  const sourcePeriods = target === 'school' ? workspace.periods : workspace.classes.find((item) => item.id === target)?.periods ?? workspace.periods
  const [meetingDays, setMeetingDays] = useState(workspace.school.meetingDays)
  const [periods, setPeriods] = useState(sourcePeriods)
  const [multiPeriod, setMultiPeriod] = useState(workspace.school.multiPeriodEnabled)
  const [message, setMessage] = useState('')
  useEffect(() => { setPeriods(sourcePeriods); setMeetingDays(workspace.school.meetingDays); setMultiPeriod(workspace.school.multiPeriodEnabled); setMessage('') }, [target, workspace])
  const save = async () => { try { await saveSchedule({ data: { classId: target === 'school' ? null : target, meetingDays, multiPeriodEnabled: multiPeriod, periods: periods.map(({ id: _id, order: _order, ...period }) => period) } }); setMessage('Timetable saved. New attendance sheets will use these times.') } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Timetable could not be saved.') } }
  return <section className="content-section"><PageIntro eyebrow="School setup" title="Timetable" text="Set the school days and timing that attendance sheets follow." /><div className="schedule-layout"><section className="table-card"><div className="table-card-head"><div><p className="eyebrow">Schedule scope</p><h2>{target === 'school' ? 'School timetable' : 'Class timetable'}</h2></div><select className="select select-bordered select-sm" value={target} onChange={(event) => setTarget(event.target.value)}><option value="school">Whole school</option>{workspace.classes.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><p className="eyebrow">Meeting days</p><div className="weekday-row">{weekdays.map((day, index) => <button key={day} className={`weekday-pill ${meetingDays.includes(index) ? 'weekday-active' : ''}`} onClick={() => setMeetingDays((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index].sort())}>{day}</button>)}</div>{target === 'school' && <label className="check-row mt-6"><input type="checkbox" className="checkbox checkbox-sm" checked={multiPeriod} onChange={(event) => setMultiPeriod(event.target.checked)} /> Use multi-period attendance school-wide</label>}<button className="primary-button mt-6" disabled={!meetingDays.length} onClick={() => void save()}><Check size={17} /> Save timetable</button>{message && <p className={message.startsWith('Timetable saved') ? 'success-callout' : 'error-callout'}>{message}</p>}</section><section className="table-card"><div className="table-card-head"><div><p className="eyebrow">Daily rhythm</p><h2>Periods</h2></div><button className="text-button" onClick={() => setPeriods((current) => [...current, { id: crypto.randomUUID(), name: 'New period', startTime: '12:00', endTime: '13:00', order: current.length + 1, attendanceRequired: true }])}><Plus size={16} /> Add</button></div><div className="period-editor">{periods.map((period, index) => <div className="period-edit-row" key={period.id}><input className="input input-bordered input-sm" value={period.name} onChange={(event) => setPeriods((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} /><input className="input input-bordered input-sm" type="time" value={period.startTime} onChange={(event) => setPeriods((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, startTime: event.target.value } : item))} /><input className="input input-bordered input-sm" type="time" value={period.endTime} onChange={(event) => setPeriods((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, endTime: event.target.value } : item))} /><label className="check-row"><input type="checkbox" className="checkbox checkbox-sm" checked={period.attendanceRequired} onChange={(event) => setPeriods((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, attendanceRequired: event.target.checked } : item))} /> Attendance</label><button className="text-button" aria-label={`Remove ${period.name}`} onClick={() => setPeriods((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={16} /></button></div>)}</div></section></div></section>
}

function ImportPanel({ workspace, onChanged }: { workspace: Workspace; onChanged: () => Promise<void> }) {
  const [preview, setPreview] = useState<Array<{ displayName: string; className: string; classExists: boolean; error?: string }>>([])
  const [message, setMessage] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const onFile = async (file?: File) => {
    if (!file) return
    const contents = await file.text()
    const [headerLine, ...lines] = contents.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean)
    const headers = headerLine.split(',').map((item) => item.trim().toLowerCase())
    const nameIndex = headers.findIndex((item) => ['name', 'student', 'student name', 'display_name'].includes(item))
    const classIndex = headers.findIndex((item) => ['class', 'grade', 'class name'].includes(item))
    if (nameIndex < 0 || classIndex < 0) { setMessage('Your CSV needs a name column and a class column.'); return }
    const normaliseClass = (value: string) => value.trim().toLocaleLowerCase().replace(/\s+/g, ' ')
    const known = new Set(workspace.classes.map((item) => normaliseClass(item.name)))
    setPreview(lines.slice(0, 1000).map((line) => {
      const parts = line.split(',').map((item) => item.trim())
      const className = parts[classIndex] ?? ''
      return { displayName: parts[nameIndex] ?? '', className, classExists: known.has(normaliseClass(className)), error: !parts[nameIndex] ? 'Missing name' : !className ? 'Missing class' : undefined }
    }))
    setMessage('')
  }
  const validRows = preview.filter((row) => !row.error)
  const newClassCount = new Set(validRows.filter((row) => !row.classExists).map((row) => row.className.toLocaleLowerCase())).size
  const commit = async () => { try { const result = await importStudents({ data: { rows: validRows.map(({ displayName, className }) => ({ displayName, className })) } }); setMessage(`${result.created} students added; ${result.classesCreated} ${result.classesCreated === 1 ? 'class' : 'classes'} created; ${result.skipped} duplicates skipped.`); setPreview([]); await onChanged() } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Import could not be completed.') } }
  return <section className="content-section">
    <PageIntro eyebrow="Bulk intake" title="Import students" text="Start with the template and upload it. New class names are created automatically with the school timetable." />
    <div className="import-toolbar"><a className="secondary-button" href="/student-import-template.csv" download><Download size={17} aria-hidden="true" /> Download CSV template</a><span>Columns: name, class · New classes are created automatically</span></div>
    <input className="hidden" ref={inputRef} type="file" accept=".csv,text/csv" onChange={(event) => void onFile(event.target.files?.[0])} />
    <button className="upload-zone" onClick={() => inputRef.current?.click()}><FileSpreadsheet size={30} aria-hidden="true" /><strong>Choose completed CSV</strong><span>Up to 1,000 rows · UTF-8 CSV</span></button>
    {message && <p className={message.includes('added') ? 'success-callout' : 'error-callout'}>{message}</p>}
    {preview.length > 0 && <div className="table-card mt-6"><div className="table-card-head"><div><h2>Review {preview.length} rows</h2><p>{validRows.length} ready to import{newClassCount ? ` · ${newClassCount} new ${newClassCount === 1 ? 'class' : 'classes'} will be created` : ''}</p></div><button className="primary-button" disabled={!validRows.length} onClick={() => void commit()}>Import {validRows.length} students</button></div><div className="import-preview">{preview.slice(0, 30).map((row, index) => <div key={`${row.displayName}-${index}`} className={row.error ? 'import-row import-error' : 'import-row'}><span>{index + 1}</span><strong>{row.displayName || '—'}</strong><span>{row.error ?? (row.classExists ? row.className : `New class: ${row.className}`)}</span>{row.error ? <span className="text-error">Needs attention</span> : row.classExists ? <Check className="text-success" size={17} /> : <span className="new-class-label">Will create</span>}</div>)}</div></div>}
  </section>
}

function PageIntro({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) { return <div className="page-intro"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{text}</p></div> }
function Empty({ title, text }: { title: string; text: string; tab?: Tab; onTab?: ((tab: Tab) => void) | undefined }) { return <div className="empty-state"><ClipboardCheck size={28} /><h2>{title}</h2><p>{text}</p></div> }
