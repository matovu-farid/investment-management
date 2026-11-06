/** Selected sale facts as recorded through the packet end date; names are current at capture. */
export type SaleRequest={id:string;memberId:string;memberName:string;memberNumber:string;shares:number;askingPriceMinor:number;currency:string;requestDate:string;deadlineDate:string|null;notes:string|null}
export type SaleInterest={id:string;saleId:string;memberId:string;memberName:string;memberNumber:string;interestDate:string;shares:number;notes:string|null;provenance?:'member'|'admin'}
export type SaleStatus={id:string;saleId:string;statusDate:string;status:string;newDeadlineDate:string|null;notes:string|null}
export type SaleData={requests:SaleRequest[];interests:SaleInterest[];statuses:SaleStatus[]}
const admin="EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')"
const cols='s.id,s.member_id AS memberId,m.full_name AS memberName,m.member_number AS memberNumber,s.shares,s.asking_price_minor AS askingPriceMinor,s.currency,s.request_date AS requestDate,s.deadline_date AS deadlineDate,s.notes'
export async function saleRequestOptions(db:D1Database,actor:string):Promise<SaleRequest[]>{return (await db.prepare(`SELECT ${cols} FROM share_sale_requests s JOIN members m ON m.id=s.member_id WHERE ${admin} ORDER BY s.request_date DESC,s.id`).bind(actor).all<SaleRequest>()).results}
export async function captureSales(db:D1Database,actor:string,ids:string[],end:string):Promise<SaleData>{
 const keys=JSON.stringify(ids)
 // D1 batch gives one consistent capture of the selected sources and their event history.
 const [requests,interests,statuses,authority]=await db.batch([
  db.prepare(`SELECT ${cols} FROM share_sale_requests s JOIN members m ON m.id=s.member_id WHERE s.id IN (SELECT value FROM json_each(?)) AND s.request_date<=? AND ${admin} ORDER BY s.request_date,s.id`).bind(keys,end,actor),
  db.prepare(`SELECT i.id,i.sale_id AS saleId,i.member_id AS memberId,m.full_name AS memberName,m.member_number AS memberNumber,i.interest_date AS interestDate,i.shares,i.notes,CASE WHEN EXISTS(SELECT 1 FROM member_sale_interest_requests p WHERE p.id=i.id) THEN 'member' ELSE 'admin' END AS provenance FROM share_sale_interests i JOIN members m ON m.id=i.member_id WHERE i.sale_id IN (SELECT value FROM json_each(?)) AND i.interest_date<=? AND ${admin} ORDER BY i.interest_date,i.id`).bind(keys,end,actor),
  db.prepare(`SELECT e.id,e.sale_id AS saleId,e.status_date AS statusDate,e.status,e.new_deadline_date AS newDeadlineDate,e.notes FROM share_sale_status_events e WHERE e.sale_id IN (SELECT value FROM json_each(?)) AND e.status_date<=? AND ${admin} ORDER BY e.status_date,e.id`).bind(keys,end,actor),
  db.prepare(`SELECT 1 AS ok WHERE ${admin}`).bind(actor),
 ])
 if(!authority.results.length)throw new Error('Unauthorized')
 if(requests.results.length!==ids.length)throw new Error('Sale request unavailable or after packet end')
 return {requests:requests.results as SaleRequest[],interests:interests.results as SaleInterest[],statuses:statuses.results as SaleStatus[]}
}
