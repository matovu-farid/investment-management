import type { Report } from '../../server/reports/service'

type SectionKey = Exclude<keyof Report, 'start' | 'end'>
type Section = { key: SectionKey; title: string; columns: [string, string][] }
// Shared by the browser report and export so the same columns are always included.
export const reportSections: Section[] = [
  { key: 'members', title: 'Current members', columns: [['number','Member number'],['name','Name']] },
  { key: 'cashEntries', title: 'Other cash receipts and payments', columns: [['id','Record ID'],['date','Date'],['direction','Direction'],['amountMinor','Amount (minor units)'],['currency','Currency'],['counterparty','Counterparty'],['reference','Reference'],['description','Description'],['createdBy','Recorded by'],['createdAt','Recorded at (UTC)'],['voidedAt','Voided at (UTC)'],['voidReason','Void reason'],['voidedBy','Voided by']] },
  { key: 'loans', title: 'Loans disbursed', columns: [['member','Member'],['date','Disbursement date'],['principalMinor','Original principal (minor units)'],['currency','Currency'],['voidedAt','Voided at (UTC)'],['voidReason','Void reason']] },
  { key: 'repayments', title: 'Loan repayments recorded', columns: [['member','Member'],['loanId','Loan ID'],['disbursementDate','Loan disbursement date'],['date','Payment date'],['amountMinor','Amount received (minor units)'],['currency','Currency'],['reference','Reference'],['notes','Notes'],['voidedAt','Voided at (UTC)'],['voidReason','Void reason']] },
  { key: 'bookingSnapshotTotals', title: 'Credit booking snapshot by currency', columns: [['currency','Currency'],['requestedMinor','Requested (minor units)'],['fulfilledMinor','Fulfilled through end (minor units)'],['remainingMinor','Requested less recorded fulfilments (minor units)']] },
  { key: 'bookingSnapshot', title: 'Credit booking snapshot by booking', columns: [['bookingId','Booking ID'],['member','Member'],['requestedDate','Requested date'],['storedStatus','Current stored status'],['currency','Currency'],['requestedMinor','Requested (minor units)'],['fulfilledMinor','Fulfilled through end (minor units)'],['remainingMinor','Requested less recorded fulfilments (minor units)']] },
  { key: 'bookings', title: 'Credit bookings requested during period', columns: [['member','Member'],['date','Requested date'],['requestedMinor','Requested (minor units)'],['currency','Currency']] },
  { key: 'bookingStatusEvents', title: 'Credit booking hold and resume events', columns: [['member','Member'],['bookingId','Booking ID'],['requestedDate','Requested date'],['date','Event date'],['type','Event'],['reason','Reason'],['createdBy','Recorded by']] },
  { key: 'fulfilments', title: 'Credit booking fulfilments recorded', columns: [['member','Member'],['bookingId','Booking ID'],['requestedDate','Requested date'],['date','Fulfilment date'],['amountMinor','Fulfilled amount (minor units)'],['currency','Currency'],['notes','Notes'],['voidedAt','Voided at (UTC)'],['voidReason','Void reason']] },
  { key: 'investments', title: 'Current investments', columns: [['name','Name'],['assetClass','Asset class'],['currency','Currency']] },
  { key: 'transactions', title: 'Investment transactions recorded', columns: [['investment','Investment'],['date','Transaction date'],['type','Type'],['amountMinor','Recorded amount (minor units)'],['currency','Currency'],['reference','Reference'],['notes','Notes'],['voidedAt','Voided at (UTC)'],['voidReason','Void reason']] },
  { key: 'valuations', title: 'Valuation history through period end', columns: [['investment','Investment'],['date','Valuation date'],['amountMinor','Value (minor units)'],['currency','Currency'],['basis','Basis'],['source','Source'],['voidedAt','Voided at (UTC)'],['voidReason','Void reason']] },
  { key: 'shareTrades', title: 'Recorded share trades', columns: [['saleId','Sale request ID'],['date','Trade date'],['seller','Seller'],['buyer','Buyer'],['buyerType','Buyer type'],['shares','Shares'],['priceMinor','Price per share (minor units)'],['considerationMinor','Recorded consideration (minor units)'],['currency','Currency'],['reference','Reference'],['voidedAt','Voided at (UTC)'],['voidReason','Void reason']] },
  { key: 'shareEvents', title: 'Share events', columns: [['holder','Holder'],['date','Event date'],['type','Event type'],['shares','Shares'],['voidedAt','Voided at (UTC)'],['voidReason','Void reason']] },
]

export function reportCaveats(report: Report) {
  return [
    'Other cash receipts and payments are recorded separately and may overlap with loan, investment or ledger records. They are not a complete cash-flow statement. Void status reflects the current register at report capture.',
    `Activity dated from ${report.start} through ${report.end}, inclusive. Member and investment registers show current records because effective dates are not recorded. Valuation history includes all recorded valuations through ${report.end}, including those before the period start; it does not choose a current value. Amounts are in the currency's minor units. Loan principal and booking amounts are original recorded amounts, not outstanding balances. Loan, repayment, fulfilment, investment transaction, valuation, share-event and share-trade void details reflect current recorded status at report generation, even for prior periods; voided records are retained for audit. Repayments, booking events, fulfilments, investment transactions and share trades are recorded facts; trade records do not establish settlement or transfer ownership, and no allocation or accounting treatment is inferred.`,
    `Booking snapshot through ${report.end}: requested amounts include every recorded booking requested on or before that date, including closed and cancelled bookings. Fulfilled amounts include fulfilments dated through that date excluding those currently voided; requested less recorded fulfilments is not necessarily actionable demand or the outstanding amount: historical fulfilments may be incomplete. Stored status is current, not historical; hold and resume events are recorded separately and do not change it.`,
  ]
}

/** Always quote cells. Prefix formula-like values and long integers for safer spreadsheet imports. */
export function csvCell(value: string | number | null | undefined): string {
  let text = value == null ? '' : String(value)
  if (/^[\s\u0000-\u001f\u007f]*[=+\-@]/u.test(text) || /^[\t\r\n]/u.test(text) || /^\d{16,}$/u.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}

export function reportCsv(report: Report): string {
  const rows: (string | number | null | undefined)[][] = [
    ['RNIG recorded activity report'], ['Start date', report.start], ['End date', report.end],
    ...reportCaveats(report).map(c => [c]),
    ['Spreadsheet import: use text columns to preserve dates, leading zeroes and long numbers. Protective apostrophes may appear.'],
  ]
  for (const section of reportSections) {
    rows.push([], [section.title], section.columns.map(([,label]) => label))
    if (report[section.key] == null) { rows.push(['Not captured in this saved report']); continue }
    for (const fact of report[section.key] ?? []) rows.push(section.columns.map(([key]) => fact[key]))
  }
  return '\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
