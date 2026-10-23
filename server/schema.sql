CREATE TABLE IF NOT EXISTS regia_accounts (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text NOT NULL DEFAULT '',
  password_hash text,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('super_admin','member')),
  active boolean NOT NULL DEFAULT true,
  storage_id text NOT NULL,
  legacy_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS regia_sessions (
  token_hash text PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES regia_accounts(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS regia_sessions_account ON regia_sessions(account_id);
CREATE TABLE IF NOT EXISTS regia_invitations (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid NOT NULL REFERENCES regia_accounts(id)
);
CREATE TABLE IF NOT EXISTS regia_auth_limits (
  key text PRIMARY KEY,
  attempts integer NOT NULL,
  expires_at timestamptz NOT NULL
);
