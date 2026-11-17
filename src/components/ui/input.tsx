import * as React from "react"
import { cn } from "#/lib/utils"
import { useHydrated } from "#/lib/use-hydrated"

function Input({ className, type, disabled, ...props }: React.ComponentProps<"input">) {
  const hydrated = useHydrated()
  return (
    <input
      type={type}
      disabled={disabled || !hydrated}
      data-slot="input"
      className={cn(
        "h-[var(--control-height)] w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 text-base text-foreground shadow-xs transition-[color,border-color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
