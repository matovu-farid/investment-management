export type DashboardCounts = { activeMembers:number; loans:number; waitingBookings:number; heldBookings:number; investments:number }
export interface DashboardRepository {roleFor(id:string):Promise<string|null>;counts():Promise<DashboardCounts>}
export async function getDashboard(repo:DashboardRepository,actor:string|null):Promise<{kind:'member'}|{kind:'admin';counts:DashboardCounts|null}>{
 if(!actor)throw new Error('Unauthorized')
 if(await repo.roleFor(actor)!=='admin')return {kind:'member'}
 try{return {kind:'admin',counts:await repo.counts()}}catch{return {kind:'admin',counts:null}}
}
