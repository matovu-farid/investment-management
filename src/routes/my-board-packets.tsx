import { loadRouteInParallel } from '#/lib/parallel-route-loading'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { getSession } from '#/lib/auth.functions'
import { BoardPacketSummaryView } from '#/components/board-packet-summary'
import { PacketContents } from '#/components/board-packet-contents'
import { listMyBoardPacketsFn } from '#/server/board-packet-access/functions'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '#/components/ui/accordion'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'

export const Route = createFileRoute('/my-board-packets')({
  beforeLoad: async () => { const { auth, data } = await loadRouteInParallel(async () => { if (!await getSession()) throw redirect({ to: '/login' }) }, async () => listMyBoardPacketsFn().catch(() => null)); return { ...(auth ?? {}), __parallelData: data } },
  loader: ({ context }) => context.__parallelData,
  component: MyBoardPackets,
})

function MyBoardPackets() {
  const packets = Route.useLoaderData()
  return <div className="app"><header><Link to="/" className="brand"><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/" className="quiet">Back to overview</Link></header><main className="dashboard flex flex-col gap-6">
    <div><p className="eyebrow">MEMBER PORTAL</p><h1>Shared board-pack drafts</h1><p className="lead">Review drafts shared with your account.</p></div>
    <Alert><AlertDescription>These frozen drafts may include private financial information, named share sellers and member interest. Sharing does not mean a draft has been approved.</AlertDescription></Alert>
    {packets === null ? <Alert variant="destructive" role="alert"><AlertDescription className="flex flex-col items-start gap-3"><p>Shared drafts are unavailable. Check your account access and reload.</p><Button type="button" variant="outline" onClick={() => window.location.reload()}>Reload</Button></AlertDescription></Alert> : <Card><CardHeader><CardTitle role="heading" aria-level={2}>Available drafts ({packets.length})</CardTitle><CardDescription>Open a draft to review its contents and download its reports.</CardDescription></CardHeader><CardContent>{packets.length === 0 ? <p>No board-pack drafts are currently shared with this account.</p> : <Accordion type="multiple">{packets.map(p => <AccordionItem value={p.id} key={p.id}><AccordionTrigger><span className="flex flex-col items-start gap-1 text-left"><span>{p.packet.start} to {p.packet.end}</span><span className="text-sm font-normal text-muted-foreground">Saved {p.createdAt} UTC · access granted {p.grantedAt} UTC</span></span></AccordionTrigger><AccordionContent><p className="mb-4 text-sm text-muted-foreground">Draft {p.id}</p>{p.shareMode==='summary'?<BoardPacketSummaryView summary={p.packet}/>:<PacketContents packet={p.packet}/>}</AccordionContent></AccordionItem>)}</Accordion>}</CardContent></Card>}
  </main></div>
}
