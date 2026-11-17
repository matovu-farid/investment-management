import { captureCreditRisk } from './capture.ts'
import { listLoanBilling } from '../loan-billing/service.ts'
import { historicalBalance } from '../billing-publications/historical.ts'
import { getInstallmentTracking } from '../installment-tracking/service.ts'

const unavailableBalanceReasons=new Set(['Loan billing setup not found','Legacy review incomplete','Opening cutoff rate must be reviewed','Finalize earlier recorded repayments first','Repayment journal unavailable or reversed','Posted allocation differs from current billing'])
const unavailableRiskReasons=new Set(['Review an installment plan first','Tracking date must be on or after the schedule coverage start'])

export async function reviewCreditRisk(db:D1Database,actor:string|null,input:unknown){
 if(!actor||!input||typeof input!=='object'||Array.isArray(input))throw new Error('Unauthorized or invalid request')
 const v=input as Record<string,unknown>,currency=v.currency,asOfDate=v.asOfDate
 if(typeof currency!=='string'||typeof asOfDate!=='string')throw new Error('Invalid currency or date')
 const today=await db.prepare("SELECT date('now','+3 hours') AS today WHERE EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')").bind(actor).first<{today:string}>()
 if(!today||asOfDate>today.today)throw new Error('Unauthorized or future review date')
 let initial:Awaited<ReturnType<typeof listLoanBilling>>|undefined
 const offset=v.offset===undefined?0:v.offset,expectedFingerprint=v.expectedFingerprint
 if(typeof offset!=='number'||(expectedFingerprint!==undefined&&typeof expectedFingerprint!=='string'))throw new Error('Invalid profile page')
 return captureCreditRisk(currency,asOfDate,{
  readState:async()=>{const state=await listLoanBilling(db,actor);initial??=state;return state},
  readBalance:async loanId=>{
   if(initial?.openings.some(o=>o.loanId===loanId&&o.openingDate>asOfDate))return null
   try{const {result}=await historicalBalance(db,actor,loanId,asOfDate,initial);return {principalMinor:result.principalMinor,interestMinor:result.interestDueMinor}}
   catch(error){if(error instanceof Error&&unavailableBalanceReasons.has(error.message))return null;throw error}
  },
  readRisk:async loanId=>{try{return (await getInstallmentTracking(db,actor,{loanId,asOfDate},initial)).risk}catch(error){if(error instanceof Error&&unavailableRiskReasons.has(error.message))return null;throw error}},
  readPlanTokens:async()=>{
   const [rows,authority]=await db.batch([
    db.prepare("SELECT l.id,(SELECT id FROM loan_installment_plans WHERE loan_id=l.id ORDER BY rowid DESC LIMIT 1) AS plan,(SELECT signature FROM installment_contract_state WHERE loan_id=l.id) AS contract FROM loans l WHERE EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin') ORDER BY l.id").bind(actor),
    db.prepare("SELECT 1 WHERE EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')").bind(actor),
   ])
   if(!authority.results.length)throw new Error('Unauthorized');return JSON.stringify(rows.results)
  },
  clock:()=>new Date(),
 },{offset,expectedFingerprint})
}
