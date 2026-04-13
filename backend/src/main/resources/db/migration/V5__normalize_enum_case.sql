-- Normalize existing enum values to uppercase
UPDATE tickets SET priority = UPPER(priority) WHERE priority <> UPPER(priority);
UPDATE tickets SET status   = UPPER(status)   WHERE status   <> UPPER(status);
