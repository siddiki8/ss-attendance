import { useEffect } from 'react'

declare global {
  interface Document {
    modelContext?: {
      registerTool: (tool: {
        name: string
        title: string
        description: string
        inputSchema: Record<string, unknown>
        execute: (input: unknown) => Promise<unknown> | unknown
        annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean }
      }, options?: { signal: AbortSignal }) => void | Promise<void>
    }
  }
}

export function useAttendanceWebMcp(input: {
  date: string
  className: string
  periodName: string
  complete: boolean
  save: () => Promise<void>
}) {
  useEffect(() => {
    const context = document.modelContext
    if (!context) return
    const lifecycle = new AbortController()
    void Promise.resolve(context.registerTool({
      name: 'get_current_attendance_sheet',
      title: 'Current attendance sheet',
      description: 'Read the date, class, period, and completion state currently visible in the attendance workspace.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: () => ({ date: input.date, className: input.className, periodName: input.periodName, complete: input.complete }),
      annotations: { readOnlyHint: true, untrustedContentHint: false },
    }, { signal: lifecycle.signal })).catch(() => undefined)
    void Promise.resolve(context.registerTool({
      name: 'save_current_attendance_sheet',
      title: 'Save current attendance sheet',
      description: 'Save the fully completed attendance sheet currently visible in the workspace.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: async () => { if (!input.complete) throw new Error('Every student must be marked before this sheet can be saved.'); await input.save(); return { saved: true, date: input.date, className: input.className, periodName: input.periodName } },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
    }, { signal: lifecycle.signal })).catch(() => undefined)
    return () => lifecycle.abort()
  }, [input])
}
