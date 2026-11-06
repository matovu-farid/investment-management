import { useEffect, useRef, useState } from 'react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '#/components/ui/alert-dialog'

type Request = { message: string; notice: boolean; resolve: (confirmed: boolean) => void }
let present: ((request: Request) => void) | null = null

function ask(message: string, notice: boolean): Promise<boolean> {
  return new Promise(resolve => {
    if (!present) { resolve(false); return }
    present({ message, notice, resolve })
  })
}
export const confirmAction = (message: string) => ask(message, false)
export const showNotice = (message: string) => ask(message, true)

export function ConfirmationHost() {
  const [current, setCurrent] = useState<Request | null>(null)
  const active = useRef<Request | null>(null)
  useEffect(() => {
    const show = (request: Request) => {
      if (active.current) { request.resolve(false); return }
      active.current = request; setCurrent(request)
    }
    present = show
    return () => { if (present === show) present = null; active.current?.resolve(false); active.current = null }
  }, [])
  function finish(confirmed: boolean) {
    const request = active.current
    active.current = null; setCurrent(null); request?.resolve(confirmed)
  }
  return <AlertDialog open={current !== null} onOpenChange={open => { if (!open) finish(false) }}>
    <AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>{current?.notice ? 'Notice' : 'Confirm action'}</AlertDialogTitle><AlertDialogDescription>{current?.message}</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter>{!current?.notice && <AlertDialogCancel onClick={() => finish(false)}>Cancel</AlertDialogCancel>}<AlertDialogAction onClick={() => finish(true)}>{current?.notice ? 'OK' : 'Confirm'}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
}
