import * as React from 'react'
import { CalendarDays } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Calendar } from '#/components/ui/calendar'
import { Input } from '#/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '#/components/ui/popover'

// Construct local calendar dates explicitly; parsing an ISO date as UTC can shift
// the selected day in time zones west of Greenwich.
function parseDate(value: string | undefined): Date | undefined {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '')
  if (!parts) return undefined
  const year = Number(parts[1]), month = Number(parts[2]), day = Number(parts[3])
  const date = new Date(0)
  date.setFullYear(year, month - 1, day)
  date.setHours(12, 0, 0, 0)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : undefined
}

function formatDate(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function DatePickerInput({ type: _type, value, defaultValue, onChange, disabled, min, max, ref, ...props }: React.ComponentProps<'input'>) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [open, setOpen] = React.useState(false)
  const [uncontrolledValue, setUncontrolledValue] = React.useState(String(defaultValue ?? ''))
  const current = typeof value === 'string' ? value : uncontrolledValue
  const selected = parseDate(current)
  const earliest = parseDate(typeof min === 'string' ? min : undefined)
  const latest = parseDate(typeof max === 'string' ? max : undefined)
  const [month, setMonth] = React.useState<Date | undefined>(selected)

  React.useEffect(() => {
    const form = inputRef.current?.form
    if (!form) return
    const reset = () => setUncontrolledValue(String(defaultValue ?? ''))
    form.addEventListener('reset', reset)
    return () => form.removeEventListener('reset', reset)
  }, [defaultValue])

  function select(date: Date | undefined) {
    const input = inputRef.current
    if (!date || !input || input.matches(':disabled') || input.readOnly) return
    const next = formatDate(date)
    // Use the native setter so React's change tracking sees the dispatched input.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, next)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    setUncontrolledValue(next)
    setOpen(false)
  }

  return (
    <div className="relative w-full min-w-0">
      <Input {...props} ref={(node) => {
        inputRef.current = node
        if (typeof ref === 'function') ref(node)
        else if (ref) ref.current = node
      }} type="date" value={value} defaultValue={defaultValue} min={min} max={max} disabled={disabled}
        className={`${props.className ?? ''} pr-11 [&::-webkit-calendar-picker-indicator]:opacity-0`}
        onChange={(event) => { setUncontrolledValue(event.currentTarget.value); onChange?.(event) }} />
      <Popover open={open} onOpenChange={(next) => {
        if (next && (inputRef.current?.matches(':disabled') || inputRef.current?.readOnly)) return
        if (next) setMonth(parseDate(inputRef.current?.value) ?? undefined)
        setOpen(next)
      }}>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="icon-sm" disabled={disabled || props.readOnly} aria-label="Open calendar" className="absolute right-1 top-1/2 -translate-y-1/2">
            <CalendarDays aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-0">
          <Calendar mode="single" selected={selected} onSelect={select} month={month} onMonthChange={setMonth} captionLayout="dropdown"
            startMonth={new Date(Math.min(1900, earliest?.getFullYear() ?? 1900, selected?.getFullYear() ?? 1900), 0)}
            endMonth={new Date(Math.max(2100, latest?.getFullYear() ?? 2100, selected?.getFullYear() ?? 2100), 11)}
            disabled={[...(earliest ? [{ before: earliest }] : []), ...(latest ? [{ after: latest }] : [])]} autoFocus />
        </PopoverContent>
      </Popover>
    </div>
  )
}

export { DatePickerInput, formatDate, parseDate }
