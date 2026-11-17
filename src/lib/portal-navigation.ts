export type Tool = { label: string; href: string; area: string; keywords?: string }
export type NavigationGroup = { title: string; links: readonly (readonly [string, string])[] }

export const adminNavigation: NavigationGroup[] = [
  { title: 'WORKSPACE', links: [['Overview', '/'], ['Members & shares', '/members'], ['Lending', '/loans'], ['Investments', '/investments'], ['Accounting', '/accounting'], ['Reports & board', '/reports']] },
  { title: 'ADMINISTRATION', links: [['People & access', '/invitations']] },
]
export const memberNavigation: NavigationGroup[] = [
  { title: 'MY ACCOUNT', links: [['Overview', '/'], ['My shares', '/my-holdings'], ['My loans', '/my-portfolio#loans'], ['Credit requests', '/my-portfolio#credit-bookings']] },
  { title: 'THE GROUP', links: [['Group investments', '/group-investments'], ['Share notices', '/market'], ['Reports & documents', '/my-board-packets'], ['Group books', '/group-books']] },
]
const group = (area: string, rows: readonly (readonly [string, string, string?])[]): Tool[] => rows.map(([label, href, keywords]) => ({ area, label, href, keywords }))
export const memberTools: Tool[] = [
  ...group('My account', [['My records', '/my-portfolio'], ['My shareholdings', '/my-holdings'], ['Published share values', '/my-share-values'], ['Published loan balances', '/my-loan-balances'], ['Loans and repayments', '/my-portfolio#loans'], ['Credit requests', '/my-portfolio#credit-bookings']]),
  ...group('The group', [['Group investments', '/group-investments'], ['Share notices', '/market'], ['Share trade history', '/group-trades'], ['Group books', '/group-books'], ['Shared board packs', '/my-board-packets']]),
]
export const adminTools: Tool[] = [
  ...group('Members & shares', [['Member register','/members'],['Import members','/member-import'],['Correct member records','/member-changes'],['Share events','/shares'],['Holding observations','/holding-observations'],['Import holdings','/holding-import'],['Share values','/share-values'],['Correct share events','/share-event-void'],['Share sales','/share-sales'],['Share trades','/share-trades'],['Reconcile trades','/trade-reconciliation'],['Correct trades','/trade-void'],['Publish trade history','/trade-publications']]),
  ...group('Lending', [['Loans and credit bookings','/loans'],['Member credit review','/credit-review'],['Loan terms','/loan-terms'],['Collateral','/collateral'],['Booking history','/booking-history'],['Booking status','/booking-status'],['Lending snapshot','/lending-snapshot'],['Repayment acknowledgments','/lending-acknowledgment'],['Loan billing and installments','/loan-billing'],['Loan estimate','/loan-estimate'],['Loan openings','/loan-openings'],['Publish loan balances','/loan-balances'],['Reported loan balances','/reported-loan-balances'],['Import loan balances','/reported-loan-balance-import'],['Unapplied receipts','/unapplied-receipts'],['Loan reconciliation','/loan-reconciliation'],['Fund observations','/fund-observations'],['Import loans and repayments','/lending-import'],['Import credit bookings','/booking-import'],['Import booking fulfilments','/booking-fulfilment-import'],['Correct lending records','/lending-void'],['Correct fulfilments','/fulfilment-void']]),
  ...group('Investments', [['Investment register','/investments'],['Allocation review','/allocation'],['Investment policy','/policy'],['Supporting documents','/documents'],['Obligations','/obligations'],['Budgets','/budgets'],['Import investments','/investment-import'],['Post investment transactions','/investment-posting'],['Investment status','/investment-status'],['Correct investment records','/investment-void']]),
  ...group('Accounting', [['Accounting ledger','/accounting'],['Trial balance','/trial-balance'],['Account activity','/account-activity'],['Cash register','/cash-register'],['Post cash activity','/cash-posting'],['Loan accounting','/loan-posting'],['Repayment accounting','/repayment-posting'],['Journal corrections','/journal-corrections'],['Statement worksheet','/statement-worksheet'],['Publish group books','/book-publications']]),
  ...group('Reports & board', [['Reports','/reports'],['Board pack drafts','/board-packets'],['Share board packs','/board-packet-access']]),
  ...group('People & access', [['Invitations','/invitations'],['Member account links','/my-portfolio']]),
]
export function searchTools(role: 'admin' | 'member', query: string): Tool[] {
  const search = query.trim().toLocaleLowerCase()
  return (role === 'admin' ? adminTools : memberTools).filter(tool => !search || `${tool.label} ${tool.area} ${tool.keywords ?? ''}`.toLocaleLowerCase().includes(search))
}
