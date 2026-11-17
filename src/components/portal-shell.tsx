import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { getNavigationAccessFn } from '#/server/portal/navigation-functions'
import { adminNavigation, memberNavigation, searchTools } from '#/lib/portal-navigation'
import { Popover, PopoverContent, PopoverTrigger } from '#/components/ui/popover'
import { Input } from '#/components/ui/input'
import './portal-shell.css'
import './portal-search.css'

const publicPaths = new Set(['/login', '/forgot-password', '/reset-password', '/accept-invitation'])
type Access = { role: 'admin' | 'member'; hasMemberLink: boolean }
export function PortalShell({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: state => state.location.pathname })
  const [access, setAccess] = useState<Access | null>(null)
  const [open, setOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const menuButton = useRef<HTMLButtonElement>(null)
  const isPublic = publicPaths.has(pathname) || pathname.startsWith('/api/')
  useEffect(() => {
    if (isPublic) { setAccess(null); return }
    let cancelled = false
    void getNavigationAccessFn().then(result => { if (!cancelled) setAccess(result) }).catch(() => { if (!cancelled) setAccess(null) })
    return () => { cancelled = true }
  }, [isPublic, pathname])
  useEffect(() => { setOpen(false); setSearchOpen(false) }, [pathname])
  useEffect(() => {
    if (!open) return
    function keydown(event: KeyboardEvent) { if (event.key === 'Escape') { setOpen(false); menuButton.current?.focus() } }
    document.addEventListener('keydown', keydown)
    return () => document.removeEventListener('keydown', keydown)
  }, [open])
  const matches = useMemo(() => access ? searchTools(access.role, query) : [], [access, query])
  if (isPublic || !access) return <>{children}</>
  const navigation = access.role === 'admin' ? adminNavigation : memberNavigation
  return <div className="portal-layout">
    <button ref={menuButton} type="button" className="portal-menu-button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="portal-sidebar">{open ? 'Close menu' : 'Menu'}</button>
    {open && <button className="portal-menu-backdrop" type="button" aria-label="Close navigation" onClick={() => { setOpen(false); menuButton.current?.focus() }} />}
    <aside id="portal-sidebar" className={`portal-sidebar${open ? ' portal-sidebar-open' : ''}`} aria-label="Workspace navigation">
      <Link className="portal-logo" to="/" aria-label="RNIG Investment Group home"><span className="portal-logo-mark">R</span><span className="portal-logo-word">RNIG<small>INVESTMENT GROUP</small></span></Link>
      <nav>{navigation.map(group => <div className="portal-nav-group" key={group.title}><p>{group.title}</p>{group.links.map(([label, href]) => <Link key={label} to={href.split('#')[0] as '/'} hash={href.split('#')[1]} aria-current={href === pathname ? 'page' : undefined} onClick={() => setOpen(false)}>{label}</Link>)}</div>)}
        {access.role === 'admin' && access.hasMemberLink && <div className="portal-nav-group"><p>MY ACCOUNT</p><Link to="/my-portfolio" onClick={() => setOpen(false)}>My records</Link></div>}
        <Popover open={searchOpen} onOpenChange={setSearchOpen}>
          <PopoverTrigger asChild><button className="portal-search-trigger" type="button">Search all tools <span aria-hidden="true">⌕</span></button></PopoverTrigger>
          <PopoverContent align="start" side="right" className="portal-search-panel" aria-label="Find a tool">
            <h2>Find a tool</h2><p>Search by task or browse the areas below.</p>
            <label htmlFor="portal-tool-search">Search tools</label>
            <Input id="portal-tool-search" type="search" placeholder="Search tools and records" value={query} onChange={event => setQuery(event.target.value)} autoComplete="off" />
            <p role="status" className="portal-search-count">{matches.length} {matches.length === 1 ? 'tool' : 'tools'}{query.trim() ? ' found' : ' available'}</p>
            <div className="portal-search-results">{matches.length ? matches.map(tool => <Link key={`${tool.area}-${tool.href}-${tool.label}`} to={tool.href.split('#')[0] as '/'} hash={tool.href.split('#')[1]} onClick={() => { setSearchOpen(false); setOpen(false) }}><span>{tool.label}</span><small>{tool.area}</small></Link>) : <p>No matching tools. Try a different search.</p>}</div>
          </PopoverContent>
        </Popover>
      </nav>
    </aside>
    <div className="portal-content">{children}</div>
  </div>
}
