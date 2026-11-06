import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { formatJournalDescription } from '../../src/lib/journal-description.ts'

test('formats generated descriptions without internal length markers',()=>{
 assert.equal(formatJournalDescription('loan-disbursement','Loan principal disbursement 3:abc member 2:xy'),'Loan principal disbursement abc · member xy')
 assert.equal(formatJournalDescription('loan-repayment','Loan repayment 3:abc loan 2:xy member 1:z'),'Loan repayment abc · loan xy · member z')
 assert.equal(formatJournalDescription('investment-transaction','Investment transaction 2:😀a investment 2:xy type 8:Dividend'),'Investment transaction 😀a · investment xy · type Dividend')
})

test('preserves manual and malformed descriptions exactly',()=>{
 assert.equal(formatJournalDescription('manual','Loan repayment 3:abc loan 2:xy member 1:z'),'Loan repayment 3:abc loan 2:xy member 1:z')
 assert.equal(formatJournalDescription('loan-repayment','Loan repayment 9:abc loan 2:xy member 1:z'),'Loan repayment 9:abc loan 2:xy member 1:z')
})
