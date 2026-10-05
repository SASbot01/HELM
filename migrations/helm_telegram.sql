-- HELM — Telegram: la misma conversación desde el móvil.
--
-- El bot de Telegram de un perfil (api/telegram.js) habla con el mismo motor
-- que el chat web y guarda los turnos en `helm_chat_messages`, así que el
-- hilo es UNO: lo que se pide por Telegram aparece en el panel y al revés.
-- Lo único que faltaba era saber desde dónde llegó cada mensaje, para poder
-- enseñarlo (y filtrarlo) sin adivinar.
--
-- La config del bot (token, secreto del webhook, chats autorizados) NO va
-- aquí: vive en `user_integrations` con service = 'telegram', como Calendly o
-- la clave de Claude, fuera del alcance del rol anónimo.
--
-- Aplicar en Supabase → SQL Editor. Se puede ejecutar varias veces.

-- ── Origen del mensaje ─────────────────────────────────────────────────────
-- 'web' es el chat del panel (lo de siempre, por eso es el valor por defecto
-- y lo que reciben las filas que ya existían); 'telegram', el bot.
alter table helm_chat_messages
  add column if not exists source text not null default 'web';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'helm_chat_messages'::regclass
       and conname = 'helm_chat_messages_source_check'
  ) then
    alter table helm_chat_messages
      add constraint helm_chat_messages_source_check
      check (source in ('web', 'telegram'));
  end if;
end $$;

comment on column helm_chat_messages.source is
  'Desde dónde llegó el mensaje: web (chat del panel) o telegram (bot del perfil).';

-- RLS: la tabla ya tiene la política allow-all de migrations/helm_chat.sql
-- (el acceso real se controla en la app, que entra con la anon key). Una
-- columna nueva no cambia nada de eso; se deja constancia para que nadie la
-- busque aquí.
