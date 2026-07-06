ALTER TABLE workflows ADD COLUMN drive_account_id UUID REFERENCES connected_accounts(id);
