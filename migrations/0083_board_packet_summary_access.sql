-- Existing grants retain full-packet semantics; summary grants freeze their own allowlisted projection.
ALTER TABLE board_packet_access_grants ADD COLUMN share_mode TEXT NOT NULL DEFAULT 'full' CHECK(share_mode IN ('full','summary'));
ALTER TABLE board_packet_access_grants ADD COLUMN summary_json TEXT;
CREATE TRIGGER board_packet_access_summary_validate BEFORE INSERT ON board_packet_access_grants BEGIN
 SELECT CASE WHEN (NEW.share_mode='full' AND NEW.summary_json IS NOT NULL) OR (NEW.share_mode='summary' AND (NEW.summary_json IS NULL OR NOT json_valid(NEW.summary_json))) THEN RAISE(ABORT,'invalid packet access mode') END;
END;
-- Reconstruct the exact allowlist at the write boundary. No omitted packet field
-- or caller-supplied value can enter a summary grant, even via an alternate writer.
CREATE TRIGGER board_packet_access_summary_projection BEFORE INSERT ON board_packet_access_grants WHEN NEW.share_mode='summary' BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM board_packets p JOIN board_packet_previews v ON v.id=p.preview_id
  WHERE p.id=NEW.packet_id AND NEW.summary_json=json_object(
   'start',json_extract(v.packet,'$.start'),'end',json_extract(v.packet,'$.end'),
   'calculatedLending',json_object(
    'capturedFrom',json_extract(v.packet,'$.calculatedLending.capturedFrom'),
    'capturedTo',json_extract(v.packet,'$.calculatedLending.capturedTo'),
    'data',json_object(
     'asOf',json_extract(v.packet,'$.calculatedLending.data.asOf'),
     'eligible',json_extract(v.packet,'$.calculatedLending.data.eligible'),
     'included',json_extract(v.packet,'$.calculatedLending.data.included'),
     'omitted',json_object(
      'unconfigured',json_extract(v.packet,'$.calculatedLending.data.omitted.unconfigured'),
      'pendingRepayments',json_extract(v.packet,'$.calculatedLending.data.omitted.pendingRepayments'),
      'unavailable',json_extract(v.packet,'$.calculatedLending.data.omitted.unavailable')),
     'totals',json((SELECT json_group_array(json_object(
      'currency',json_extract(t.value,'$.currency'),
      'principalMinor',json_extract(t.value,'$.principalMinor'),
      'interestMinor',json_extract(t.value,'$.interestMinor'))) FROM json_each(v.packet,'$.calculatedLending.data.totals') t)))))
 ) THEN RAISE(ABORT,'summary does not match saved packet projection') END;
END;
