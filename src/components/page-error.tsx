import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'

// Loader and render errors can contain implementation details. Keep the
// recovery view generic; access decisions are still enforced on the server.
export function PageError() {
  return <main className="dashboard flex min-h-screen items-center justify-center">
    <Card className="w-full max-w-xl">
      <CardHeader><CardTitle role="heading" aria-level={1}>This page is unavailable</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Alert variant="destructive" role="alert"><AlertTitle>Unable to open this page</AlertTitle><AlertDescription>You may not have access, or there may be a temporary problem. Try again or return to your overview.</AlertDescription></Alert>
        <div className="flex flex-wrap gap-2"><Button type="button" onClick={() => window.location.reload()}>Try again</Button><Button variant="outline" asChild><a href="/">Back to overview</a></Button></div>
      </CardContent>
    </Card>
  </main>
}
