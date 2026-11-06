import { pendingOwnerPrefix } from './store.ts'

type StorageLike = Pick<Storage, 'length' | 'key' | 'getItem' | 'removeItem'>
type SignOutResult = { signedOut: boolean; cleanupFailed: boolean }
function keysForUser(storage: StorageLike, userId: string): string[] {
  const prefix = pendingOwnerPrefix(userId)
  const keys: string[] = []
  for (let i = 0; i < storage.length; i++) { const key = storage.key(i); if (key?.startsWith(prefix)) keys.push(key) }
  return keys
}
/** Do not let inaccessible local storage prevent an explicitly confirmed server sign-out. */
export async function signOutWithPendingProtection(
  getStorage: () => StorageLike,
  userId: string,
  confirmLoss: (reason: 'pending' | 'unavailable') => boolean | Promise<boolean>,
  signOut: () => Promise<{ error: unknown }>,
): Promise<SignOutResult> {
  let pending: string[] | null = null
  try { pending = keysForUser(getStorage(), userId) } catch { /* Cannot determine whether requests remain. */ }
  if ((pending === null || pending.length > 0) && !(await confirmLoss(pending === null ? 'unavailable' : 'pending'))) {
    return { signedOut: false, cleanupFailed: false }
  }
  const result = await signOut()
  if (result.error) throw new Error('Could not sign out')
  try {
    const storage = getStorage()
    for (const key of keysForUser(storage, userId)) storage.removeItem(key)
    if (keysForUser(storage, userId).length) throw new Error('Pending requests remain')
    return { signedOut: true, cleanupFailed: false }
  } catch {
    return { signedOut: true, cleanupFailed: true }
  }
}
