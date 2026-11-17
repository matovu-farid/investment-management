import * as React from 'react'
import { CalendarDays } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Calendar } from '#/components/ui/calendar'
import { Input } from '#/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '#/components/ui/popover'
import { cn } from '#/lib/utils'

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

function DatePickerInput({ type: _type, value, defaultValue, onChange, onFocus, onBlur, disabled, min, max, ref, name, required, readOnly: _readOnly, ...props }: React.ComponentProps<'input'>) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [open, setOpen] = React.useState(false)
  const [uncontrolledValue, setUncontrolledValue] = React.useState(String(defaultValue ?? ''))
  const current = typeof value === 'string' ? value : uncontrolledValue
  const selected = parseDate(current)
  const earliest = parseDate(typeof min === 'string' ? min : undefined)
  const latest = parseDate(typeof max === 'string' ? max : undefined)
  const [month, setMonth] = React.useState<Date | undefined>(selected)
  const [draft, setDraft] = React.useState('')
  const [editing, setEditing] = React.useState(false)

  function formatDisplay(date: Date | undefined): string {
    return date ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date) : ''
  }

  function parseDisplay(input: string): Date | undefined {
    const parts = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(input.trim())
    if (!parts) return undefined
    const day = Number(parts[1]), month = Number(parts[2]), year = Number(parts[3])
    const date = new Date(0)
    date.setFullYear(year, month - 1, day)
    date.setHours(12, 0, 0, 0)
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : undefined
  }

  React.useEffect(() => {
    if (!editing) setDraft(formatDisplay(selected))
  }, [current, editing])

  React.useEffect(() => {
    const form = inputRef.current?.form
    if (!form) return
    const reset = () => setUncontrolledValue(String(defaultValue ?? ''))
    form.addEventListener('reset', reset)
    return () => form.removeEventListener('reset', reset)
  }, [defaultValue])

  function select(date: Date | undefined) {
    const input = inputRef.current
    if (!date || !input || input.matches(':disabled') || _readOnly) return
    const next = formatDate(date)
    setUncontrolledValue(next)
    setDraft(formatDisplay(date))
    input.setCustomValidity('')
    // Keep the public onChange contract in ISO format even though the visible
    // field is localized for people and the successful form value is hidden.
    onChange?.({ target: { value: next }, currentTarget: { value: next } } as React.ChangeEvent<HTMLInputElement>)
    setOpen(false)
  }

  function editDisplay(nextDisplay: string, input: HTMLInputElement) {
    setDraft(nextDisplay)
    const date = parseDisplay(nextDisplay)
    if (nextDisplay === '') {
      input.setCustomValidity('')
      setUncontrolledValue('')
      onChange?.({ target: { value: '' }, currentTarget: { value: '' } } as React.ChangeEvent<HTMLInputElement>)
      return
    }
    if (!date) {
      input.setCustomValidity('Enter a valid date as DD/MM/YYYY.')
      return
    }
    if ((earliest && date < earliest) || (latest && date > latest)) {
      input.setCustomValidity('Choose a date within the allowed range.')
      return
    }
    input.setCustomValidity('')
    const next = formatDate(date)
    setUncontrolledValue(next)
    onChange?.({ target: { value: next }, currentTarget: { value: next } } as React.ChangeEvent<HTMLInputElement>)
  }

  return (
    <div className="relative w-full min-w-0">
      <Input {...props} ref={(node) => {
        inputRef.current = node
        if (typeof ref === 'function') ref(node)
        else if (ref) ref.current = node
      }} type="text" value={draft} placeholder={props.placeholder ?? 'dd/mm/yyyy'} required={required} disabled={disabled} readOnly={_readOnly}
        className={cn('h-9 pr-11 tabular-nums', props.className)}
        aria-haspopup="dialog" aria-readonly={_readOnly || undefined}
        onFocus={event => { setEditing(true); onFocus?.(event) }}
        onChange={event => editDisplay(event.currentTarget.value, event.currentTarget)}
        onBlur={event => { setEditing(false); if (!event.currentTarget.validity.customError) setDraft(formatDisplay(parseDate(current))); onBlur?.(event) }} />
      {name && <input type="hidden" name={name} value={current} disabled={disabled} />}
      <Popover open={open} onOpenChange={(next) => {
        if (next && (inputRef.current?.matches(':disabled') || _readOnly)) return
        if (next) setMonth(selected)
        setOpen(next)
      }}>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="icon" disabled={disabled || _readOnly} aria-label="Choose date" aria-haspopup="dialog" className="absolute right-0 top-1/2 -translate-y-1/2">
            <CalendarDays aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto border border-border bg-popover p-0 text-popover-foreground shadow-lg">
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
