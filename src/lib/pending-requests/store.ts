/** Tab-scoped pending requests. The server still validates every payload and key. */
export type PendingPayload = { idempotencyKey: string }
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export function pendingOwnerPrefix(owner: string) { return `rnig.pending.v1.${encodeURIComponent(owner).replaceAll('.', '%2E')}.` }
export function createPendingStore<T extends PendingPayload = PendingPayload>(storage: StorageLike, owner: string, operation: string) {
  if (!owner || !operation) throw new Error('Pending request requires an owner and operation')
  const key = `${pendingOwnerPrefix(owner)}${encodeURIComponent(operation)}`
  function read(): T | null {
    const raw = storage.getItem(key)
    if (raw === null) return null
    let value: unknown
    try { value = JSON.parse(raw) } catch { throw new Error('Pending request is unreadable; check the register before discarding it') }
    if (!value || typeof value !== 'object' || Array.isArray(value) || typeof (value as PendingPayload).idempotencyKey !== 'string') throw new Error('Pending request is unreadable; check the register before discarding it')
    return value as T
  }
  function begin(payload: T): T {
    if (storage.getItem(key) !== null) throw new Error('A request is already pending; retry or discard it first')
    const raw = JSON.stringify(payload)
    storage.setItem(key, raw)
    if (storage.getItem(key) !== raw) throw new Error('Could not safely retain the pending request')
    return JSON.parse(raw) as T
  }
  function confirm(idempotencyKey: string) {
    const current = read()
    if (!current || current.idempotencyKey !== idempotencyKey) throw new Error('Pending request changed before confirmation')
    storage.removeItem(key)
    if (storage.getItem(key) !== null) throw new Error('Could not clear the confirmed request')
  }
  function discard() { storage.removeItem(key); if (storage.getItem(key) !== null) throw new Error('Could not discard pending request') }
  return { read, begin, confirm, discard }
}
