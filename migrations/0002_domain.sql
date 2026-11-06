-- Factual registers only. These records do not calculate balances, transfer shares,
-- approve credit, or post journal entries. Financial rules remain to be confirmed.
CREATE TABLE members (
  id TEXT PRIMARY KEY NOT NULL,
  member_number TEXT NOT NULL UNIQUE CHECK(length(trim(member_number)) > 0),
  full_name TEXT NOT NULL CHECK(length(trim(full_name)) > 0),
  email TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
  created_by TEXT NOT NULL CHECK(length(trim(created_by)) > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Joint holders are linked without assuming ownership percentages or splitting shares.
CREATE TABLE joint_shareholdings (
  id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL CHECK(length(trim(name)) > 0),
  created_by TEXT NOT NULL CHECK(length(trim(created_by)) > 0), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE joint_shareholding_members (
  shareholding_id TEXT NOT NULL REFERENCES joint_shareholdings(id), member_id TEXT NOT NULL REFERENCES members(id),
  created_by TEXT NOT NULL CHECK(length(trim(created_by)) > 0), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(shareholding_id, member_id)
);
-- Events refer to exactly one individual or one joint holding; they do not
-- automatically transfer ownership or generate a matching counterparty event.
CREATE TABLE share_events (
  id TEXT PRIMARY KEY NOT NULL,
  member_id TEXT REFERENCES members(id),
  joint_shareholding_id TEXT REFERENCES joint_shareholdings(id),
  event_type TEXT NOT NULL CHECK(event_type IN ('opening','issue','bonus','purchase','sale','exit','adjustment')),
  shares INTEGER NOT NULL CHECK(typeof(shares)='integer' AND shares > 0 AND shares <= 9007199254740991),
  event_date TEXT NOT NULL CHECK(event_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  reference TEXT, notes TEXT,
  created_by TEXT NOT NULL CHECK(length(trim(created_by)) > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK((member_id IS NOT NULL) <> (joint_shareholding_id IS NOT NULL))
);
CREATE INDEX share_events_member_idx ON share_events(member_id, event_date);

CREATE TABLE loans (
  id TEXT PRIMARY KEY NOT NULL,
  member_id TEXT NOT NULL REFERENCES members(id),
  principal_minor INTEGER NOT NULL CHECK(typeof(principal_minor)='integer' AND principal_minor > 0 AND principal_minor <= 9007199254740991),
  currency TEXT NOT NULL CHECK(currency GLOB '[A-Z][A-Z][A-Z]'),
  disbursement_date TEXT NOT NULL CHECK(disbursement_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  maturity_date TEXT CHECK(maturity_date IS NULL OR (maturity_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND maturity_date >= disbursement_date)),
  terms TEXT NOT NULL CHECK(length(trim(terms)) > 0),
  reference TEXT, notes TEXT,
  created_by TEXT NOT NULL CHECK(length(trim(created_by)) > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX loans_member_idx ON loans(member_id, disbursement_date);

-- Terms changes and repayments are recorded as facts, not interpreted as a formula.
CREATE TABLE loan_term_changes (
  id TEXT PRIMARY KEY NOT NULL, loan_id TEXT NOT NULL REFERENCES loans(id),
  effective_date TEXT NOT NULL CHECK(effective_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  terms TEXT NOT NULL CHECK(length(trim(terms)) > 0),
  created_by TEXT NOT NULL CHECK(length(trim(created_by)) > 0), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE loan_repayments (
  id TEXT PRIMARY KEY NOT NULL, loan_id TEXT NOT NULL REFERENCES loans(id),
  payment_date TEXT NOT NULL CHECK(payment_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  amount_minor INTEGER NOT NULL CHECK(typeof(amount_minor)='integer' AND amount_minor > 0 AND amount_minor <= 9007199254740991),
  reference TEXT, notes TEXT,
  created_by TEXT NOT NULL CHECK(length(trim(created_by)) > 0), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX loan_repayments_loan_idx ON loan_repayments(loan_id, payment_date);

CREATE TABLE credit_bookings (
  id TEXT PRIMARY KEY NOT NULL, member_id TEXT NOT NULL REFERENCES members(id),
  requested_minor INTEGER NOT NULL CHECK(typeof(requested_minor)='integer' AND requested_minor > 0 AND requested_minor <= 9007199254740991),
  currency TEXT NOT NULL CHECK(currency GLOB '[A-Z][A-Z][A-Z]'),
  requested_date TEXT NOT NULL CHECK(requested_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting','held','closed','cancelled')),
  notes TEXT, created_by TEXT NOT NULL CHECK(length(trim(created_by)) > 0), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE credit_booking_fulfilments (
  id TEXT PRIMARY KEY NOT NULL, booking_id TEXT NOT NULL REFERENCES credit_bookings(id),
  loan_id TEXT REFERENCES loans(id),
  amount_minor INTEGER NOT NULL CHECK(typeof(amount_minor)='integer' AND amount_minor > 0 AND amount_minor <= 9007199254740991),
  fulfilment_date TEXT NOT NULL CHECK(fulfilment_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  notes TEXT, created_by TEXT NOT NULL CHECK(length(trim(created_by)) > 0), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE investments (
  id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL CHECK(length(trim(name)) > 0),
  asset_class TEXT NOT NULL CHECK(length(trim(asset_class)) > 0),
  currency TEXT NOT NULL CHECK(currency GLOB '[A-Z][A-Z][A-Z]'),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','closed')),
  notes TEXT, created_by TEXT NOT NULL CHECK(length(trim(created_by)) > 0), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE investment_transactions (
  id TEXT PRIMARY KEY NOT NULL, investment_id TEXT NOT NULL REFERENCES investments(id),
  transaction_date TEXT NOT NULL CHECK(transaction_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  transaction_type TEXT NOT NULL CHECK(length(trim(transaction_type)) > 0),
  amount_minor INTEGER NOT NULL CHECK(typeof(amount_minor)='integer' AND amount_minor > 0 AND amount_minor <= 9007199254740991),
  reference TEXT, notes TEXT, created_by TEXT NOT NULL CHECK(length(trim(created_by)) > 0), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE investment_valuations (
  id TEXT PRIMARY KEY NOT NULL, investment_id TEXT NOT NULL REFERENCES investments(id),
  valuation_date TEXT NOT NULL CHECK(valuation_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  amount_minor INTEGER NOT NULL CHECK(typeof(amount_minor)='integer' AND amount_minor >= 0 AND amount_minor <= 9007199254740991),
  currency TEXT NOT NULL CHECK(currency GLOB '[A-Z][A-Z][A-Z]'),
  basis TEXT NOT NULL CHECK(length(trim(basis)) > 0), source TEXT, notes TEXT,
  created_by TEXT NOT NULL CHECK(length(trim(created_by)) > 0), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX investment_valuations_investment_idx ON investment_valuations(investment_id, valuation_date);
CREATE TABLE policy_targets (
  id TEXT PRIMARY KEY NOT NULL, asset_class TEXT NOT NULL CHECK(length(trim(asset_class)) > 0),
  target_basis_points INTEGER CHECK(target_basis_points IS NULL OR (typeof(target_basis_points)='integer' AND target_basis_points BETWEEN 0 AND 10000)),
  min_basis_points INTEGER CHECK(min_basis_points IS NULL OR (typeof(min_basis_points)='integer' AND min_basis_points BETWEEN 0 AND 10000)),
  max_basis_points INTEGER CHECK(max_basis_points IS NULL OR (typeof(max_basis_points)='integer' AND max_basis_points BETWEEN 0 AND 10000)),
  effective_date TEXT NOT NULL CHECK(effective_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  source TEXT, notes TEXT, created_by TEXT NOT NULL CHECK(length(trim(created_by)) > 0), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(asset_class, effective_date),
  CHECK(target_basis_points IS NOT NULL OR (min_basis_points IS NOT NULL AND max_basis_points IS NOT NULL)),
  CHECK((min_basis_points IS NULL AND max_basis_points IS NULL) OR (min_basis_points IS NOT NULL AND max_basis_points IS NOT NULL AND min_basis_points <= max_basis_points)),
  CHECK(target_basis_points IS NULL OR min_basis_points IS NULL OR target_basis_points BETWEEN min_basis_points AND max_basis_points)
);
