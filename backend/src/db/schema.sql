CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Columns are camelCase (quoted) so API output matches the spec's exact field names.

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  "passwordHash" text NOT NULL,
  role text NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'ADMIN')),
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uq ON users (lower(email));

CREATE TABLE IF NOT EXISTS tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "externalId" text NOT NULL UNIQUE,
  subject text NOT NULL,
  body text NOT NULL,
  "autoCategory" text NOT NULL
    CHECK ("autoCategory" IN ('BILLING','BUG','FEATURE_REQUEST','LOGIN','DELIVERY')),
  category text NOT NULL
    CHECK (category IN ('BILLING','BUG','FEATURE_REQUEST','LOGIN','DELIVERY')),
  "isHumanOverride" boolean NOT NULL DEFAULT false,
  priority text NOT NULL CHECK (priority IN ('LOW','MEDIUM','HIGH','URGENT')),
  status text NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN','IN_PROGRESS','RESOLVED','CLOSED')),
  "assigneeId" uuid REFERENCES users(id) ON DELETE SET NULL,
  "isReviewed" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tickets_created_at_id_desc_idx ON tickets ("createdAt" DESC, id DESC);
CREATE INDEX IF NOT EXISTS tickets_filters_idx ON tickets (status, category, priority, "createdAt" DESC, id DESC);
CREATE TABLE IF NOT EXISTS ticket_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ticketId" uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  field text NOT NULL CHECK (field IN ('category','priority','status','assigneeId')),
  "oldValue" text,
  "newValue" text,
  actor text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ticket_events_ticket_idx ON ticket_events ("ticketId", "createdAt");

CREATE TABLE IF NOT EXISTS resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('ROOM','LAB','EQUIPMENT')),
  capacity integer NOT NULL CHECK (capacity BETWEEN 1 AND 500),
  description text CHECK (description IS NULL OR char_length(description) <= 300),
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS resources_name_lower_uq ON resources (lower(name));

CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "resourceId" uuid NOT NULL REFERENCES resources(id),
  "userId" uuid NOT NULL REFERENCES users(id),
  "ticketId" uuid REFERENCES tickets(id) ON DELETE SET NULL,
  "startTime" timestamptz NOT NULL,
  "endTime" timestamptz NOT NULL,
  purpose text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
  "decisionNote" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CHECK ("endTime" > "startTime"),
  -- DB-level race safety (B6): no two active bookings may overlap on one resource.
  -- '[)' ranges make back-to-back bookings legal.
  CONSTRAINT bookings_no_overlap EXCLUDE USING gist (
    "resourceId" WITH =,
    tstzrange("startTime", "endTime", '[)') WITH &&
  ) WHERE (status IN ('PENDING','APPROVED'))
);
CREATE INDEX IF NOT EXISTS bookings_user_idx ON bookings ("userId", status);
CREATE INDEX IF NOT EXISTS bookings_resource_time_idx ON bookings ("resourceId", "startTime");
