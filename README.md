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
