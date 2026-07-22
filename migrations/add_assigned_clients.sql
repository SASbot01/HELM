-- Empleados BlackWolf: acceso multi-cliente
-- Permite asignar un array de client UUIDs a miembros del equipo BW
ALTER TABLE team ADD COLUMN IF NOT EXISTS assigned_clients jsonb DEFAULT NULL;
-- NULL = miembro normal de un solo cliente
-- ["uuid1","uuid2"] = empleado BW con acceso a esos clientes
