import { Link } from '@tanstack/react-router'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { CalendarDays, Check, ChevronRight, ClipboardCheck, CloudUpload, FileSpreadsheet, GraduationCap, LogOut, Menu, Moon, Plus, Search, ShieldCheck, Sun, Users, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { firebaseAuth, firebaseConfigured, signInWithGoogle, signOutOfFirebase } from '../lib/firebase'
import { useAttendanceWebMcp } from '../lib/useAttendanceWebMcp'
import type { AttendanceStatus, Notice, Workspace } from '../lib/types'
import { archiveStudent, getAttendanceSheet, getNotices, getWorkspace, importStudents, saveAttendanceSheet, saveClass, saveSchedule, saveStudent } from '../server/actions'

type Tab = 'attendance' | 'notices' | 'students' | 'classes' | 'schedule' | 'import'
const tabs: Array<{ id: Tab; label: string; icon: typeof ClipboardCheck }> = [
  { id: 'attendance', label: 'Attendance', icon: ClipboardCheck },
  { id: 'notices', label: 'Notices', icon: ShieldCheck },
  { id: 'students', label: 'Students', icon: Users },
  { id: 'classes', label: 'Classes', icon: GraduationCap },
  { id: 'schedule', label: 'Schedule', icon: CalendarDays },
  { id: 'import', label: 'CSV import', icon: CloudUpload },
]

const isoToday = () => new Intl.DateTimeFormat('en-CA').format(new Date())
const statusStyle: Record<AttendanceStatus, string> = { P: 'status-present', L: 'status-late', A: 'status-absent' }

export default function AttendanceApp() {
  const [user, setUser] = useState<User | null>(null)
  const [tab, setTab] = useState<Tab>('attendance')
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)

  const refresh = useCallback(async () => {
    if (!firebaseAuth?.currentUser) return
    setLoading(true)
    setError('')
    try { setWorkspace(await getWorkspace()) } catch (cause) { setError(cause instanceof Error ? cause.message : 'We could not load your school workspace.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (!firebaseAuth) { setLoading(false); return }
    return onAuthStateChanged(firebaseAuth, (nextUser) => { setUser(nextUser); if (nextUser) void refresh(); else { setWorkspace(null); setLoading(false) } })
  }, [refresh])

  if (!firebaseConfigured) return <SetupScreen />
  if (!user) return <LoginScreen />
  if (loading) return <div className="app-loading"><span className="loading loading-spinner loading-md" /> Preparing your attendance desk…</div>
  if (error || !workspace) return <ApprovalScreen email={user.email ?? ''} error={error} onSignOut={() => void signOutOfFirebase()} />

  return (
    <div className="min-h-screen bg-base-200 text-base-content">
      <header className="topbar">
        <div className="topbar-inner">
          <button className="icon-button lg:hidden" aria-label="Open navigation" onClick={() => setMenuOpen(true)}><Menu size={21} /></button>
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
        <div className="sidebar-tip"><span className="tip-sun">✦</span><p>Everything saves only after you choose <strong>Save attendance</strong>.</p></div>
      </aside>
      {menuOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
      <main className="workspace">
        {tab === 'attendance' && <AttendancePanel workspace={workspace} onWorkspaceChange={refresh} />}
        {tab === 'notices' && <NoticesPanel threshold={workspace.school.noticeThreshold} />}
        {tab === 'students' && <StudentsPanel workspace={workspace} onChanged={refresh} />}
        {tab === 'classes' && <ClassesPanel workspace={workspace} onChanged={refresh} />}
        {tab === 'schedule' && <SchedulePanel workspace={workspace} />}
        {tab === 'import' && <ImportPanel workspace={workspace} onChanged={refresh} />}
      </main>
    </div>
  )
}

function Brand({ schoolName }: { schoolName: string }) { return <Link to="/" className="brand"><span className="brand-mark">a</span><span><strong>Attendance</strong><small>{schoolName}</small></span></Link> }

function LoginScreen() { const [error, setError] = useState(''); return <main className="auth-page"><section className="auth-card"><div className="brand-mark brand-mark-large">a</div><p className="eyebrow">School attendance</p><h1>A calmer way to take roll.</h1><p>Sign in with your approved Google account to begin.</p>{error && <p className="error-callout">{error}</p>}<button className="primary-button w-full" onClick={() => void signInWithGoogle().catch((cause) => setError(cause instanceof Error ? cause.message : 'Google sign-in could not start.'))}><span className="google-g">G</span> Continue with Google</button><p className="auth-fine">Only approved school administrators can access attendance records.</p></section></main> }
function SetupScreen() { return <main className="auth-page"><section className="auth-card"><div className="brand-mark brand-mark-large">a</div><p className="eyebrow">Secure setup</p><h1>Connect Firebase to begin.</h1><p>Add the Firebase web configuration to <code>.env</code>, then restart the app. No student data is available until a secure sign-in is configured.</p></section></main> }
function ApprovalScreen({ email, error, onSignOut }: { email: string; error: string; onSignOut: () => void }) { return <main className="auth-page"><section className="auth-card"><ShieldCheck className="mx-auto text-primary" size={38} /><p className="eyebrow">Approval required</p><h1>Your account is waiting for approval.</h1><p>{email || 'This Google account'} is signed in, but it does not yet have the school admin permission. Ask the school owner to approve it in Firebase, then sign out and sign back in.</p>{error && <p className="error-callout">{error}</p>}<button className="secondary-button" onClick={onSignOut}>Sign out</button></section></main> }
function ThemeButton() { const [dark, setDark] = useState(false); useEffect(() => setDark(document.documentElement.dataset.theme === 'dark'), []); return <button className="icon-button" aria-label="Toggle dark mode" onClick={() => { const next = !dark; setDark(next); document.documentElement.dataset.theme = next ? 'dark' : 'light'; localStorage.setItem('theme', next ? 'dark' : 'light') }}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button> }

function AttendancePanel({ workspace, onWorkspaceChange }: { workspace: Workspace; onWorkspaceChange: () => Promise<void> }) {
  const activeClasses = workspace.classes.filter((item) => item.active)
  const [classId, setClassId] = useState(activeClasses[0]?.id ?? '')
  const schoolClass = activeClasses.find((item) => item.id === classId) ?? activeClasses[0]
  const periods = (schoolClass?.periods ?? workspace.periods).filter((item) => item.attendanceRequired)
  const [periodId, setPeriodId] = useState(periods[0]?.id ?? '')
  const [date, setDate] = useState(isoToday())
  const [entries, setEntries] = useState<Record<string, AttendanceStatus>>({})
  const [savedAt, setSavedAt] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const rows = useMemo(() => workspace.students.filter((student) => student.active && student.classId === classId), [workspace.students, classId])
  const selectedPeriod = periods.find((period) => period.id === periodId)
  useEffect(() => { if (!periods.some((period) => period.id === periodId)) setPeriodId(periods[0]?.id ?? '') }, [classId, periods, periodId])
  useEffect(() => { if (!classId || !periodId) return; setMessage(''); void getAttendanceSheet({ data: { date, classId, periodId } }).then((sheet) => { setEntries(sheet.entries); setSavedAt(sheet.savedAt) }).catch((cause) => setMessage(cause instanceof Error ? cause.message : 'Could not load this attendance sheet.')) }, [date, classId, periodId])
  const completed = rows.length > 0 && rows.every((student) => entries[student.id])
  const counts = { P: 0, L: 0, A: 0 }; Object.values(entries).forEach((status) => { counts[status] += 1 })
  const chooseStatus = (studentId: string, status: AttendanceStatus) => setEntries((current) => ({ ...current, [studentId]: status }))
  const save = async () => { if (!completed || !selectedPeriod) return; setBusy(true); setMessage(''); try { const saved = await saveAttendanceSheet({ data: { date, classId, periodId, entries } }); setSavedAt(saved.savedAt); setMessage('Attendance saved.'); await onWorkspaceChange() } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Attendance could not be saved.') } finally { setBusy(false) } }
  useAttendanceWebMcp({ date, className: schoolClass?.name ?? '', periodName: selectedPeriod?.name ?? '', complete: completed, save })
  return <section className="content-section"><PageIntro eyebrow="Daily desk" title="Take attendance" text="Choose a class and period, then record one clear status for every student." />
    <div className="control-card sticky-controls">
      <label><span>Date</span><input className="input input-bordered" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
      <label><span>Class</span><select className="select select-bordered" value={classId} onChange={(event) => setClassId(event.target.value)}>{activeClasses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label><span>Period</span><select className="select select-bordered" value={periodId} onChange={(event) => setPeriodId(event.target.value)}>{periods.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.startTime}</option>)}</select></label>
      <div className="control-status"><strong>{Object.keys(entries).length} / {rows.length}</strong><span>marked</span></div>
    </div>
    <div className="attendance-layout">
      <div className="attendance-card">
        <div className="sheet-head"><div><h2>{schoolClass?.name ?? 'Choose a class'}</h2><p>{selectedPeriod ? `${selectedPeriod.name} · ${selectedPeriod.startTime}–${selectedPeriod.endTime}` : 'No attendance period available'}</p></div>{savedAt && <span className="saved-pill"><Check size={15} /> Saved</span>}</div>
        {rows.length ? <div className="student-sheet">{rows.map((student, index) => <div key={student.id} className="attendance-row" onKeyDown={(event) => { if (['p', 'l', 'a'].includes(event.key.toLowerCase())) chooseStatus(student.id, event.key.toUpperCase() as AttendanceStatus); if (event.key === 'ArrowDown') document.getElementById(`student-${rows[index + 1]?.id}`)?.focus(); if (event.key === 'ArrowUp') document.getElementById(`student-${rows[index - 1]?.id}`)?.focus() }} tabIndex={0} id={`student-${student.id}`}><span className="student-number">{index + 1}</span><strong>{student.displayName}</strong><div className="status-group" aria-label={`Attendance status for ${student.displayName}`}>{(['P', 'L', 'A'] as AttendanceStatus[]).map((status) => <button key={status} onClick={() => chooseStatus(student.id, status)} className={`status-button ${statusStyle[status]} ${entries[student.id] === status ? 'status-selected' : ''}`} aria-pressed={entries[student.id] === status}>{status}<span>{status === 'P' ? 'Present' : status === 'L' ? 'Late' : 'Absent'}</span></button>)}</div></div>)}</div> : <Empty title="No active students in this class" text="Add students individually or import a class list from CSV." tab="students" onTab={undefined} />}
      </div>
      <aside className="attendance-summary"><p className="eyebrow">Today’s count</p>{(['P', 'L', 'A'] as AttendanceStatus[]).map((status) => <div className={`count-card ${statusStyle[status]}`} key={status}><span>{status === 'P' ? 'Present' : status === 'L' ? 'Late' : 'Absent'}</span><strong>{counts[status]}</strong></div>)}<button className="primary-button w-full mt-4" disabled={!completed || busy || !rows.length} onClick={() => void save()}>{busy ? <span className="loading loading-spinner loading-sm" /> : <Check size={18} />} Save attendance</button><p className="save-hint">{completed ? 'Ready to save this sheet.' : `Mark ${Math.max(rows.length - Object.keys(entries).length, 0)} more student${rows.length - Object.keys(entries).length === 1 ? '' : 's'} to save.`}</p>{message && <p className={message === 'Attendance saved.' ? 'success-callout' : 'error-callout'}>{message}</p>}</aside>
    </div>
  </section>
}

function NoticesPanel({ threshold }: { threshold: number }) { const [notices, setNotices] = useState<Notice[]>([]); const [error, setError] = useState(''); const [loading, setLoading] = useState(true); useEffect(() => { void getNotices().then(setNotices).catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load notices.')).finally(() => setLoading(false)) }, []); return <section className="content-section"><PageIntro eyebrow="Follow up" title="Absence notices" text={`Students shown here have been absent for ${threshold} or more consecutive complete school days.`} />{loading ? <div className="app-loading"><span className="loading loading-spinner" /> Checking attendance…</div> : error ? <p className="error-callout">{error}</p> : notices.length ? <div className="notice-list">{notices.map((notice) => <article key={notice.studentId} className="notice-card"><div className="notice-avatar">{notice.studentName[0]}</div><div><h2>{notice.studentName}</h2><p>{notice.className} · last absent {notice.lastAbsentDate}</p></div><strong className="streak-badge">{notice.consecutiveDays} days</strong><ChevronRight className="ml-auto opacity-40" /></article>)}</div> : <Empty title="No absence notices right now" text="Students will appear here only after complete attendance sheets show a consecutive absence streak." />}</section> }

function StudentsPanel({ workspace, onChanged }: { workspace: Workspace; onChanged: () => Promise<void> }) { const [filter, setFilter] = useState(''); const [classId, setClassId] = useState('all'); const [name, setName] = useState(''); const [newClassId, setNewClassId] = useState(workspace.classes.find((item) => item.active)?.id ?? ''); const [error, setError] = useState(''); const studentList = workspace.students.filter((student) => (classId === 'all' || student.classId === classId) && student.displayName.toLowerCase().includes(filter.toLowerCase())); const add = async () => { if (!name.trim() || !newClassId) return; try { await saveStudent({ data: { displayName: name, classId: newClassId } }); setName(''); await onChanged() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Student could not be saved.') } }; return <section className="content-section"><PageIntro eyebrow="Class lists" title="Students" text="Keep names and class placement tidy. Archived students stay in the attendance history." /><div className="management-toolbar"><div className="search-control"><Search size={18} /><input placeholder="Search students" value={filter} onChange={(event) => setFilter(event.target.value)} /></div><select className="select select-bordered" value={classId} onChange={(event) => setClassId(event.target.value)}><option value="all">All classes</option>{workspace.classes.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><div className="split-management"><div className="table-card"><div className="table-card-head"><h2>{studentList.length} students</h2></div>{studentList.length ? <div className="student-list">{studentList.map((student) => <div key={student.id} className={`student-manage-row ${student.active ? '' : 'opacity-50'}`}><div className="avatar-fallback">{student.displayName[0]}</div><div><strong>{student.displayName}</strong><span>{workspace.classes.find((item) => item.id === student.classId)?.name ?? 'Unassigned'}</span></div><button className="text-button ml-auto" onClick={() => void archiveStudent({ data: { id: student.id, active: !student.active } }).then(onChanged)}> {student.active ? 'Archive' : 'Restore'}</button></div>)}</div> : <Empty title="No matching students" text="Try another class or add a student." />}</div><aside className="form-card"><p className="eyebrow">Add student</p><h2>One at a time</h2><label><span>Student name</span><input className="input input-bordered" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Amina Khan" /></label><label><span>Class</span><select className="select select-bordered" value={newClassId} onChange={(event) => setNewClassId(event.target.value)}>{workspace.classes.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button className="primary-button w-full" onClick={() => void add()}><Plus size={18} /> Add student</button>{error && <p className="error-callout">{error}</p>}</aside></div></section> }

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

function ImportPanel({ workspace, onChanged }: { workspace: Workspace; onChanged: () => Promise<void> }) { const [preview, setPreview] = useState<Array<{ displayName: string; classId: string; error?: string }>>([]); const [message, setMessage] = useState(''); const inputRef = useRef<HTMLInputElement>(null); const onFile = async (file?: File) => { if (!file) return; const contents = await file.text(); const [headerLine, ...lines] = contents.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean); const headers = headerLine.split(',').map((item) => item.trim().toLowerCase()); const nameIndex = headers.findIndex((item) => ['name', 'student', 'student name', 'display_name'].includes(item)); const classIndex = headers.findIndex((item) => ['class', 'grade', 'class name'].includes(item)); if (nameIndex < 0 || classIndex < 0) { setMessage('Your CSV needs a name column and a class column.'); return } const known = new Map(workspace.classes.map((item) => [item.name.toLowerCase(), item.id])); setPreview(lines.slice(0, 1000).map((line) => { const parts = line.split(',').map((item) => item.trim()); const classId = known.get((parts[classIndex] ?? '').toLowerCase()) ?? ''; return { displayName: parts[nameIndex] ?? '', classId, error: !parts[nameIndex] ? 'Missing name' : !classId ? 'Class not found' : undefined } })); setMessage('') }; const validRows = preview.filter((row) => !row.error); const commit = async () => { try { const result = await importStudents({ data: { rows: validRows.map(({ displayName, classId }) => ({ displayName, classId })) } }); setMessage(`${result.created} students added; ${result.skipped} duplicates skipped.`); setPreview([]); await onChanged() } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Import could not be completed.') } }; return <section className="content-section"><PageIntro eyebrow="Bulk intake" title="Import students" text="Bring in a simple CSV with name and class columns. We check every row before adding anyone." /><input className="hidden" ref={inputRef} type="file" accept=".csv,text/csv" onChange={(event) => void onFile(event.target.files?.[0])} /><button className="upload-zone" onClick={() => inputRef.current?.click()}><FileSpreadsheet size={33} /><strong>Choose a CSV file</strong><span>Required columns: name, class</span></button>{message && <p className={message.includes('added') ? 'success-callout' : 'error-callout'}>{message}</p>}{preview.length > 0 && <div className="table-card mt-6"><div className="table-card-head"><div><h2>Review {preview.length} rows</h2><p>{validRows.length} ready to import</p></div><button className="primary-button" disabled={!validRows.length} onClick={() => void commit()}>Import {validRows.length} students</button></div><div className="import-preview">{preview.slice(0, 30).map((row, index) => <div key={`${row.displayName}-${index}`} className={row.error ? 'import-row import-error' : 'import-row'}><span>{index + 1}</span><strong>{row.displayName || '—'}</strong><span>{workspace.classes.find((item) => item.id === row.classId)?.name ?? row.error}</span>{row.error ? <span className="text-error">Needs attention</span> : <Check className="text-success" size={17} />}</div>)}</div></div>}</section> }

function PageIntro({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) { return <div className="page-intro"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{text}</p></div> }
function Empty({ title, text }: { title: string; text: string; tab?: Tab; onTab?: ((tab: Tab) => void) | undefined }) { return <div className="empty-state"><ClipboardCheck size={28} /><h2>{title}</h2><p>{text}</p></div> }
