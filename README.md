# earlybird profit (MVP)

Ziele: Artikelstamm, Lieferantenrechnungen importieren, Einkaufspreise historisieren, DB I je Produkt/Kanal anzeigen.

## Tech
- Supabase (Postgres, Auth, RLS, Functions)
- React + TS (Vite) – Hosting via Netlify
- Edge Functions:
  - `import-invoice` (POST)
  - `prices-product-history` (GET)
  - `dbi` (GET)

## Setup
Siehe Abschnitt "Schritt-für-Schritt" in der Chat-Antwort.

## Supabase Edge Functions via GitHub Actions deployen

1. Lege in den Repository-Einstellungen zwei Secrets an:
   - `SUPABASE_ACCESS_TOKEN`: persönliches Access-Token aus dem Supabase-Dashboard.
   - `SUPABASE_PROJECT_REF`: Projekt-Referenz (z. B. `abcd1234`).
2. Stelle sicher, dass der Branch `main` die gewünschten Änderungen an `supabase/functions/` enthält.
3. Der neue Workflow `.github/workflows/deploy-supabase.yml` startet automatisch bei Pushes auf `main` (oder manuell via "Run workflow") und führt `supabase functions deploy import-invoice` mit den hinterlegten Secrets aus.

> Hinweis: Der Workflow deployt aktuell nur die `import-invoice`-Funktion. Weitere Functions kannst du nach Bedarf ergänzen.
