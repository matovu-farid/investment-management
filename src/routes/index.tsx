import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { getSession } from '#/lib/auth.functions'
import { authClient } from '#/lib/auth-client'
import { useState } from 'react'
import { signOutWithPendingProtection } from '#/lib/pending-requests/signout'
import { getDashboardFn } from '#/server/dashboard/functions'
import { memberShareValuesFn } from '#/server/share-values/functions'
import { listFundObservationsFn } from '#/server/fund-observations/functions'
import { latestFundObservations } from '#/lib/latest-fund-observation'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '#/components/ui/accordion'
import './dashboard.css'

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const session = await getSession()
    if (!session) throw redirect({ to: '/login' })
    try {
      const overview = await getDashboardFn()
      const [shareValues, fundObservations] = await Promise.all([
        overview.kind === 'member' ? memberShareValuesFn().catch(() => null) : null,
        overview.kind === 'admin' ? listFundObservationsFn().catch(() => null) : null,
      ])
      return { user: session.user, overview, shareValues, fundObservations }
    } catch { return { user: session.user, overview: null, shareValues: null, fundObservations: null } }
  },
  pendingComponent: () => <main className="dashboard" role="status">Loading your workspace…</main>,
  component: Dashboard,
})
function Dashboard() {
  const { user, overview, shareValues, fundObservations } = Route.useRouteContext()
  const [signOutError, setSignOutError] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  async function signOut() {
    setSigningOut(true); setSignOutError('')
    try {
      const result = await signOutWithPendingProtection(() => window.sessionStorage, user.id, reason => window.confirm(reason === 'unavailable' ? 'This browser cannot check pending requests. Signing out may leave request details on this device, and a new submission could create a duplicate. Sign out anyway?' : 'This tab has requests whose outcome is uncertain. Signing out removes their saved details from this tab. Check the registers first; a new submission could create a duplicate. Sign out anyway?'), () => authClient.signOut())
      if (result.signedOut) {
        try { if (result.cleanupFailed) window.alert('You are signed out, but this browser could not clear pending request details from this tab. Close the tab and check the registers before resubmitting.') }
        finally { window.location.href = '/login' }
      }
    } catch { setSignOutError('Sign-out could not be confirmed. Check your connection and try again.') }
    finally { setSigningOut(false) }
  }
  const isAdmin = overview?.kind === 'admin'
  const latestIndividualValue = shareValues?.find(value => value.kind === 'individual')
  const latestFunds = fundObservations ? latestFundObservations(fundObservations.observations) : []
  return <div><header className="flex items-center justify-between border-b bg-card px-[6%] py-5"><div className="brand"><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></div><Button variant="outline" disabled={signingOut} onClick={signOut}>{signingOut ? 'Signing out…' : 'Sign out'}</Button></header>
    <main className="dashboard">
      {signOutError && <Alert variant="destructive"><AlertTitle>Sign out unavailable</AlertTitle><AlertDescription>{signOutError}</AlertDescription></Alert>}
      <Badge variant="secondary">{isAdmin ? 'Administration' : 'Member portal'}</Badge>
      <h1>Welcome, {user.name.split(' ')[0]}.</h1>
      <p className="lead">{isAdmin ? 'An overview of the records in your workspace.' : 'Your records and share notices are available below.'}</p>
      {overview?.kind === 'member' && <Card className="mt-6"><CardHeader><CardTitle>My published share value</CardTitle><CardDescription>The most recently published individual value, based on the dates and source shown.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">{shareValues === null ? <p>Your published value is unavailable. If your account is not linked to an active member record, contact the administrator.</p> : latestIndividualValue ? <><p className="text-3xl font-semibold tabular-nums">{latestIndividualValue.currency} {BigInt(latestIndividualValue.valueMinor).toLocaleString('en-US')} <span className="text-sm font-normal text-muted-foreground">minor units</span></p><p className="text-sm text-muted-foreground">{BigInt(latestIndividualValue.shares).toLocaleString('en-US')} shares observed {latestIndividualValue.observedDate} · price dated {latestIndividualValue.priceDate} · {latestIndividualValue.basis} · source: {latestIndividualValue.priceSource}</p><p className="text-sm text-muted-foreground">Indicative value; joint holdings are shown separately.</p></> : <p>No individual share value has been published for you yet.</p>}<Link to="/my-share-values">View published share values →</Link></CardContent></Card>}
      <Card className="mt-6"><CardHeader><CardTitle>Member access</CardTitle><CardDescription>View your records and information shared with the group.</CardDescription></CardHeader><CardContent><nav className="overview-links" aria-label="Member navigation"><Link to="/my-portfolio" className="quiet">My records →</Link><Link to="/market" className="quiet">Share notices →</Link><Link to="/group-trades" className="quiet">Share trade history →</Link><Link to="/group-investments" className="quiet">Group investments →</Link><Link to="/group-books" className="quiet">Group books →</Link><Link to="/my-board-packets" className="quiet">Shared board packs →</Link></nav></CardContent></Card>
      {!overview && <Alert variant="destructive"><AlertTitle>Workspace overview unavailable</AlertTitle><AlertDescription>We could not check your access or load the overview. Refresh the page to try again.</AlertDescription></Alert>}
      {isAdmin && <>
        <section className="overview-section" aria-labelledby="overview-heading"><div className="overview-heading"><div><p className="eyebrow">RECORDED ACTIVITY</p><h2 id="overview-heading">Workspace overview</h2></div><Link to="/reports">View activity report →</Link></div>
          {overview.counts ? <><div className="overview-grid">
            <Card><CardHeader><CardDescription>Active members</CardDescription><CardTitle className="text-3xl tabular-nums">{overview.counts.activeMembers.toLocaleString('en-US')}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Member records marked active</p></CardContent></Card>
            <Card><CardHeader><CardDescription>Loans recorded</CardDescription><CardTitle className="text-3xl tabular-nums">{overview.counts.loans.toLocaleString('en-US')}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Loan records not currently voided</p></CardContent></Card>
            <Card><CardHeader><CardDescription>Stored status: waiting</CardDescription><CardTitle className="text-3xl tabular-nums">{overview.counts.waitingBookings.toLocaleString('en-US')}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Records with waiting status</p></CardContent></Card>
            <Card><CardHeader><CardDescription>Stored status: held</CardDescription><CardTitle className="text-3xl tabular-nums">{overview.counts.heldBookings.toLocaleString('en-US')}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Records with held status</p></CardContent></Card>
            <Card><CardHeader><CardDescription>Investments recorded</CardDescription><CardTitle className="text-3xl tabular-nums">{overview.counts.investments.toLocaleString('en-US')}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">All investment records</p></CardContent></Card>
          </div><p className="footnote">Counts include all recorded items, including future-dated entries; they are not outstanding balances. Booking counts use the stored status field, even when a booking is fully fulfilled. Hold and resume history is recorded separately and does not update that field.</p></> : <Alert variant="destructive"><AlertTitle>Overview counts unavailable</AlertTitle><AlertDescription>Records could not be counted. Refresh the page to try again; the registers remain available below.</AlertDescription></Alert>}
        </section>
        <Card className="mt-6"><CardHeader><CardTitle role="heading" aria-level={2}>Reported Kanungu fund availability</CardTitle><CardDescription>Non-void observations on the latest recorded date. These are reported amounts, not calculated cash balances or lending approval.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">{fundObservations === null ? <p>Fund observations are unavailable. Open the register or refresh to try again.</p> : latestFunds.length ? <><div className="grid gap-3 sm:grid-cols-2">{latestFunds.map(item => <article key={item.id} className="flex min-w-0 flex-col gap-2 rounded-md border p-4"><p className="m-0 text-2xl font-semibold tabular-nums">{item.currency} {BigInt(item.amountMinor).toLocaleString('en-US')} <span className="text-sm font-normal text-muted-foreground">minor units</span></p><p className="m-0 break-words text-sm text-muted-foreground">Observed {item.observedDate} · basis: {item.basis} · source: {item.source}</p></article>)}</div><p className="m-0 text-sm text-muted-foreground">Observations are shown separately and are not combined. Earlier dates are available in the register.</p></> : <p>No fund availability observations have been recorded.</p>}<Link to="/fund-observations">View fund observations →</Link></CardContent></Card>
        <section className="overview-section" aria-labelledby="registers-heading">
          <div className="workspace-title"><div><p className="eyebrow">WORKSPACE</p><h2 id="registers-heading">Registers and tools</h2><p>Choose an area to manage its records, or open its supporting tools.</p></div></div>
          <nav className="workspace-grid" aria-label="Administrative registers">
            <Card aria-labelledby="nav-members"><CardHeader><CardTitle id="nav-members">Members &amp; shares</CardTitle><CardDescription>People, ownership records and share activity</CardDescription></CardHeader><CardContent><div className="workspace-primary"><Link to="/members">Members <span aria-hidden="true">→</span></Link><Link to="/shares">Shares <span aria-hidden="true">→</span></Link><Link to="/share-sales">Share sales <span aria-hidden="true">→</span></Link></div><Accordion type="single" collapsible><AccordionItem value="tools"><AccordionTrigger>Member and share tools</AccordionTrigger><AccordionContent><div className="workspace-secondary"><Link to="/member-import">Import members</Link><Link to="/member-changes">Correct member records</Link><Link to="/invitations">Member invitations</Link><Link to="/share-event-void">Correct share events</Link><Link to="/holding-observations">Holding observations</Link><Link to="/holding-import">Import holding observations</Link><Link to="/share-values">Indicative share values</Link><Link to="/share-trades">Recorded trades</Link><Link to="/trade-reconciliation">Reconcile trade and share events</Link><Link to="/trade-void">Correct a trade</Link><Link to="/trade-publications">Publish trade history</Link></div></AccordionContent></AccordionItem></Accordion></CardContent></Card>
            <Card aria-labelledby="nav-lending"><CardHeader><CardTitle id="nav-lending">Lending</CardTitle><CardDescription>Loans, requests and their accounting</CardDescription></CardHeader><CardContent><div className="workspace-primary"><Link to="/loans">Loans &amp; credit bookings <span aria-hidden="true">→</span></Link><Link to="/loan-posting">Loan accounting <span aria-hidden="true">→</span></Link><Link to="/repayment-posting">Repayment accounting <span aria-hidden="true">→</span></Link></div><Accordion type="single" collapsible><AccordionItem value="tools"><AccordionTrigger>Lending tools</AccordionTrigger><AccordionContent><div className="workspace-secondary"><Link to="/credit-review">Member credit review</Link><Link to="/loan-terms">Record loan term changes</Link><Link to="/lending-import">Import loans &amp; repayments</Link><Link to="/booking-import">Import credit bookings</Link><Link to="/booking-fulfilment-import">Import booking fulfilments</Link><Link to="/booking-history">Booking history</Link><Link to="/booking-status">Change booking status</Link><Link to="/loan-reconciliation">Loan reconciliation</Link><Link to="/lending-snapshot">Dated lending snapshot</Link><Link to="/fund-observations">Reported fund availability</Link><Link to="/reported-loan-balances">Loan balance observations</Link><Link to="/loan-balances">Publish reported loan balances</Link><Link to="/collateral">Collateral</Link><Link to="/lending-void">Correct lending records</Link><Link to="/fulfilment-void">Correct booking fulfilments</Link></div></AccordionContent></AccordionItem></Accordion></CardContent></Card>
            <Card aria-labelledby="nav-investments"><CardHeader><CardTitle id="nav-investments">Investments</CardTitle><CardDescription>Holdings, policy and portfolio review</CardDescription></CardHeader><CardContent><div className="workspace-primary"><Link to="/investments">Investment register <span aria-hidden="true">→</span></Link><Link to="/allocation">Portfolio allocation <span aria-hidden="true">→</span></Link><Link to="/policy">Investment policy <span aria-hidden="true">→</span></Link></div><Accordion type="single" collapsible><AccordionItem value="tools"><AccordionTrigger>Investment tools</AccordionTrigger><AccordionContent><div className="workspace-secondary"><Link to="/investment-import">Import investment records</Link><Link to="/investment-posting">Post investment transactions</Link><Link to="/investment-status">Investment status</Link><Link to="/investment-void">Correct investment records</Link><Link to="/budgets">Budget worksheet</Link><Link to="/obligations">External borrowing &amp; deposits</Link></div></AccordionContent></AccordionItem></Accordion></CardContent></Card>
            <Card aria-labelledby="nav-accounts"><CardHeader><CardTitle id="nav-accounts">Accounting &amp; reports</CardTitle><CardDescription>Books, journal activity and board inputs</CardDescription></CardHeader><CardContent><div className="workspace-primary"><Link to="/accounting">Accounting <span aria-hidden="true">→</span></Link><Link to="/reports">Reports <span aria-hidden="true">→</span></Link><Link to="/board-packets">Board-pack drafts <span aria-hidden="true">→</span></Link><Link to="/trial-balance">Trial balance <span aria-hidden="true">→</span></Link></div><Accordion type="single" collapsible><AccordionItem value="tools"><AccordionTrigger>Accounting tools</AccordionTrigger><AccordionContent><div className="workspace-secondary"><Link to="/cash-register">Other cash receipts &amp; payments</Link><Link to="/account-activity">Account activity</Link><Link to="/statement-worksheet">Statement working paper</Link><Link to="/book-publications">Publish group books</Link><Link to="/board-packet-access">Share board-pack drafts</Link></div></AccordionContent></AccordionItem></Accordion></CardContent></Card>
          </nav>
        </section>
      </>}
      <p className="footnote">This workspace is in development. Published values and balances are based on the recorded sources and dates shown.</p>
    </main></div>
}
