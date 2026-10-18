# Migraciones

Se aplican **a mano** (psql en el servidor o el editor SQL), en orden, y no hay
tabla de control: cada una es idempotente (`if not exists`, `on conflict do nothing`).

- **Numeradas (`045_…` en adelante):** el esquema actual, en orden. Las nuevas
  llevan el siguiente número libre.
- **Sin número (`helm_*.sql`, `apex_*`…):** las de antes de numerar. Ya están
  aplicadas; se dejan como historia. No se renombran: el código y los comentarios
  citan esos nombres y no se sabe su orden exacto.
- Algunas crearon tablas que borraron después la 077 o la 099; leerlas en ese
  contexto.

En el servidor:

```bash
docker exec -i supabase_db_apexallinone psql -U postgres -d postgres -v ON_ERROR_STOP=1 < migrations/NNN_nombre.sql
```
