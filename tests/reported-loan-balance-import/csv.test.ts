import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {parseReportedLoanBalanceCsv} from '../../src/lib/reported-loan-balance-import/csv.ts'
const h='source_ref,loan_ref,observed_date,amount_minor,basis,source\n'
test('preserves exact large amounts and quoted source',()=>{const p=parseReportedLoanBalanceCsv(h+'0001,id:loan,2020-01-01,123456789012345678901234567890,"Reported, balance",Sheet');assert.deepEqual(p.errors,[]);assert.equal(p.rows[0].sourceRef,'0001');assert.equal(p.rows[0].amountMinor,'123456789012345678901234567890');assert.equal(p.rows[0].basis,'Reported, balance')})
test('rejects duplicate references, invalid date, amount and malformed csv',()=>{assert.ok(parseReportedLoanBalanceCsv(h+'a,id:x,2020-02-30,01,b,s\na,id:x,2020-01-01,0,b,s').errors.length);assert.ok(parseReportedLoanBalanceCsv(h+'a,id:x,2020-01-01,0,"bad,s').errors.length)})
