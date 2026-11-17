import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { PortalShell } from '#/components/portal-shell'
import { ConfirmationHost } from '#/components/confirmation-host'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({ meta: [{ charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' }, { title: 'RNIG | Investment Group' }], links: [{ rel: 'stylesheet', href: appCss }] }),
  shellComponent: ({ children }: { children: React.ReactNode }) => <html lang="en"><head><HeadContent /></head><body><PortalShell>{children}</PortalShell><ConfirmationHost /><Scripts /></body></html>,
})
