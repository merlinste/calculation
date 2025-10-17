# earlybird-profit (MVP)

Einkaufspreis-Historie, DB I & CSV/JSON-Import (Supabase + Edge Functions).

## Voraussetzungen
- Node 18+ (für CLI)
- Supabase CLI: https://supabase.com/docs/guides/cli
- Ein Supabase-Projekt (Cloud) **oder** lokal `supabase start`

## 1) Setup (lokal erstmal am einfachsten)

```bash
# 1) Repo klonen
git clone <dein-repo-url> earlybird-profit
cd earlybird-profit

# 2) Supabase initialisieren (lokal)
supabase init
supabase start   # startet lokale DB & Studio

# 3) Migration & Seeds anwenden
supabase db reset      # oder:
# supabase db push     # wenn du keine vorhandene DB überschreiben willst
psql "$SUPABASE_DB_URL" -f supabase/seed/001_seed.sql
