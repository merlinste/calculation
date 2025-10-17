# import-invoice

POST JSON an diese Function. Erwartet Struktur:
{
  "supplier": "Beyers Koffie GmbH",
  "invoice_no": "90226599",
  "invoice_date": "2025-09-30",
  "currency": "EUR",
  "options": { "allocate_surcharges": "per_kg", "autoCreateProducts": true },
  "items": [
    { "line_type":"product","product_sku":"762101","product_name":"EB Lungo","qty":680,"uom":"TU","unit_price_net":11.79,"tax_rate_percent":7 }
  ]
}
Antwort: { "status":"ok", "invoice_id":"..." }
