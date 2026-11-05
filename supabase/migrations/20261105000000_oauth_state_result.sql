-- What a finished browser callback decided: connected, denied or failed.
--
-- The desktop reads this when no flowpost:// link reaches it — a closed tab, a
-- browser that blocks the automatic jump, an OS handoff that never lands. The
-- callback writes it, so the wait ends on the server's answer instead of
-- running down its timeout. Null keeps every connect that never came back.
alter table oauth_states add column if not exists result text;
