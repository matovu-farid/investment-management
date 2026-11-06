import { useEffect, useRef, useState } from 'react'
import { createPendingStore, type PendingPayload } from './store'
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'

type Store<T extends PendingPayload> = ReturnType<typeof createPendingStore<T>>
/** A request is saved before transmission and retained until the server confirms it. */
export function usePendingRequest<T extends PendingPayload>(owner: string, operation: string) {
  const store = useRef<Store<T> | null>(null)
  const [ready, setReady] = useState(false)
  const [pending, setPending] = useState<T | null>(null)
  const [storageError, setStorageError] = useState('')
  useEffect(() => {
    setReady(false); setPending(null); setStorageError('')
    try {
      const next = createPendingStore<T>(window.sessionStorage, owner, operation)
      store.current = next
      setPending(next.read())
    } catch { setStorageError('Pending request storage is unavailable or unreadable. Check the register before discarding any pending request.') }
    setReady(true)
    return () => { store.current = null }
  }, [owner, operation])
  async function send(payload: T, transmit: (value: T) => Promise<unknown>, isNew: boolean) {
    if (!ready || !store.current || storageError) throw new Error('Pending request storage is unavailable')
    let snapshot: T | null
    try { snapshot = isNew ? store.current.begin(payload) : store.current.read() }
    catch (error) { setStorageError('Could not safely retain the request in this tab. Check the register before discarding a pending request.'); throw error }
    if (!snapshot || (!isNew && snapshot.idempotencyKey !== payload.idempotencyKey)) throw new Error('Pending request changed')
    setPending(snapshot)
    await transmit(snapshot)
    store.current.confirm(snapshot.idempotencyKey)
    setPending(null)
  }
  function discard() {
    if (!store.current) throw new Error('Pending request storage is unavailable')
    store.current.discard(); setPending(null); setStorageError('')
  }
  return { ready, pending, storageError, send, discard }
}

export function PendingRequestNotice<T extends PendingPayload>({ title, pending, storageError, disabled, onRetry, onDiscard }: {
  title: string; pending: T | null; storageError: string; disabled: boolean; onRetry: () => void; onDiscard: () => void
}) {
  if (!pending && !storageError) return null
  return <Alert className="lending-full lending-notice" role="status">
    <AlertTitle>{title}: {pending ? 'confirmation pending' : 'storage unavailable'}</AlertTitle>
    <AlertDescription className="min-w-0">
      <p>{storageError || 'This exact request may already have been saved. Check the register, then retry it unchanged to confirm. It is retained in this browser tab across reloads.'}</p>
      {pending && <dl className="grid w-full min-w-0 gap-2">{Object.entries(pending).map(([key, value]) => <div key={key} className="min-w-0"><dt className="font-medium">{key}</dt><dd className="m-0 break-words">{value !== null && typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—')}</dd></div>)}</dl>}
      <div className="flex flex-wrap gap-2">{pending && <Button type="button" disabled={disabled} onClick={onRetry}>Retry this exact request</Button>}<Button type="button" variant="outline" disabled={disabled} onClick={onDiscard}>Discard pending request</Button></div>
    </AlertDescription>
  </Alert>
}
