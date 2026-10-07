-- HELM — Contenido: la casilla de «grabado».
--
-- El calendario ya sabe en qué punto está cada pieza (`status`: sin hacer, en
-- proceso, hecho). Lo que no sabía es si el material EXISTE: si el vídeo ya se
-- grabó, aunque esté sin montar. Son dos preguntas distintas y en el día a día
-- se hacen por separado: el que graba marca «ya está grabado» y sigue con la
-- siguiente; el que edita mira el estado. Una pieza puede estar grabada y en
-- «sin hacer» (grabada de un tirón, sin montar) o en «hecho» sin grabar (un
-- email, una nota: no hay nada que grabar).
--
-- Por eso es una columna aparte y no un estado más: meter «grabado» en la
-- escalera de estados obligaría a elegir entre «grabado» y «en proceso» cuando
-- lo normal es que sean las dos cosas a la vez.
--
-- `grabado_at` guarda cuándo se marcó, para poder decir «grabada el 3 de
-- septiembre» en la ficha y, más adelante, medir el ritmo de grabación.
alter table helm_content_calendar
  add column if not exists grabado boolean not null default false,
  add column if not exists grabado_at timestamptz;

comment on column helm_content_calendar.grabado is
  'Si el material de la pieza ya existe (está grabado). Independiente de `status`: '
  'status dice en qué punto está la producción; grabado dice si hay material. '
  'Una pieza puede estar grabada y sin montar.';

comment on column helm_content_calendar.grabado_at is
  'Cuándo se marcó como grabada. Null si no lo está (se vacía al desmarcar).';
