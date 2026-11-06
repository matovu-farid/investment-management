import type { Investment, InvestmentRepository, Valuation, InvestmentTransaction } from './service'
export function createInvestmentRepository(db: D1Database): InvestmentRepository {
  const admin = "EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')"
  const columns = 'id, name, asset_class AS assetClass, currency, status, created_by AS createdBy'
  return {
    async roleFor(id) { return (await db.prepare('SELECT role FROM app_user_roles WHERE user_id = ?').bind(id).first<{role: string}>())?.role ?? null },
    async list(actor) {
      const [investments, valuations, transactions, authority] = await db.batch([
        db.prepare(`SELECT ${columns},(SELECT source_ref FROM investment_import_refs x WHERE x.kind='investment' AND x.record_id=investments.id) AS sourceRef FROM investments WHERE ${admin} ORDER BY name, id`).bind(actor),
        db.prepare(`SELECT v.id,v.investment_id AS investmentId,v.valuation_date AS valuationDate,v.amount_minor AS amountMinor,v.currency,v.basis,v.source,v.notes,(SELECT source_ref FROM investment_import_refs z WHERE z.kind='valuation' AND z.record_id=v.id) AS sourceRef,v.created_by AS createdBy,x.created_at AS voidedAt,x.reason AS voidReason FROM investment_valuations v LEFT JOIN investment_source_voids x ON x.source_kind='valuation' AND x.source_id=v.id WHERE ${admin} ORDER BY v.valuation_date DESC,v.id`).bind(actor),
        db.prepare(`SELECT t.id,t.investment_id AS investmentId,t.transaction_date AS transactionDate,t.transaction_type AS transactionType,t.amount_minor AS amountMinor,t.reference,t.notes,(SELECT source_ref FROM investment_import_refs z WHERE z.kind='transaction' AND z.record_id=t.id) AS sourceRef,t.created_by AS createdBy,x.created_at AS voidedAt,x.reason AS voidReason FROM investment_transactions t LEFT JOIN investment_source_voids x ON x.source_kind='transaction' AND x.source_id=t.id WHERE ${admin} ORDER BY t.transaction_date DESC,t.id`).bind(actor),
        db.prepare(`SELECT 1 WHERE ${admin}`).bind(actor),
      ])
      if (!authority.results.length) throw new Error('Unauthorized')
      return (investments.results as Investment[]).map(investment => ({ ...investment, valuations: (valuations.results as Valuation[]).filter(value => value.investmentId === investment.id), transactions: (transactions.results as InvestmentTransaction[]).filter(value => value.investmentId === investment.id) }))
    },
    async find(id, actor) { return db.prepare(`SELECT ${columns} FROM investments WHERE id = ? AND ${admin}`).bind(id,actor).first<Investment>() },
    async create(value, key) {
      await db.prepare(`INSERT INTO investments (id,name,asset_class,currency,status,created_by,request_key) SELECT ?,?,?,?,?,?,? WHERE ${admin} ON CONFLICT(request_key) DO NOTHING`).bind(value.id,value.name,value.assetClass,value.currency,value.status,value.createdBy,key,value.createdBy).run()
      const saved = await db.prepare(`SELECT ${columns} FROM investments WHERE request_key = ? AND ${admin}`).bind(key,value.createdBy).first<Investment>()
      if (!saved || saved.createdBy !== value.createdBy || saved.name !== value.name || saved.assetClass !== value.assetClass || saved.currency !== value.currency) throw new Error('Request key already used for different details')
      return saved
    },
    async addValuation(value, key) {
      await db.prepare(`INSERT INTO investment_valuations (id,investment_id,valuation_date,amount_minor,currency,basis,source,created_by,request_key) SELECT ?,?,?,?,?,?,?,?,? WHERE ${admin} AND EXISTS(SELECT 1 FROM investments WHERE id=? AND currency=?) ON CONFLICT(request_key) DO NOTHING`).bind(value.id,value.investmentId,value.valuationDate,value.amountMinor,value.currency,value.basis,value.source,value.createdBy,key,value.createdBy,value.investmentId,value.currency).run()
      const saved = await db.prepare(`SELECT id, investment_id AS investmentId, valuation_date AS valuationDate, amount_minor AS amountMinor, currency, basis, source, created_by AS createdBy,(SELECT count(*) FROM investment_source_voids WHERE source_kind='valuation' AND source_id=investment_valuations.id) AS isVoided FROM investment_valuations WHERE request_key = ? AND ${admin}`).bind(key,value.createdBy).first<Valuation & {isVoided:number}>()
      if (!saved || saved.createdBy !== value.createdBy || saved.investmentId !== value.investmentId || saved.valuationDate !== value.valuationDate || saved.amountMinor !== value.amountMinor || saved.currency !== value.currency || saved.basis !== value.basis || saved.source !== value.source) throw new Error('Request key already used for different details')
      if (saved.isVoided) throw new Error('Source was voided; review the register')
      const {isVoided, ...valuation} = saved
      return valuation
    },
    async addTransaction(value, key) {
      await db.prepare(`INSERT INTO investment_transactions (id,investment_id,transaction_date,transaction_type,amount_minor,reference,notes,created_by,request_key) SELECT ?,?,?,?,?,?,?,?,? WHERE ${admin} AND EXISTS(SELECT 1 FROM investments WHERE id=?) ON CONFLICT(request_key) DO NOTHING`).bind(value.id,value.investmentId,value.transactionDate,value.transactionType,value.amountMinor,value.reference,value.notes,value.createdBy,key,value.createdBy,value.investmentId).run()
      const saved = await db.prepare(`SELECT id,investment_id AS investmentId,transaction_date AS transactionDate,transaction_type AS transactionType,amount_minor AS amountMinor,reference,notes,created_by AS createdBy,(SELECT count(*) FROM investment_source_voids WHERE source_kind='transaction' AND source_id=investment_transactions.id) AS isVoided FROM investment_transactions WHERE request_key = ? AND ${admin}`).bind(key,value.createdBy).first<InvestmentTransaction & {isVoided:number}>()
      if (!saved || (['investmentId','transactionDate','transactionType','amountMinor','reference','notes','createdBy'] as const).some(field => saved[field] !== value[field])) throw new Error('Request key already used for different details')
      if (saved.isVoided) throw new Error('Source was voided; review the register')
      const {isVoided, ...transaction} = saved
      return transaction
    },
  }
}
