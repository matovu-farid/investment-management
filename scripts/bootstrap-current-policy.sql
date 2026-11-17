-- The user confirmed the 28 September 2025 IPS is current. Its approval date
-- is used provisionally as the effective date; this does not set point targets
-- or approve valuations. Existing records at the same class/date are retained.
WITH seeds (id,asset_class,effective_date,min_basis_points,max_basis_points,target_basis_points,source,notes,created_by) AS (
VALUES
 ('ips-2025-kanungu','Kanungu member credit','2025-09-28',3500,4500,NULL,'RNIG IPS approved 28 September 2025, printed pages 6–7','Approval date used provisionally as effective date; selected-source comparisons are not a compliance determination.','system:confirmed-ips-bootstrap'),
 ('ips-2025-equities','Quoted equities','2025-09-28',2500,4500,NULL,'RNIG IPS approved 28 September 2025, printed pages 6–7','Approval date used provisionally as effective date; selected-source comparisons are not a compliance determination.','system:confirmed-ips-bootstrap'),
 ('ips-2025-bonds','Government long-term securities (bonds)','2025-09-28',1000,2500,NULL,'RNIG IPS approved 28 September 2025, printed pages 6–7','Approval date used provisionally as effective date; selected-source comparisons are not a compliance determination.','system:confirmed-ips-bootstrap'),
 ('ips-2025-short-term','Short-term instruments','2025-09-28',500,1500,NULL,'RNIG IPS approved 28 September 2025, printed pages 6–7','Approval date used provisionally as effective date; selected-source comparisons are not a compliance determination.','system:confirmed-ips-bootstrap'),
 ('ips-2025-turbo','Turbo private equity fund','2025-09-28',1000,2000,NULL,'RNIG IPS approved 28 September 2025, printed pages 6–7','Approval date used provisionally as effective date; selected-source comparisons are not a compliance determination.','system:confirmed-ips-bootstrap')
)
INSERT INTO policy_targets (id,asset_class,effective_date,min_basis_points,max_basis_points,target_basis_points,source,notes,created_by)
SELECT s.id,s.asset_class,s.effective_date,s.min_basis_points,s.max_basis_points,s.target_basis_points,s.source,s.notes,s.created_by FROM seeds s
WHERE NOT EXISTS (SELECT 1 FROM policy_targets p WHERE p.id=s.id OR (p.asset_class=s.asset_class AND p.effective_date=s.effective_date))
  AND NOT EXISTS (SELECT 1 FROM effective_policy_targets p WHERE p.asset_class=s.asset_class AND p.effective_date=s.effective_date);
