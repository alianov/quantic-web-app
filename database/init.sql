-- Bootstrap schema for a new Docker volume. The ALTER statements also make this
-- file safe to apply once to the course project's earlier local schema.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS customers (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- Newsletter-only visitors provide an email but may not provide a name.
    name TEXT,
    email TEXT NOT NULL,
    phone TEXT,
    newsletter_signup BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Treat email case differences as the same customer identity.
CREATE UNIQUE INDEX IF NOT EXISTS customers_email_ci_unique
    ON customers (LOWER(email));

CREATE TABLE IF NOT EXISTS reservations (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_id BIGINT NOT NULL REFERENCES customers(id),
    time_slot TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    guest_count SMALLINT NOT NULL CHECK (guest_count BETWEEN 1 AND 12),
    table_number SMALLINT NOT NULL CHECK (table_number BETWEEN 1 AND 30),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT reservations_two_hour_duration_check
        CHECK (end_time = time_slot + INTERVAL '2 hours'),
    -- PostgreSQL rejects any overlapping use of the same table.
    CONSTRAINT reservations_no_table_overlap
        EXCLUDE USING gist (
            table_number WITH =,
            tstzrange(time_slot, end_time, '[)') WITH &&
        )
);

-- Fill the new duration column when this script is applied to the earlier schema.
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ;
UPDATE reservations
SET end_time = time_slot + INTERVAL '2 hours'
WHERE end_time IS NULL;
ALTER TABLE reservations ALTER COLUMN end_time SET NOT NULL;

ALTER TABLE reservations
    DROP CONSTRAINT IF EXISTS reservations_guest_count_check;
ALTER TABLE reservations
    ADD CONSTRAINT reservations_guest_count_check
    CHECK (guest_count BETWEEN 1 AND 12);

ALTER TABLE reservations
    DROP CONSTRAINT IF EXISTS reservations_two_hour_duration_check;
ALTER TABLE reservations
    ADD CONSTRAINT reservations_two_hour_duration_check
    CHECK (end_time = time_slot + INTERVAL '2 hours');

-- ADD CONSTRAINT has no portable IF NOT EXISTS form, so check the catalog first.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'reservations_no_table_overlap'
          AND conrelid = 'reservations'::regclass
    ) THEN
        ALTER TABLE reservations
            ADD CONSTRAINT reservations_no_table_overlap
            EXCLUDE USING gist (
                table_number WITH =,
                tstzrange(time_slot, end_time, '[)') WITH &&
            );
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS reservations_time_slot_idx
    ON reservations (time_slot);
