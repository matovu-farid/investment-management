import type {CollateralRepository,Loan,Pledge,RecoveryEvent} from './service'
const pledgeCols="p.id,p.loan_id AS loanId,p.holder,p.shares,p.pledged_date AS pledgedDate,p.reference,p.evidence,p.created_by AS createdBy,p.created_at AS createdAt,(SELECT created_at FROM collateral_source_voids v WHERE v.source_kind='pledge' AND v.source_id=p.id) AS voidedAt,(SELECT reason FROM collateral_source_voids v WHERE v.source_kind='pledge' AND v.source_id=p.id) AS voidReason"
const eventCols="e.id,e.loan_id AS loanId,e.event_date AS eventDate,e.description,e.created_by AS createdBy,e.created_at AS createdAt,(SELECT created_at FROM collateral_source_voids v WHERE v.source_kind='recovery' AND v.source_id=e.id) AS voidedAt,(SELECT reason FROM collateral_source_voids v WHERE v.source_kind='recovery' AND v.source_id=e.id) AS voidReason"
const parentCols=(alias:string)=>`(SELECT m.full_name FROM loans l JOIN members m ON m.id=l.member_id WHERE l.id=${alias}.loan_id) AS parentMemberName,(SELECT m.member_number FROM loans l JOIN members m ON m.id=l.member_id WHERE l.id=${alias}.loan_id) AS parentMemberNumber,(SELECT l.currency FROM loans l WHERE l.id=${alias}.loan_id) AS parentCurrency,(SELECT l.principal_minor FROM loans l WHERE l.id=${alias}.loan_id) AS parentPrincipalMinor,(SELECT l.disbursement_date FROM loans l WHERE l.id=${alias}.loan_id) AS parentDisbursementDate,(SELECT v.created_at FROM loan_source_voids v WHERE v.source_kind='loan' AND v.source_id=${alias}.loan_id) AS loanVoidedAt,(SELECT v.reason FROM loan_source_voids v WHERE v.source_kind='loan' AND v.source_id=${alias}.loan_id) AS loanVoidReason`
const admin="EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')"
export function createCollateralRepository(db:D1Database):CollateralRepository{return {
 async roleFor(id){return (await db.prepare('SELECT role FROM app_user_roles WHERE user_id=?').bind(id).first<{role:string}>())?.role??null},
 async list(actor){
  const [loans,pledges,events,authority]=await db.batch([
   db.prepare(`SELECT l.id,m.full_name AS memberName,l.principal_minor AS principalMinor,l.currency,l.disbursement_date AS disbursementDate FROM loans l JOIN members m ON m.id=l.member_id WHERE NOT EXISTS (SELECT 1 FROM loan_source_voids v WHERE v.source_kind='loan' AND v.source_id=l.id) AND ${admin} ORDER BY l.disbursement_date DESC,l.id`).bind(actor),
   db.prepare(`SELECT ${pledgeCols},${parentCols('p')} FROM loan_pledges p WHERE ${admin} ORDER BY p.pledged_date DESC,p.id`).bind(actor),
   db.prepare(`SELECT ${eventCols},${parentCols('e')} FROM loan_recovery_events e WHERE ${admin} ORDER BY e.event_date DESC,e.id`).bind(actor),
   db.prepare(`SELECT 1 AS ok WHERE ${admin}`).bind(actor),
  ])
  if(!authority.results.length)throw new Error('Unauthorized')
  return {loans:loans.results as Loan[],pledges:pledges.results as Pledge[],events:events.results as RecoveryEvent[]}
 },
 async createPledge(v,k){
  await db.prepare(`INSERT INTO loan_pledges(id,loan_id,holder,shares,pledged_date,reference,evidence,created_by,request_key) SELECT ?,?,?,?,?,?,?,?,? WHERE ${admin} AND EXISTS(SELECT 1 FROM loans l WHERE l.id=? AND NOT EXISTS(SELECT 1 FROM loan_source_voids x WHERE x.source_kind='loan' AND x.source_id=l.id)) AND NOT EXISTS(SELECT 1 FROM loan_pledges WHERE request_key=?)`).bind(v.id,v.loanId,v.holder,v.shares,v.pledgedDate,v.reference,v.evidence,v.createdBy,k,v.createdBy,v.loanId,k).run()
  const saved=await db.prepare(`SELECT ${pledgeCols} FROM loan_pledges p WHERE p.request_key=? AND ${admin}`).bind(k,v.createdBy).first<Pledge>()
  if(!saved||(['loanId','holder','shares','pledgedDate','reference','evidence','createdBy'] as const).some(f=>saved[f]!==v[f]))throw new Error('Request unavailable or key already used for different details')
  if(saved.voidedAt)throw new Error('Record was voided; review the register')
  return saved
 },
 async createEvent(v,k){
  await db.prepare(`INSERT INTO loan_recovery_events(id,loan_id,event_date,description,created_by,request_key) SELECT ?,?,?,?,?,? WHERE ${admin} AND EXISTS(SELECT 1 FROM loans l WHERE l.id=? AND NOT EXISTS(SELECT 1 FROM loan_source_voids x WHERE x.source_kind='loan' AND x.source_id=l.id)) AND NOT EXISTS(SELECT 1 FROM loan_recovery_events WHERE request_key=?)`).bind(v.id,v.loanId,v.eventDate,v.description,v.createdBy,k,v.createdBy,v.loanId,k).run()
  const saved=await db.prepare(`SELECT ${eventCols} FROM loan_recovery_events e WHERE e.request_key=? AND ${admin}`).bind(k,v.createdBy).first<RecoveryEvent>()
  if(!saved||(['loanId','eventDate','description','createdBy'] as const).some(f=>saved[f]!==v[f]))throw new Error('Request unavailable or key already used for different details')
  if(saved.voidedAt)throw new Error('Record was voided; review the register')
  return saved
 },
}}
