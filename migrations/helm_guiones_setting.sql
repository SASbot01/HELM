-- HELM — guiones de setting por DM de Detrás de Cámara y En Forma con Hugo.
--
-- Van a `helm_knowledge` con kind = 'setter', que es el cajón que leen
-- /guion-setting y /continuar-conversacion en el chat (ver api/chat.js). Puestos
-- ahí no son un documento muerto: son el manual de la casa con el que la IA
-- escribe los DMs y decide la siguiente respuesta a un lead.
--
-- Requiere haber aplicado antes migrations/helm_setter.sql, que es donde el
-- check de `kind` aprende el valor 'setter'.
--
-- Idempotente: se busca por título antes de insertar, así que aplicarla dos
-- veces no duplica el guion. Si se edita el guion desde el panel, una segunda
-- pasada NO lo pisa.

do $$
declare
  v_client uuid;
  v_titulo text := 'Guion de setting por DM';
  v_guion  text;
begin
  -- ═════════════════════════════════════════════════════════════════════════
  -- DETRÁS DE CÁMARA — filmmakers
  -- ═════════════════════════════════════════════════════════════════════════
  select id into v_client from clients
   where lower(slug) in ('detras-de-camra', 'detrasdecamara', 'detrasdecamaras', 'detras-de-camara')
      or name ilike '%detr%s de c%mara%'
   order by (lower(slug) = 'detras-de-camra') desc
   limit 1;

  if v_client is null then
    raise notice '[HELM] No encuentro el perfil de Detrás de Cámara: su guion de setting NO se ha creado.';
  elsif exists (select 1 from helm_knowledge
                 where client_id = v_client and kind = 'setter' and title = v_titulo) then
    raise notice '[HELM] Detrás de Cámara ya tiene su guion de setting: no se toca.';
  else
    v_guion := $g$Guion de Setting por DM — Detrás de Cámara

¡Nombre (persona)!

Esperamos respuesta.

¿Qué tal? ¿Cómo va todo?

Esperamos respuesta.

Me alegro! Oye, por curiosidad, ¿tú ahora mismo estás grabando para clientes o todavía estás en la fase de formarte y buscar tus primeros proyectos?

Esperamos respuesta.

Ya graba para clientes: Genial, eso es lo más importante, estar en movimiento. ¿Y estás contento con lo que cobras o sientes que deberías estar facturando más?
Todavía formándose / buscando: Normal, es la fase más dura. Lo importante es tener un sistema claro para no estar dando palos de ciego.

Esperamos respuesta.

¿Y qué dirías que es lo que más se te complica ahora mismo? ¿Captar clientes, saber cuánto cobrar, conseguir estabilidad…?

Esperamos respuesta.

Captar clientes: Eso es justamente lo que más cambia cuando tienes un sistema. Mis alumnos pasaron de esperar a que les llegara algo a tener clientes propios cada mes.
Cobrar más / precios: Totalmente. El problema casi nunca es tu calidad, es cómo presentas y vendes tu servicio. Ahí está la diferencia entre cobrar 100€ y cobrar 3.000€.
Estabilidad: Es lo que más agobia. Un mes bien, otro sin nada. Sin un sistema es imposible predecir ingresos.

¿Piensas igual, Nombre?

Esperamos respuesta.

Mira, tengo un sistema que a mí y a mis alumnos nos ha permitido pasar de cobrar 100€ por trabajo a moverse en 3.000-5.000€/mes con clientes propios, sin depender de ninguna agencia y grabando lo que les gusta.

¿Te parece si le echamos un ojo juntos a tu caso y vemos si te puedo ayudar o darte alguna orientación?

Esperamos respuesta.

Perfecto! Déjame por aquí tu número de teléfono y hablamos ahora.$g$;

    insert into helm_knowledge (client_id, kind, title, content, source)
    values (v_client, 'setter', v_titulo, v_guion, 'guion oficial');
    raise notice '[HELM] Guion de setting creado para Detrás de Cámara.';
  end if;

  -- ═════════════════════════════════════════════════════════════════════════
  -- EN FORMA CON HUGO — fitness
  -- ═════════════════════════════════════════════════════════════════════════
  select id into v_client from clients
   where lower(slug) in ('enformaconhugo', 'en-forma-con-hugo', 'enformaconhugo-vsl')
      or name ilike '%en forma con hugo%'
   order by (lower(slug) = 'enformaconhugo') desc
   limit 1;

  if v_client is null then
    raise notice '[HELM] No encuentro el perfil de En Forma con Hugo: su guion de setting NO se ha creado.';
  elsif exists (select 1 from helm_knowledge
                 where client_id = v_client and kind = 'setter' and title = v_titulo) then
    raise notice '[HELM] En Forma con Hugo ya tiene su guion de setting: no se toca.';
  else
    v_guion := $g$Guion de setting por DM. Se manda mensaje a mensaje, ESPERANDO RESPUESTA entre cada uno. Nunca se sueltan dos seguidos ni se adelanta el siguiente paso.

**1 · Apertura**
¡{Nombre}!

*(Esperamos respuesta.)*

**2 · Romper el hielo**
¿Qué tal, cómo va todo?

*(Esperamos respuesta.)*

**3 · Enganche**
Me alegro, bien también!
Por curiosidad, ¿entrenas en casa o en el gimnasio?

*(Esperamos respuesta.)*

**4 · Se valida lo que sea que haga**
· Casa → Está genial, en casa también se obtienen buenos resultados!
· Gimnasio → Está genial, yo también, al final es lo más completo!

*(Esperamos respuesta.)*

**5 · El objetivo**
¿Y tienes algún objetivo físico que quieras conseguir ahora mismo?

*(Esperamos respuesta.)*

**6 · El problema**
Es un buen objetivo a cumplir!
¿Y qué crees que se te complica más a la hora de conseguirlo?
Tema entrenamientos, alimentación… cuéntame un poco más!

*(Esperamos respuesta.)*

**7 · Se responde a SU problema**
· Alimentación → Estoy seguro de que un buen plan de nutrición te podría servir de mucha ayuda para conseguir tus objetivos!
· Entrenamientos → Lo mismo cambiando "plan de nutrición" por "plan de entrenamientos".

Y se cierra el bloque pidiendo conformidad: ¿Piensas igual que yo, {Nombre}?

*(Esperamos respuesta.)*

**8 · La invitación**
¿Te parece si juntos le echamos un ojo a tu caso y así vemos si realmente te puedo ayudar o dar algunos consejos?

*(Esperamos respuesta.)*

**9 · El cierre**
Simplemente déjame por aquí tu número de teléfono y ahora hablamos!

---

REGLAS DE ESTE GUION
· Un mensaje por turno. Siempre se espera respuesta antes de seguir.
· El nombre de la persona se usa en la apertura y en el punto 7. No más: cansa.
· En los pasos que se bifurcan se elige UNA rama, la que encaje con lo que dijo. Nunca se listan las dos.
· Tono cercano y de tú a tú, como quien entrena y habla de entrenar. Frases cortas.
· No se manda ningún plan, dieta ni precio por DM: el objetivo es el teléfono, nada más.
· Si contesta con evasivas o "mándame info", se devuelve con una pregunta sobre su objetivo y se vuelve al paso donde estábamos.$g$;

    insert into helm_knowledge (client_id, kind, title, content, source)
    values (v_client, 'setter', v_titulo, v_guion, 'guion oficial');
    raise notice '[HELM] Guion de setting creado para En Forma con Hugo.';
  end if;
end $$;
