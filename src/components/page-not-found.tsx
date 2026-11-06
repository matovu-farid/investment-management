import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'

export function PageNotFound() {
  return <main className="dashboard flex min-h-screen items-center justify-center">
    <Card className="w-full max-w-xl">
      <CardHeader><CardTitle role="heading" aria-level={1}>Page not found</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p>We couldn’t find that page. Check the address or return to your overview.</p>
        <Button variant="outline" asChild><a href="/">Back to overview</a></Button>
      </CardContent>
    </Card>
  </main>
}
