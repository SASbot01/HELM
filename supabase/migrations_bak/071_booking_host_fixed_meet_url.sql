-- 071: booking_hosts.fixed_meet_url
--
-- Permite que un host tenga un enlace de Google Meet permanente.
-- Cuando está seteado, el flujo de booking NO crea un Meet nuevo en
-- Google Calendar — usa este link como `meeting_url` y lo pone como
-- `location` del evento. Útil para closers que prefieren un room fijo
-- (ej. Toñi en asesorias-suiza).
--
-- NULL ⇒ comportamiento actual (Meet generado por GCal en cada cita).

ALTER TABLE booking_hosts
  ADD COLUMN IF NOT EXISTS fixed_meet_url TEXT;

COMMENT ON COLUMN booking_hosts.fixed_meet_url IS
  'Si está seteado, todas las reuniones con este host usarán este enlace de Meet fijo. NULL = generar Meet por reserva.';
