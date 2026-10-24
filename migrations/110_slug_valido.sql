-- El slug de un perfil es su llave fuera del panel (su web, el MCP): solo
-- minúsculas, números y guiones. Con mayúsculas o espacios, el MCP podía leer
-- `DETRAS-DE-CAMRA` como el perfil de otra agencia. La pasarela ya lo valida;
-- esto lo asegura en la base para cualquier otro camino.
ALTER TABLE clients
  ADD CONSTRAINT clients_slug_valido
  CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$' AND length(slug) <= 60);
