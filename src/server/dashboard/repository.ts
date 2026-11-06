import type {DashboardCounts,DashboardRepository} from './service'
export function createDashboardRepository(db:D1Database):DashboardRepository {return {
 async roleFor(id){return (await db.prepare('SELECT role FROM app_user_roles WHERE user_id=?').bind(id).first<{role:string}>())?.role??null},
 async counts(){const result=await db.prepare(`SELECT
  (SELECT COUNT(*) FROM members WHERE status='active') AS activeMembers,
  (SELECT COUNT(*) FROM loans l WHERE NOT EXISTS (SELECT 1 FROM loan_source_voids v WHERE v.source_kind='loan' AND v.source_id=l.id)) AS loans,
  (SELECT COUNT(*) FROM credit_bookings WHERE status='waiting') AS waitingBookings,
  (SELECT COUNT(*) FROM credit_bookings WHERE status='held') AS heldBookings,
  (SELECT COUNT(*) FROM investments) AS investments`).first<DashboardCounts>();if(!result)throw new Error('Counts unavailable');return {...result}},
}}
