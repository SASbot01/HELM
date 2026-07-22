# Legacy SQL (pre-supabase/migrations/)

Estos archivos `supabase-*.sql` vivían en la raíz del repo desde antes de
adoptar el patrón `supabase/migrations/<NNN>_*.sql` numerado y aplicado por
cron.

**Estado**: archivados aquí 2026-05-10 (Sprint Pre-Valuation Hardening).
**Aplicación**: NO se aplican automáticamente. Si necesitas re-correr alguno
en otro entorno (staging, fork), ejecútalo manualmente vía Management API o
desde el SQL editor de Supabase Dashboard.

**Por qué no borrarlos**: algunos contienen lógica de negocio (rules de
comisiones, esquemas legales antiguos) que sirven como referencia histórica
o pueden necesitar reaplicación parcial en escenarios de recuperación.

**Por qué no aplicarlos**: el schema actual de producción ya tiene todo lo
necesario (74+ migrations en `../migrations/`). Re-aplicar estos archivos
puede causar conflictos por nombres de tablas/columnas que han evolucionado.

Si vas a archivar definitivamente alguno, mueve a `_archived/`. Si vas a
reaplicar uno, copia su contenido a una migration nueva con número alto
(ej. `099_resurrect_X.sql`).
