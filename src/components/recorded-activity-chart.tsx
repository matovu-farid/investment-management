import { Link } from '@tanstack/react-router'
import type { DashboardCounts } from '#/server/dashboard/service'

/** Counts are recorded items, not balances or an assessment of credit risk. */
export function RecordedActivityChart({ counts }: { counts: DashboardCounts }) {
  const rows = [
    { label: 'Active members', value: counts.activeMembers },
    { label: 'Loans recorded', value: counts.loans },
    { label: 'Waiting credit bookings', value: counts.waitingBookings },
    { label: 'Held credit bookings', value: counts.heldBookings },
    { label: 'Investments recorded', value: counts.investments },
  ]
  const maximum = Math.max(1, ...rows.map(row => row.value))
  return <figure className="activity-chart" aria-labelledby="recorded-activity-title">
    <figcaption><h2 id="recorded-activity-title">Recorded activity</h2><p>Counts of records, including future-dated entries. These are not balances.</p></figcaption>
    <ul aria-label="Recorded activity counts">{rows.map(row => <li key={row.label}>
      <span>{row.label}</span><span className="activity-chart-track" aria-hidden="true"><span style={{ width: `${row.value / maximum * 100}%` }} /></span><strong>{row.value.toLocaleString('en-US')}</strong>
    </li>)}</ul>
    <Link to="/reports">View activity report <span aria-hidden="true">→</span></Link>
  </figure>
}
