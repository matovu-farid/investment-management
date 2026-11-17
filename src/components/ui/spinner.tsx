import { LoaderCircle } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'

function Spinner({ className, ...props }: ComponentProps<typeof LoaderCircle>) {
  return <LoaderCircle data-slot="spinner" aria-hidden="true" className={className} {...props} />
}

function SpinnerLabel({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center gap-2"><Spinner className="animate-spin" /><span>{children}</span></span>
}

function SpinnerStatus({ label, className = '' }: { label: string; className?: string }) {
  return <div role="status" aria-live="polite" aria-label={label} className={`inline-flex items-center gap-2 text-sm text-muted-foreground ${className}`}>
    <Spinner className="size-4 animate-spin text-primary" />
    <span>{label}</span>
  </div>
}

export { Spinner, SpinnerLabel, SpinnerStatus }
