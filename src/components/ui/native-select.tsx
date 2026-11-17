import * as React from 'react'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { Select as SelectPrimitive } from 'radix-ui'
import { cn } from '#/lib/utils'
import { useHydrated } from '#/lib/use-hydrated'
import { FieldError } from '#/components/ui/field'

type Option = { value: string; label: React.ReactNode; disabled: boolean }
type Group = { label: string; options: Option[]; disabled: boolean }
type Entry = Option | Group

// Existing forms use both native option elements and NativeSelectOption. Keep
// their declarative children while rendering Radix's accessible select menu.
function collectEntries(children: React.ReactNode, inheritedDisabled = false): Entry[] {
  return React.Children.toArray(children).flatMap((child): Entry[] => {
    if (!React.isValidElement<{ value?: string | number; label?: string; disabled?: boolean; children?: React.ReactNode }>(child)) return []
    if (child.type === React.Fragment) return collectEntries(child.props.children, inheritedDisabled)
    if (child.type === 'optgroup' || child.type === NativeSelectOptGroup) {
      const disabled = inheritedDisabled || !!child.props.disabled
      return [{ label: child.props.label ?? '', disabled, options: collectEntries(child.props.children, disabled).flatMap(entry => 'options' in entry ? entry.options : [entry]) }]
    }
    if (child.type !== 'option' && child.type !== NativeSelectOption) return []
    const value = child.props.value ?? (typeof child.props.children === 'string' ? child.props.children : '')
    return [{ value: String(value), label: child.props.children, disabled: inheritedDisabled || !!child.props.disabled }]
  })
}

function NativeSelect({
  className, size = 'default', disabled, children, value, defaultValue,
  onChange, name, required, form, autoComplete, id, style, title, tabIndex,
  onBlur, onFocus, ...props
}: Omit<React.ComponentProps<'select'>, 'size'> & { size?: 'sm' | 'default' }) {
  const hydrated = useHydrated()
  const entries = collectEntries(children)
  const options = entries.flatMap(entry => 'options' in entry ? entry.options : [entry])
  const firstEnabled = options.find(option => !option.disabled)?.value ?? ''
  const [uncontrolled, setUncontrolled] = React.useState(() => String(defaultValue ?? firstEnabled))
  const selected = value === undefined ? uncontrolled : String(value)
  const selectedOption = options.find(option => option.value === selected)
  const effectiveValue = selectedOption ? selected : ''
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const errorId = React.useId()
  const [invalid, setInvalid] = React.useState(false)
  React.useEffect(() => { if (effectiveValue || disabled || !required) setInvalid(false) }, [effectiveValue, disabled, required])
  const emptyOption = options.find(option => option.value === '')
  // Radix reserves the empty value for its placeholder and native required
  // validation. A menu-only sentinel lets optional fields clear their value.
  let clearValue = '__rnig_clear_selection__'
  while (options.some(option => option.value === clearValue)) clearValue += '_'
  const onValueChange = (next: string) => {
    const nextValue = next === clearValue ? '' : next
    if (nextValue) setInvalid(false)
    if (value === undefined) setUncontrolled(nextValue)
    if (onChange) {
      // Existing forms consume the standard target.value / currentTarget.value
      // shape. The native form select remains managed by Radix.
      const target = { value: nextValue } as HTMLSelectElement
      onChange({ target, currentTarget: target, type: 'change' } as React.ChangeEvent<HTMLSelectElement>)
    }
  }
  const optionElement = (option: Option, key: string) => (
    <SelectPrimitive.Item
      key={key}
      value={option.value === '' ? clearValue : option.value}
      disabled={option.disabled}
      data-slot="select-item"
      data-value={option.value}
      className="relative flex w-full cursor-default items-center rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
    >
      <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
      <span className="absolute right-2 flex size-3.5 items-center justify-center"><SelectPrimitive.ItemIndicator><Check className="size-4" /></SelectPrimitive.ItemIndicator></span>
    </SelectPrimitive.Item>
  )
  return (
    <div className="group/native-select relative w-full min-w-0 max-w-full" data-slot="native-select-wrapper" onInvalidCapture={event => {
      if (event.target instanceof HTMLSelectElement && event.target.validity.valueMissing) {
        event.preventDefault()
        setInvalid(true)
        triggerRef.current?.focus()
      }
    }}>
    <SelectPrimitive.Root value={effectiveValue} onValueChange={onValueChange} disabled={disabled || !hydrated} required={required} name={name} form={form} autoComplete={autoComplete}>
      <SelectPrimitive.Trigger
        ref={triggerRef} id={id} title={title} tabIndex={tabIndex} style={style} onBlur={onBlur as unknown as React.FocusEventHandler<HTMLButtonElement>} onFocus={onFocus as unknown as React.FocusEventHandler<HTMLButtonElement>}
        aria-label={props['aria-label']} aria-labelledby={props['aria-labelledby']} aria-describedby={[props['aria-describedby'], invalid ? errorId : undefined].filter(Boolean).join(' ') || undefined} aria-invalid={invalid || props['aria-invalid'] || undefined} aria-required={required || undefined}
        data-slot="select-trigger" data-size={size} data-value={effectiveValue}
        className={cn('flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[size=sm]:h-8 md:text-sm dark:bg-input/30 dark:hover:bg-input/50 [&>span]:truncate', className)}
      >
        <SelectPrimitive.Value placeholder={emptyOption?.label ?? 'Select an option'}>{selectedOption?.label}</SelectPrimitive.Value>
        <SelectPrimitive.Icon asChild><ChevronDown className="size-4 shrink-0 opacity-50" aria-hidden="true" /></SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content position="popper" sideOffset={4} data-slot="select-content" className="relative z-50 max-h-(--radix-select-content-available-height) min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
          <SelectPrimitive.ScrollUpButton className="flex items-center justify-center py-1"><ChevronUp className="size-4" /></SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="p-1 min-w-[var(--radix-select-trigger-width)]">
            <SelectPrimitive.Group>
              {entries.map((entry, index) => 'options' in entry ? (
                <SelectPrimitive.Group key={`group-${index}`}>
                  <SelectPrimitive.Label className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{entry.label}</SelectPrimitive.Label>
                  {entry.options.map((option, childIndex) => optionElement(option, `${index}-${childIndex}`))}
                </SelectPrimitive.Group>
              ) : optionElement(entry, String(index)))}
            </SelectPrimitive.Group>
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="flex items-center justify-center py-1"><ChevronDown className="size-4" /></SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
    {invalid && <FieldError id={errorId} className="mt-1">Select an option.</FieldError>}
    </div>
  )
}

function NativeSelectOption(_props: React.ComponentProps<'option'>) { return null }
function NativeSelectOptGroup(_props: React.ComponentProps<'optgroup'>) { return null }
export { NativeSelect, NativeSelectOptGroup, NativeSelectOption }
