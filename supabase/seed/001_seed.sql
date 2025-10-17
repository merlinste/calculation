insert into channels (code, name) values
  ('LEH','Lebensmitteleinzelhandel'),
  ('B2B','B2B'),
  ('D2C','Online-Shop')
on conflict (code) do nothing;

-- Beispiel-Produkte
insert into products (sku, ean, name, category, base_uom, pieces_per_tu)
values
  ('762100', null, 'EB Espresso Homecoffee (Kapseln)',  'Kapseln', 'piece', 100),
  ('762101', null, 'EB Lungo Homecoffee (Kapseln)',     'Kapseln', 'piece', 100),
  ('762102', null, 'EB Decaf Homecoffee (Kapseln)',     'Kapseln', 'piece', 100),
  ('EBC-1042', null, 'Bio Filterkaffee 250g gemahlen',  'Kaffee',  'kg',    null),
  ('EBC-1043', null, 'Bio Espresso 250g gemahlen',      'Kaffee',  'kg',    null),
  ('EBC-1044', null, 'Bio Filter entkoff. 250g gem.',   'Kaffee',  'kg',    null)
on conflict (sku) do nothing;

-- Beispiel-Verkaufspreise (netto pro Basiseinheit)
-- Kapseln pro Stück (1 Kapsel = 1 piece); Bohnen gemahlen pro kg
insert into sales_prices (product_id, channel, uom, price_net, valid_from)
select id, 'D2C', 'piece', 0.32, current_date from products where sku in ('762100','762101','762102')
union all
select id, 'LEH', 'kg', 44.00, current_date from products where sku in ('EBC-1042')
union all
select id, 'LEH', 'kg', 46.00, current_date from products where sku in ('EBC-1043')
union all
select id, 'LEH', 'kg', 52.00, current_date from products where sku in ('EBC-1044')
on conflict do nothing;

-- Optional: Standard-Allocation-Policy je Lieferant/Produkt später konfigurierbar
