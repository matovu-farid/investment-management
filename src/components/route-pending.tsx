import { Card, CardContent } from '#/components/ui/card'
import { Spinner } from '#/components/ui/spinner'

export function RoutePending({ label = 'Opening your workspace' }: { label?: string }) {
  return <main className="dashboard" role="status" aria-live="polite" aria-label={label}>
    <Card className="mx-auto mt-12 max-w-md shadow-sm">
      <CardContent className="flex min-h-28 items-center justify-center gap-3 text-sm text-muted-foreground">
        <Spinner className="size-5 animate-spin text-primary" />
        <span>{label}</span>
      </CardContent>
    </Card>
  </main>
}
