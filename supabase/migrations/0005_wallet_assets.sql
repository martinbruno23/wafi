-- Imágenes de marca para el pass de Apple (SPEC §8.2/§8.3).
-- logo_wide_url: logo apaisado y claro, para fondos del color del comercio.
-- stamp_icon_url: silueta (PNG con transparencia) de cada sello; si falta, círculos.
alter table merchants add column if not exists logo_wide_url text;
alter table merchants add column if not exists stamp_icon_url text;
