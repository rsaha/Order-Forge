#!/bin/bash
set -e
npm install
npm run db:push

# Seed required brands (idempotent - safe to run multiple times)
psql "$DATABASE_URL" <<'SQL'
INSERT INTO brands (id, name, is_active, created_at)
VALUES (gen_random_uuid(), 'Lifewear', true, NOW())
ON CONFLICT (name) DO NOTHING;

INSERT INTO brands (id, name, is_active, created_at)
VALUES (gen_random_uuid(), 'Vissco', true, NOW())
ON CONFLICT (name) DO NOTHING;
SQL
