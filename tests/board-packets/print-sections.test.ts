import {test} from 'node:test'
import {strict as assert} from 'node:assert'
import {boardPrintSections} from '../../src/lib/board-print-sections.ts'

test('print preparation opens all captured sections including combined allocation',()=>{
 assert.deepEqual(boardPrintSections({}),['activity','lending','trial'])
 assert.deepEqual(boardPrintSections({creditRisk:{},sales:{},calculatedLending:{},allocation:{},combinedAllocation:{},statements:[{},{}],budgets:{}}),['activity','lending','trial','credit-risk','sales','calculated-lending','allocation','combined-allocation','statement-0','statement-1','budgets'])
})
