import { SpinnerLabel } from '#/components/ui/spinner'
import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { getSession } from '#/lib/auth.functions'
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { createMemberFn, memberPageFn } from '#/server/members/functions'

export const Route = createFileRoute('/members')({
  beforeLoad: async () => {
    if (!await getSession()) throw redirect({ to: '/login' })
  },
  loader: async () => {
    const data = await memberPageFn()
    if (!data.authenticated) throw redirect({ to: '/login' })
    return data
  },
  component: MemberRegister,
})

function MemberRegister() {
  const { members, available } = Route.useLoaderData()
  const router = useRouter()
  const [number, setNumber] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setMessage(''); setBusy(true)
    try {
      await createMemberFn({ data: { memberNumber: number, fullName: name, email } })
      setNumber(''); setName(''); setEmail(''); setMessage('Member added to the register.')
      await router.invalidate()
    } catch { setError('Could not add this member. Check the details and ensure the member number is unique, then try again.') }
    finally { setBusy(false) }
  }
  return <div className="app"><header><Link to="/" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}><span className="brand-mark">R</span><span>RNIG <small>INVESTMENT GROUP</small></span></Link><Link to="/" className="quiet" style={{ textDecoration: 'none' }}>Back to overview</Link></header><main className="dashboard">
    <p className="eyebrow">ADMINISTRATION</p><h1>Member register</h1><p className="lead">Maintain the group's member records.</p>
    {!available ? <Alert className="mt-8"><AlertTitle>Member register unavailable</AlertTitle><AlertDescription>You may not have permission to view this register, or it may be temporarily unavailable. Contact your administrator if you need access.</AlertDescription></Alert> : <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(18rem,0.85fr)_minmax(0,1.15fr)] xl:items-start">
      <Card><CardHeader><CardTitle><h2 className="m-0 text-lg">Add a member</h2></CardTitle><CardDescription>Add an existing member to the register. This does not create a login account.</CardDescription></CardHeader><CardContent>
        <form onSubmit={submit} className="max-w-xl"><FieldGroup>
          <Field><FieldLabel htmlFor="member-number">Member number</FieldLabel><Input id="member-number" value={number} onChange={e => setNumber(e.target.value)} required maxLength={64} /></Field>
          <Field><FieldLabel htmlFor="member-name">Full name</FieldLabel><Input id="member-name" value={name} onChange={e => setName(e.target.value)} required maxLength={200} autoComplete="name" /></Field>
          <Field><FieldLabel htmlFor="member-email">Email address (optional)</FieldLabel><Input id="member-email" type="email" value={email} onChange={e => setEmail(e.target.value)} maxLength={254} autoComplete="email" /></Field>
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          {message && <p role="status">{message}</p>}
          <Field orientation="horizontal"><Button type="submit" disabled={busy}>{busy ? <SpinnerLabel>Add member</SpinnerLabel> : 'Add member'}</Button></Field>
        </FieldGroup></form>
      </CardContent></Card>
      <Card><CardHeader><CardTitle><h2 className="m-0 text-lg">Members <Badge variant="secondary">{members.length}</Badge></h2></CardTitle><CardDescription>People currently recorded in the register.</CardDescription></CardHeader><CardContent>
        {members.length === 0 ? <p className="text-sm text-muted-foreground">No members have been added yet.</p> : <Table><TableHeader><TableRow><TableHead scope="col">Member number</TableHead><TableHead scope="col">Name</TableHead><TableHead scope="col">Email</TableHead><TableHead scope="col">Status</TableHead></TableRow></TableHeader><TableBody>{members.map(member => <TableRow key={member.id}><TableCell>{member.memberNumber}</TableCell><TableCell>{member.fullName}</TableCell><TableCell>{member.email || '—'}</TableCell><TableCell><Badge variant="outline">{member.status}</Badge></TableCell></TableRow>)}</TableBody></Table>}
      </CardContent></Card>
    </div>}
  </main></div>
}
