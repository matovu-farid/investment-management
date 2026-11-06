import type { Booking, Fulfilment, LendingRepository, Loan, Repayment } from './service'

export function lendingRepository(db: D1Database): LendingRepository {
  return {
    async roleFor(id) { return (await db.prepare('SELECT role FROM app_user_roles WHERE user_id=?').bind(id).first<{ role: string }>())?.role ?? null },
    async memberIsActive(id) { return Boolean(await db.prepare("SELECT id FROM members WHERE id=? AND status='active'").bind(id).first()) },
    async loanDate(id) { return (await db.prepare(`SELECT disbursement_date AS date FROM loans WHERE id=? AND NOT EXISTS (SELECT 1 FROM loan_source_voids v WHERE v.source_kind='loan' AND v.source_id=loans.id)`).bind(id).first<{date:string}>())?.date ?? null },
    async bookingDate(id) { return (await db.prepare('SELECT requested_date AS date FROM credit_bookings WHERE id=?').bind(id).first<{date:string}>())?.date ?? null },
    async list() {
      // Keep booking totals and void history in the same D1 snapshot.
      const [loans, bookings, fulfilments, repayments] = await db.batch([
        db.prepare(`SELECT l.id, l.member_id AS memberId, m.full_name AS memberName, l.principal_minor AS principalMinor, l.currency, l.disbursement_date AS disbursementDate, l.maturity_date AS maturityDate, l.terms, l.created_by AS createdBy,(SELECT v.created_at FROM loan_source_voids v WHERE v.source_kind='loan' AND v.source_id=l.id) AS voidedAt,(SELECT v.reason FROM loan_source_voids v WHERE v.source_kind='loan' AND v.source_id=l.id) AS voidReason FROM loans l JOIN members m ON m.id=l.member_id ORDER BY l.disbursement_date DESC, l.id`),
        db.prepare('SELECT b.id, b.member_id AS memberId, m.full_name AS memberName, b.requested_minor AS requestedMinor, b.currency, b.requested_date AS requestedDate, b.status, b.notes, (SELECT x.source_ref FROM booking_import_refs x WHERE x.booking_id=b.id) AS sourceRef, b.created_by AS createdBy, COALESCE((SELECT sum(f.amount_minor) FROM credit_booking_fulfilments f WHERE f.booking_id=b.id AND NOT EXISTS (SELECT 1 FROM booking_fulfilment_voids v WHERE v.fulfilment_id=f.id)),0) AS fulfilledMinor FROM credit_bookings b JOIN members m ON m.id=b.member_id ORDER BY b.requested_date DESC, b.id'),
        db.prepare('SELECT f.id, f.booking_id AS bookingId, f.amount_minor AS amountMinor, f.fulfilment_date AS fulfilmentDate, f.created_by AS createdBy, (SELECT x.source_ref FROM booking_import_refs x WHERE x.booking_id=f.booking_id) AS bookingSourceRef, (SELECT x.source_ref FROM booking_fulfilment_import_refs x WHERE x.fulfilment_id=f.id) AS sourceRef, v.created_at AS voidedAt, v.reason AS voidReason FROM credit_booking_fulfilments f LEFT JOIN booking_fulfilment_voids v ON v.fulfilment_id=f.id ORDER BY f.fulfilment_date DESC, f.id'),
        db.prepare(`SELECT id,loan_id AS loanId,payment_date AS paymentDate,amount_minor AS amountMinor,reference,notes,created_by AS createdBy,(SELECT v.created_at FROM loan_source_voids v WHERE v.source_kind='repayment' AND v.source_id=loan_repayments.id) AS voidedAt,(SELECT v.reason FROM loan_source_voids v WHERE v.source_kind='repayment' AND v.source_id=loan_repayments.id) AS voidReason FROM loan_repayments ORDER BY payment_date DESC,id`),
      ])
      return { loans: loans.results as Loan[], bookings: bookings.results as Booking[], fulfilments: fulfilments.results as Fulfilment[], repayments: repayments.results as Repayment[] }
    },
    async createLoan(l, key) {
      await db.prepare("INSERT INTO loans (id,member_id,principal_minor,currency,disbursement_date,maturity_date,terms,created_by,idempotency_key) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin') AND EXISTS(SELECT 1 FROM members WHERE id=? AND status='active') AND NOT EXISTS(SELECT 1 FROM loans WHERE idempotency_key=?)").bind(l.id,l.memberId,l.principalMinor,l.currency,l.disbursementDate,l.maturityDate,l.terms,l.createdBy,key,l.createdBy,l.memberId,key).run()
      const saved = await db.prepare("SELECT id, member_id AS memberId, principal_minor AS principalMinor, currency, disbursement_date AS disbursementDate, maturity_date AS maturityDate, terms, created_by AS createdBy FROM loans WHERE idempotency_key=? AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')").bind(key,l.createdBy).first<Loan>()
      if (!saved || saved.memberId !== l.memberId || saved.principalMinor !== l.principalMinor || saved.currency !== l.currency || saved.disbursementDate !== l.disbursementDate || saved.maturityDate !== l.maturityDate || saved.terms !== l.terms || saved.createdBy !== l.createdBy) throw new Error('Request key already used for a different loan')
      if (await db.prepare("SELECT 1 FROM loan_source_voids WHERE source_kind='loan' AND source_id=?").bind(saved.id).first()) throw new Error('Loan record was voided')
      return saved
    },
    async createBooking(b, key) {
      await db.prepare("INSERT INTO credit_bookings (id,member_id,requested_minor,currency,requested_date,status,created_by,idempotency_key) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin') AND EXISTS(SELECT 1 FROM members WHERE id=? AND status='active') AND NOT EXISTS(SELECT 1 FROM credit_bookings WHERE idempotency_key=?)").bind(b.id,b.memberId,b.requestedMinor,b.currency,b.requestedDate,b.status,b.createdBy,key,b.createdBy,b.memberId,key).run()
      const saved = await db.prepare("SELECT id, member_id AS memberId, requested_minor AS requestedMinor, currency, requested_date AS requestedDate, status, created_by AS createdBy FROM credit_bookings WHERE idempotency_key=? AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')").bind(key,b.createdBy).first<Booking>()
      if (!saved || saved.memberId !== b.memberId || saved.requestedMinor !== b.requestedMinor || saved.currency !== b.currency || saved.requestedDate !== b.requestedDate || saved.createdBy !== b.createdBy) throw new Error('Request key already used for a different booking')
      return saved
    },
    async createRepayment(p, key) {
      await db.prepare("INSERT INTO loan_repayments (id,loan_id,payment_date,amount_minor,reference,notes,created_by,idempotency_key) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin') AND EXISTS(SELECT 1 FROM loans l WHERE l.id=? AND l.disbursement_date<=? AND NOT EXISTS(SELECT 1 FROM loan_source_voids v WHERE v.source_kind='loan' AND v.source_id=l.id)) AND NOT EXISTS(SELECT 1 FROM loan_repayments WHERE idempotency_key=?)").bind(p.id,p.loanId,p.paymentDate,p.amountMinor,p.reference,p.notes,p.createdBy,key,p.createdBy,p.loanId,p.paymentDate,key).run()
      const saved = await db.prepare("SELECT id,loan_id AS loanId,payment_date AS paymentDate,amount_minor AS amountMinor,reference,notes,created_by AS createdBy FROM loan_repayments WHERE idempotency_key=? AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')").bind(key,p.createdBy).first<Repayment>()
      if (!saved || saved.loanId !== p.loanId || saved.paymentDate !== p.paymentDate || saved.amountMinor !== p.amountMinor || saved.reference !== p.reference || saved.notes !== p.notes || saved.createdBy !== p.createdBy) throw new Error('Request key already used for a different repayment')
      if (await db.prepare("SELECT 1 FROM loan_source_voids WHERE source_kind='repayment' AND source_id=?").bind(saved.id).first()) throw new Error('Repayment record was voided')
      return saved
    },
    async createFulfilment(f, key) {
      // SELECT prevents BEFORE INSERT triggers firing again on an identical retry.
      await db.prepare("INSERT INTO credit_booking_fulfilments (id,booking_id,amount_minor,fulfilment_date,created_by,idempotency_key) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin') AND EXISTS(SELECT 1 FROM credit_bookings WHERE id=? AND requested_date<=?) AND NOT EXISTS (SELECT 1 FROM credit_booking_fulfilments WHERE idempotency_key=?)").bind(f.id,f.bookingId,f.amountMinor,f.fulfilmentDate,f.createdBy,key,f.createdBy,f.bookingId,f.fulfilmentDate,key).run()
      const saved = await db.prepare("SELECT id,booking_id AS bookingId,amount_minor AS amountMinor,fulfilment_date AS fulfilmentDate,created_by AS createdBy FROM credit_booking_fulfilments WHERE idempotency_key=? AND EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='admin')").bind(key,f.createdBy).first<Fulfilment>()
      if (!saved || saved.bookingId !== f.bookingId || saved.amountMinor !== f.amountMinor || saved.fulfilmentDate !== f.fulfilmentDate || saved.createdBy !== f.createdBy) throw new Error('Request key already used for a different fulfilment')
      if (await db.prepare('SELECT 1 FROM booking_fulfilment_voids WHERE fulfilment_id=?').bind(saved.id).first()) throw new Error('Fulfilment record was voided')
      return saved
    },
  }
}
