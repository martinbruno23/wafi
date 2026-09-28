-- Nombre del programa de fidelización de cada comercio (ej. "Batateros Club").
-- Es lo que el cliente ve como título de su tarjeta en la wallet. Si queda
-- vacío, se usa el nombre del comercio.
alter table merchants add column if not exists program_name text;
