import {test,expect,vi} from 'vitest'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {LiquiditySelectionFields} from '../../src/components/liquidity-review'

// Test the policy-date rule after the separate hydration guard has completed.
vi.mock('#/lib/use-hydrated', () => ({ useHydrated: () => true }))

test('liquidity review explains and disables unsupported dates',()=>{
 const base={value:null,onChange:()=>{},investments:[],cash:[]}
 const old=renderToStaticMarkup(createElement(LiquiditySelectionFields,{...base,asOf:'2025-09-27'}))
 expect(old).toContain('28 September 2025');expect(old).toContain('disabled=""')
 const current=renderToStaticMarkup(createElement(LiquiditySelectionFields,{...base,asOf:'2026-01-01'}))
 expect(current).not.toContain('disabled=""')
})
