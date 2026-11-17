CREATE TABLE capacity_revisions(member_id TEXT PRIMARY KEY REFERENCES members(id),revision INTEGER NOT NULL DEFAULT 0);
INSERT INTO capacity_revisions(member_id) SELECT id FROM members;
CREATE TRIGGER capacity_member_insert AFTER INSERT ON members BEGIN INSERT INTO capacity_revisions(member_id) VALUES(NEW.id); END;
CREATE TRIGGER capacity_member_identity AFTER UPDATE OF full_name,member_number,status ON members WHEN OLD.full_name IS NOT NEW.full_name OR OLD.member_number IS NOT NEW.member_number OR OLD.status IS NOT NEW.status BEGIN UPDATE capacity_revisions SET revision=revision+1 WHERE member_id=NEW.id; END;
CREATE TRIGGER capacity_user_identity AFTER UPDATE OF name,email ON "user" WHEN OLD.name IS NOT NEW.name OR OLD.email IS NOT NEW.email BEGIN UPDATE capacity_revisions SET revision=revision+1 WHERE member_id IN (SELECT member_id FROM member_user_links WHERE user_id=NEW.id AND revoked_at IS NULL); END;
CREATE TRIGGER capacity_revision_0 AFTER INSERT ON holding_observations BEGIN UPDATE capacity_revisions SET revision=revision+1 WHERE member_id=NEW.member_id; END;
CREATE TRIGGER capacity_revision_1 AFTER INSERT ON holding_observation_voids BEGIN UPDATE capacity_revisions SET revision=revision+1 WHERE member_id=(SELECT member_id FROM holding_observations WHERE id=NEW.observation_id); END;
CREATE TRIGGER capacity_revision_2 AFTER INSERT ON holding_observation_publications BEGIN UPDATE capacity_revisions SET revision=revision+1 WHERE member_id=NEW.member_id; END;
CREATE TRIGGER capacity_revision_3 AFTER UPDATE ON holding_observation_publications BEGIN UPDATE capacity_revisions SET revision=revision+1 WHERE member_id=NEW.member_id; END;
CREATE TRIGGER capacity_revision_4 AFTER INSERT ON share_value_publications BEGIN UPDATE capacity_revisions SET revision=revision+1 WHERE member_id=NEW.member_id; END;
CREATE TRIGGER capacity_revision_5 AFTER UPDATE ON share_value_publications BEGIN UPDATE capacity_revisions SET revision=revision+1 WHERE member_id=NEW.member_id; END;
CREATE TRIGGER capacity_revision_6 AFTER INSERT ON share_events BEGIN UPDATE capacity_revisions SET revision=revision+1 WHERE member_id=NEW.member_id; END;
CREATE TRIGGER capacity_revision_7 AFTER UPDATE ON share_events BEGIN UPDATE capacity_revisions SET revision=revision+1 WHERE member_id=NEW.member_id; END;
CREATE TRIGGER capacity_revision_8 AFTER DELETE ON share_events BEGIN UPDATE capacity_revisions SET revision=revision+1 WHERE member_id=OLD.member_id; END;
CREATE TRIGGER capacity_revision_9 AFTER INSERT ON share_event_voids BEGIN UPDATE capacity_revisions SET revision=revision+1 WHERE member_id=(SELECT member_id FROM share_events WHERE id=NEW.event_id); END;
CREATE TRIGGER capacity_revision_10 AFTER INSERT ON loans BEGIN UPDATE capacity_revisions SET revision=revision+1 WHERE member_id=NEW.member_id; END;
CREATE TRIGGER capacity_revision_11 AFTER UPDATE ON loans BEGIN UPDATE capacity_revisions SET revision=revision+1 WHERE member_id=NEW.member_id; END;
CREATE TRIGGER capacity_revision_12 AFTER DELETE ON loans BEGIN UPDATE capacity_revisions SET revision=revision+1 WHERE member_id=OLD.member_id; END;
CREATE TRIGGER capacity_revision_13 AFTER INSERT ON loan_billing_revisions BEGIN UPDATE capacity_revisions SET revision=revision+1 WHERE member_id=(SELECT member_id FROM loans WHERE id=NEW.loan_id); END;
CREATE TRIGGER capacity_revision_14 AFTER UPDATE ON loan_billing_revisions BEGIN UPDATE capacity_revisions SET revision=revision+1 WHERE member_id=(SELECT member_id FROM loans WHERE id=NEW.loan_id); END;
CREATE TRIGGER capacity_revision_15 AFTER INSERT ON loan_term_changes BEGIN UPDATE capacity_revisions SET revision=revision+1 WHERE member_id=(SELECT member_id FROM loans WHERE id=NEW.loan_id); END;
CREATE TRIGGER capacity_revision_16 AFTER UPDATE ON loan_term_changes BEGIN UPDATE capacity_revisions SET revision=revision+1 WHERE member_id=(SELECT member_id FROM loans WHERE id=NEW.loan_id); END;
CREATE TRIGGER capacity_revision_17 AFTER DELETE ON loan_term_changes BEGIN UPDATE capacity_revisions SET revision=revision+1 WHERE member_id=(SELECT member_id FROM loans WHERE id=OLD.loan_id); END;
CREATE TRIGGER capacity_revision_18 AFTER INSERT ON loan_term_change_voids BEGIN UPDATE capacity_revisions SET revision=revision+1 WHERE member_id=(SELECT l.member_id FROM loans l JOIN loan_term_changes t ON t.loan_id=l.id WHERE t.id=NEW.term_change_id); END;
CREATE TRIGGER capacity_revision_19 AFTER INSERT ON loan_source_voids BEGIN UPDATE capacity_revisions SET revision=revision+1 WHERE member_id=(SELECT member_id FROM loans WHERE id=CASE WHEN NEW.source_kind='loan' THEN NEW.source_id ELSE (SELECT loan_id FROM loan_repayments WHERE id=NEW.source_id) END); END;
CREATE TRIGGER capacity_revision_20 AFTER INSERT ON loan_openings BEGIN UPDATE capacity_revisions SET revision=revision+1 WHERE member_id=(SELECT member_id FROM loans WHERE id=NEW.loan_id); END;
CREATE TRIGGER capacity_revision_21 AFTER DELETE ON loan_openings BEGIN UPDATE capacity_revisions SET revision=revision+1 WHERE member_id=(SELECT member_id FROM loans WHERE id=OLD.loan_id); END;
CREATE TRIGGER capacity_revision_22 AFTER INSERT ON loan_billing_opening_states BEGIN UPDATE capacity_revisions SET revision=revision+1 WHERE member_id=(SELECT member_id FROM loans WHERE id=NEW.loan_id); END;
CREATE TRIGGER capacity_revision_23 AFTER DELETE ON loan_billing_opening_states BEGIN UPDATE capacity_revisions SET revision=revision+1 WHERE member_id=(SELECT member_id FROM loans WHERE id=OLD.loan_id); END;
CREATE TRIGGER capacity_revision_24 AFTER INSERT ON loan_billing_legacy_reviews BEGIN UPDATE capacity_revisions SET revision=revision+1 WHERE member_id=(SELECT member_id FROM loans WHERE id=NEW.loan_id); END;
CREATE TRIGGER capacity_revision_25 AFTER UPDATE ON loan_billing_legacy_reviews BEGIN UPDATE capacity_revisions SET revision=revision+1 WHERE member_id=(SELECT member_id FROM loans WHERE id=NEW.loan_id); END;
CREATE TRIGGER capacity_loan_reassign AFTER UPDATE OF member_id ON loans WHEN OLD.member_id IS NOT NEW.member_id BEGIN UPDATE capacity_revisions SET revision=revision+1 WHERE member_id=OLD.member_id; END;
CREATE TRIGGER capacity_share_reassign AFTER UPDATE OF member_id ON share_events WHEN OLD.member_id IS NOT NEW.member_id BEGIN UPDATE capacity_revisions SET revision=revision+1 WHERE member_id=OLD.member_id; END;
CREATE TRIGGER capacity_billing_revision_delete AFTER DELETE ON loan_billing_revisions BEGIN UPDATE capacity_revisions SET revision=revision+1 WHERE member_id=(SELECT member_id FROM loans WHERE id=OLD.loan_id); END;
CREATE TRIGGER capacity_billing_revision_reassign AFTER UPDATE OF loan_id ON loan_billing_revisions WHEN OLD.loan_id IS NOT NEW.loan_id BEGIN UPDATE capacity_revisions SET revision=revision+1 WHERE member_id=(SELECT member_id FROM loans WHERE id=OLD.loan_id); END;
CREATE TABLE capacity_publications (
 id TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id), link_id TEXT NOT NULL REFERENCES member_user_links(id), user_id TEXT NOT NULL REFERENCES "user"(id),
 member_name TEXT NOT NULL, member_number TEXT NOT NULL, user_name TEXT NOT NULL, user_email TEXT NOT NULL,
 snapshot TEXT NOT NULL CHECK(json_valid(snapshot)), revision INTEGER NOT NULL, request_key TEXT NOT NULL UNIQUE, published_by TEXT NOT NULL REFERENCES "user"(id), published_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 withdrawn_at TEXT,withdrawn_by TEXT REFERENCES "user"(id),withdraw_key TEXT UNIQUE,
 CHECK((withdrawn_at IS NULL AND withdrawn_by IS NULL AND withdraw_key IS NULL) OR (withdrawn_at IS NOT NULL AND withdrawn_by IS NOT NULL AND withdraw_key IS NOT NULL))
);
CREATE TRIGGER capacity_publication_insert BEFORE INSERT ON capacity_publications BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.published_by AND role='admin') OR NOT EXISTS(SELECT 1 FROM capacity_revisions r JOIN members m ON m.id=r.member_id AND m.status='active' JOIN member_user_links k ON k.member_id=m.id AND k.revoked_at IS NULL JOIN "user" u ON u.id=k.user_id WHERE r.member_id=NEW.member_id AND r.revision=NEW.revision AND k.id=NEW.link_id AND k.user_id=NEW.user_id AND m.full_name=NEW.member_name AND m.member_number=NEW.member_number AND u.name=NEW.user_name AND u.email=NEW.user_email) THEN RAISE(ABORT,'capacity review or recipient changed') END;
END;
CREATE TRIGGER capacity_publication_update BEFORE UPDATE ON capacity_publications WHEN NEW.id IS NOT OLD.id OR NEW.member_id IS NOT OLD.member_id OR NEW.link_id IS NOT OLD.link_id OR NEW.user_id IS NOT OLD.user_id OR NEW.member_name IS NOT OLD.member_name OR NEW.member_number IS NOT OLD.member_number OR NEW.user_name IS NOT OLD.user_name OR NEW.user_email IS NOT OLD.user_email OR NEW.snapshot IS NOT OLD.snapshot OR NEW.revision IS NOT OLD.revision OR NEW.request_key IS NOT OLD.request_key OR NEW.published_by IS NOT OLD.published_by OR NEW.published_at IS NOT OLD.published_at OR OLD.withdrawn_at IS NOT NULL OR NEW.withdrawn_at IS NULL OR NEW.withdrawn_by IS NULL OR NEW.withdraw_key IS NULL OR NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.withdrawn_by AND role='admin') BEGIN SELECT RAISE(ABORT,'capacity publication immutable'); END;
CREATE TRIGGER capacity_publication_no_delete BEFORE DELETE ON capacity_publications BEGIN SELECT RAISE(ABORT,'capacity publication immutable'); END;
