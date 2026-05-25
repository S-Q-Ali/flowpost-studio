-- Add scheduling_mode and custom_schedule to workflows
ALTER TABLE workflows ADD COLUMN scheduling_mode TEXT NOT NULL DEFAULT 'once_daily';
ALTER TABLE workflows ADD COLUMN custom_schedule JSONB;

-- Migrate existing interval workflows
UPDATE workflows SET scheduling_mode = 'interval' WHERE run_interval_hours > 1;

ALTER TABLE workflows ADD CONSTRAINT scheduling_mode_check
  CHECK (scheduling_mode IN ('once_daily', 'interval', 'custom_ranges'));
