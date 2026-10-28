// HELM — definición del formulario de onboarding de CONTENIDO.
//
// Declarativo: la vista lo renderiza genéricamente y el generador de memoria
// (knowledge.js) lo recorre para producir los bloques que se inyectan en el
// chat. Para tocar el formulario, se edita aquí y nada más.
//
// Tipos de campo:
//   text   → línea corta
//   long   → párrafo (textarea). Es el tipo por defecto de casi todo.
//   scale  → escala 1-10 con etiquetas en los extremos
//   axis   → una sola opción de una lista (ejes de tono)
//   multi  → varias opciones con tope (`max`)
//   table  → filas repetibles con columnas (`columns`)

export const ONBOARDING_CONTENIDO = {
  key: 'contenido',
  title: 'Onboarding de contenido',
  tagline: 'Para que la IA aprenda tu marca y escriba tu contenido como tú',
  intro:
    'Dos formularios. Rellénalos en orden y con calma. Aquí no hay respuestas ' +
    'correctas: cuanto más honesto y concreto, mejor será tu estrategia y mejor ' +
    'escribirá la IA por ti. Se guarda solo mientras escribes — puedes salir y volver.',
  sections: [
    // ── Datos de partida ─────────────────────────────────────────────────
    {
      key: 'datos',
      part: 'Datos de partida',
      title: 'Datos de partida',
      desc: 'Lo básico para arrancar.',
      fields: [
        { key: 'marca', label: 'Nombre / Marca', type: 'text' },
        { key: 'enlaces', label: 'Web, Instagram, YouTube, TikTok, LinkedIn — pega todos los enlaces que tengas', type: 'long', rows: 3 },
        { key: 'empresa_o_personal', label: '¿Marca personal o empresa? Si es empresa, ¿quién da la cara en cámara?', type: 'long', rows: 2 },
      ],
    },

    // ── FORMULARIO 1 · EL PUNTO CERO ─────────────────────────────────────
    {
      key: 'f1_negocio',
      part: 'F1 · El Punto Cero',
      title: '1 · Tu negocio de un vistazo',
      fields: [
        { key: 'que_haces', label: '1.1 · ¿A qué te dedicas? Explícamelo como si yo no supiera nada de tu sector.', type: 'long' },
        { key: 'tiempo', label: '1.2 · ¿Cuánto tiempo llevas con este negocio / proyecto?', type: 'text' },
        { key: 'equipo', label: '1.3 · ¿Eres tú solo, tienes equipo o es una empresa con varias personas?', type: 'long', rows: 2 },
      ],
    },
    {
      key: 'f1_oferta',
      part: 'F1 · El Punto Cero',
      title: '2 · Oferta y modelo de ingresos',
      desc: 'Esto NO se publica. Lo necesito para saber hacia dónde empuja el contenido.',
      fields: [
        {
          key: 'productos', label: '2.1 · Productos / servicios que vendes', type: 'table',
          addLabel: 'Añadir producto',
          columns: [
            { key: 'nombre', label: 'Producto / Servicio', type: 'text' },
            { key: 'precio', label: 'Precio aprox.', type: 'text' },
            { key: 'estrella', label: '¿Estrella? (Sí/No)', type: 'text' },
          ],
        },
        { key: 'claridad_venta', label: '2.2 · ¿Cómo de claro tienes QUÉ quieres vender principalmente con el contenido?', type: 'scale', minLabel: 'Ni idea', maxLabel: 'Clarísimo' },
        { key: 'facturacion', label: '2.3 · Facturación media mensual aprox. de los últimos 6 meses (un rango, p. ej. "entre 4k y 7k")', type: 'text' },
        { key: 'origen_clientes', label: '2.4 · ¿De dónde vienen hoy la mayoría de tus clientes? (boca a boca, ads, redes, referidos…)', type: 'long', rows: 2 },
        { key: 'pct_organico', label: '2.5 · ¿Qué % aprox. de tus clientes llega HOY gracias a tu contenido orgánico?', type: 'text' },
      ],
    },
    {
      key: 'f1_redes',
      part: 'F1 · El Punto Cero',
      title: '3 · Tu situación en redes hoy',
      fields: [
        {
          key: 'redes', label: 'Plataformas que usas (números aproximados)', type: 'table',
          addLabel: 'Añadir plataforma',
          columns: [
            { key: 'plataforma', label: 'Plataforma', type: 'text' },
            { key: 'seguidores', label: 'Seguidores', type: 'text' },
            { key: 'frecuencia', label: 'Frecuencia', type: 'text' },
            { key: 'mejor', label: 'Mejor pieza (link/tema)', type: 'text' },
          ],
        },
        { key: 'mejores_piezas', label: '3.1 · ¿Qué piezas tuyas han funcionado MEJOR? Pega el link y por qué crees que funcionó (máx. 5).', type: 'long' },
        { key: 'pieza_fallida', label: '3.2 · ¿Qué pieza creías que iba a petarlo y no funcionó? ¿Por qué crees que falló?', type: 'long', rows: 2 },
        { key: 'camara', label: '3.3 · ¿Cómo de cómodo te sientes delante de la cámara?', type: 'scale', minLabel: 'Lo paso fatal', maxLabel: 'Fluyo' },
        { key: 'constancia', label: '3.4 · ¿Cómo de constante eres publicando?', type: 'scale', minLabel: 'Cuando me acuerdo', maxLabel: 'Como un reloj' },
        { key: 'sostenible', label: '3.5 · ¿Cómo de sostenible te resulta mantener el ritmo?', type: 'scale', minLabel: 'Me cuesta', maxLabel: 'Muy sostenible' },
      ],
    },
    {
      key: 'f1_objetivos',
      part: 'F1 · El Punto Cero',
      title: '4 · Punto de partida y objetivos',
      fields: [
        { key: 'problemas_objetivos', label: '4.1 · Máx. 3 problemas OBJETIVOS de tu contenido/negocio hoy (medibles: "no convierto", "poco alcance"…).', type: 'long' },
        { key: 'problemas_subjetivos', label: '4.2 · Máx. 3 problemas SUBJETIVOS (a qué crees que se debe, cómo te SIENTES con ello).', type: 'long' },
        { key: 'objetivo_6m', label: '4.3 · Si en 6 meses esto hubiera funcionado, ¿qué habría pasado EXACTAMENTE? Concreto y medible.', type: 'long' },
        { key: 'numero_clave', label: '4.4 · ¿Qué número, si lo movieras, te cambiaría el negocio? (ventas, leads, llamadas agendadas…)', type: 'long', rows: 2 },
        { key: 'hitos', label: '4.5 · ¿Hay alguna fecha o hito importante en los próximos meses? (lanzamiento, evento, temporada alta…)', type: 'long', rows: 2 },
      ],
    },
    {
      key: 'f1_competencia',
      part: 'F1 · El Punto Cero',
      title: '5 · Competencia y referentes',
      desc: 'Esta sección es oro — dedícale tiempo. No hace falta que sean de tu ciudad ni tamaño.',
      fields: [
        {
          key: 'competencia', label: '5.1 · Competencia directa (mismo cliente que tú)', type: 'table',
          addLabel: 'Añadir competidor',
          columns: [
            { key: 'nombre', label: 'Nombre / Marca', type: 'text' },
            { key: 'plataforma', label: 'Plataforma + @', type: 'text' },
            { key: 'bien', label: '¿Qué hacen BIEN?', type: 'text' },
            { key: 'mal', label: '¿Qué hacen MAL o les falta?', type: 'text' },
          ],
        },
        {
          key: 'referentes', label: '5.2 · Referentes que admiras (aunque sean de otro sector)', type: 'table',
          addLabel: 'Añadir referente',
          columns: [
            { key: 'nombre', label: 'Nombre / @', type: 'text' },
            { key: 'gusta', label: '¿Qué te gusta de ellos?', type: 'text' },
          ],
        },
        { key: 'anti_referente', label: '5.3 · ¿Alguien de tu sector al que NO quieras parecerte ni en pintura? ¿Por qué?', type: 'long', rows: 2 },
      ],
    },

    // ── FORMULARIO 2 · LA PROFUNDIDAD ────────────────────────────────────
    {
      key: 'f2_quien_eres',
      part: 'F2 · La Profundidad',
      title: 'A.1 · Quién eres de verdad',
      desc: 'Escribe como hablas. Frases reales, anécdotas, opiniones fuertes. Nada de LinkedIn-perfecto.',
      fields: [
        { key: 'a1_amigo', label: 'A1 · Si un amigo tuyo me describiera en 3 frases (tú como persona, no tu CV), ¿qué diría?', type: 'long' },
        { key: 'a2_quicio', label: 'A2 · ¿Qué cosas te sacan de quicio de tu propio sector? Despáchate a gusto.', type: 'long' },
        { key: 'a3_tres_horas', label: 'A3 · ¿De qué tema podrías hablar 3 horas sin guion y sin aburrirte?', type: 'long', rows: 2 },
        { key: 'a4_pereza', label: 'A4 · ¿Qué temas te dan pereza o te aburren aunque "se supone" que deberías tratarlos?', type: 'long', rows: 2 },
        { key: 'a5_esconder', label: 'A5 · ¿Algo de ti que esconderías profesionalmente pero que en el fondo te define? (hobby raro, pasado, manía…)', type: 'long', rows: 2 },
      ],
    },
    {
      key: 'f2_historia',
      part: 'F2 · La Profundidad',
      title: 'A.2 · Tu historia (3 actos)',
      desc: 'No me cuentes la versión bonita. Cuéntame la real.',
      fields: [
        { key: 'a6_antes', label: 'A6 · ANTES: ¿cuál era tu situación o el problema que vivías antes de llegar a lo que haces hoy?', type: 'long' },
        { key: 'a7_giro', label: 'A7 · EL GIRO: ¿qué pasó? ¿Qué decisión, descubrimiento o momento te cambió el rumbo?', type: 'long' },
        { key: 'a8_despues', label: 'A8 · DESPUÉS: ¿en qué eres distinto hoy? ¿Qué conseguiste o entendiste que antes no?', type: 'long' },
      ],
    },
    {
      key: 'f2_tono',
      part: 'F2 · La Profundidad',
      title: 'A.3 · Tu tono y tu ADN',
      desc: 'Marca tu posición en cada eje. Donde dudes, es normal — lo afinamos.',
      fields: [
        { key: 'eje_energia', label: 'Energía', type: 'axis', options: ['Baja / calmada', 'Media', 'Alta / intensa'] },
        { key: 'eje_humor', label: 'Humor', type: 'axis', options: ['Serio', 'Irónico / fino', 'Gracioso abierto', 'Canalla / sin filtro'] },
        { key: 'eje_vocabulario', label: 'Vocabulario', type: 'axis', options: ['Técnico / preciso', 'Medio', 'Coloquial / de la calle'] },
        { key: 'eje_ritmo', label: 'Ritmo', type: 'axis', options: ['Pausado / reflexivo', 'Medio', 'Rápido / directo'] },
        { key: 'a9_muletillas', label: 'A9 · ¿Palabras, expresiones o muletillas MUY tuyas? Apúntalas tal cual — construyen tu lenguaje de marca.', type: 'long', rows: 2 },
        { key: 'a10_falso', label: 'A10 · ¿Qué tono te haría sentir FALSO si te obligo a usarlo? (para no ir nunca por ahí)', type: 'long', rows: 2 },
      ],
    },
    {
      key: 'f2_autoridad',
      part: 'F2 · La Profundidad',
      title: 'A.4 · Autoridad — por qué deberían escucharte',
      fields: [
        { key: 'a11_hecho', label: 'A11 · ¿Qué has hecho de verdad? (resultados, años, casos, clientes, cifras, proyectos reales)', type: 'long' },
        { key: 'a12_sabes', label: 'A12 · ¿Qué sabes tú que la mayoría de tu sector NO sabe o hace mal?', type: 'long' },
        { key: 'a13_pruebas', label: 'A13 · ¿Qué pruebas visibles tienes? (testimonios, antes/después, medios, números, logos)', type: 'long', rows: 2 },
      ],
    },
    {
      key: 'f2_stance',
      part: 'F2 · La Profundidad',
      title: 'B.1 · Tu postura (stance)',
      fields: [
        { key: 'b1_creo', label: 'B1 · "Yo creo que en mi sector la gente debería ______, y casi nadie lo hace."', type: 'long', rows: 2 },
        { key: 'b2_incomoda', label: 'B2 · ¿Esa opinión tuya que sabes que incomoda a otros pero defiendes igual?', type: 'long', rows: 2 },
        { key: 'b3_consejo', label: 'B3 · ¿Qué consejo das siempre a tus clientes y casi ninguno aplica de verdad?', type: 'long', rows: 2 },
        { key: 'b4_stance', label: 'B4 · Resume tu STANCE en UNA frase: "Ayudo a [quién] a conseguir [qué] sin [el dolor habitual]."', type: 'long', rows: 2 },
      ],
    },
    {
      key: 'f2_mensaje',
      part: 'F2 · La Profundidad',
      title: 'B.2 – B.4 · Mensaje y percepción',
      fields: [
        { key: 'b5_quemados', label: 'B5 · ¿Qué mensajes/frases están ya MUY quemados en tu sector y no quieres repetir ni de broma?', type: 'long' },
        { key: 'b6_nadie_dice', label: 'B6 · ¿Qué dirías o darías importancia TÚ que casi nadie está diciendo en tu sector?', type: 'long' },
        { key: 'b_arquetipo', label: 'Arquetipo — ¿cómo quieres que te perciban? (marca los 2 que más encajen)', type: 'multi', max: 2, options: [
          'El SABIO / experto que explica y educa',
          'El CREADOR / innovador que muestra una forma nueva',
          'El GUÍA / mentor cercano que acompaña',
          'El RETADOR / forajido que rompe lo establecido',
          'El HÉROE / motivador que empuja a la acción',
          'El CERCANO / cotidiano, sentido común y empatía',
        ] },
        { key: 'b7_frase', label: 'B7 · ¿Qué frase querrías que dijera alguien sobre ti tras ver tu contenido un mes?', type: 'long', rows: 2 },
        { key: 'b8_idea', label: 'B8 · Si tu marca solo pudiera dejar UNA idea grabada en la cabeza de la gente, ¿cuál sería?', type: 'long', rows: 2 },
        { key: 'b9_subideas', label: 'B9 · 2-3 "sub-ideas" o temas que defiendes una y otra vez (las creencias que más combates).', type: 'long' },
      ],
    },
    {
      key: 'f2_negocio',
      part: 'F2 · La Profundidad',
      title: 'C · Modelo de negocio en profundidad',
      fields: [
        { key: 'c1_inversor', label: 'C1 · Explícame tu negocio como si fuera a invertir: qué problema resuelves, cómo y por qué funciona.', type: 'long' },
        { key: 'c2_transformacion', label: 'C2 · ¿Cuál es exactamente la transformación de un cliente contigo? Del punto A (cómo llega) al B (cómo sale).', type: 'long' },
        { key: 'c3_por_que_ti', label: 'C3 · ¿Por qué te eligen a TI y no a la competencia o a hacerlo solos? Sé honesto.', type: 'long' },
        { key: 'c4_metodo', label: 'C4 · ¿Tienes un método/sistema con nombre? Descríbelo en pasos. Si no, dime los pasos por los que llevas a un cliente.', type: 'long' },
        { key: 'c5_objecion', label: 'C5 · ¿La objeción nº1 antes de comprarte? ¿Cómo la rebates hoy?', type: 'long', rows: 2 },
        { key: 'c6_mal_cliente', label: 'C6 · ¿Qué hace que un cliente NO sea bueno para ti? (a quién NO quieres atraer)', type: 'long', rows: 2 },
        { key: 'c7_camino', label: 'C7 · El camino desde que alguien te descubre hasta que te paga (los pasos, aunque sea aprox.).', type: 'long' },
      ],
    },
    {
      key: 'f2_avatar',
      part: 'F2 · La Profundidad',
      title: 'D · Tu cliente ideal (avatar)',
      desc: 'Si te diriges a varios tipos, sepáralos con un guion "-" e indica cuál es el PRINCIPAL.',
      fields: [
        { key: 'd0_nombre', label: 'D0 · Ponle nombre y etiqueta (ej: "Marta, dueña de gestoría saturada, 42"). ¿Principal o secundario?', type: 'long', rows: 2 },
        { key: 'd1_quien', label: 'D1 · Edad, ocupación, momento vital y nivel económico aproximado.', type: 'long', rows: 2 },
        { key: 'd2_dia', label: 'D2 · ¿Cómo es su día a día? ¿Qué le ocupa la cabeza, qué le agota?', type: 'long' },
        { key: 'd3_dolor', label: 'D3 · ¿Qué problema le quita el sueño de verdad, relacionado con lo que tú resuelves?', type: 'long' },
        { key: 'd4_intentado', label: 'D4 · ¿Qué ha intentado YA para resolverlo y no le ha funcionado? ¿Por qué falló?', type: 'long' },
        { key: 'd5_consecuencias', label: 'D5 · ¿Qué le pasa si NO resuelve esto? Consecuencias reales, emocionales y prácticas.', type: 'long' },
        { key: 'd6_voz_interior', label: 'D6 · ¿Qué se dice a sí mismo sobre este problema? Frases textuales si puedes — son ganchos directos.', type: 'long' },
        { key: 'd7_deseo', label: 'D7 · ¿Qué quiere conseguir de verdad? ¿Y qué significaría para él/ella lograrlo, más allá de lo material?', type: 'long' },
        { key: 'd8_confianza', label: 'D8 · ¿Qué le daría confianza inmediata en ti? ¿Y qué le haría desconfiar al instante?', type: 'long', rows: 2 },
        { key: 'd9_objeciones', label: 'D9 · ¿Qué objeciones pone antes de pagar? Lista todas las que puedas.', type: 'long' },
      ],
    },
    {
      key: 'f2_mina',
      part: 'F2 · La Profundidad',
      title: 'E · Mina de contenido',
      desc: 'El bloque más importante. No pienses en "hacer contenido": cuéntame cosas reales, a chorro, sin filtrar. Cantidad antes que perfección.',
      fields: [
        { key: 'e1_preguntas', label: 'E1 · Las máx. 5 preguntas que MÁS te repiten tus clientes o tu entorno.', type: 'long' },
        { key: 'e2_errores', label: 'E2 · 5 errores típicos que ves cometer a la gente en tu campo una y otra vez.', type: 'long' },
        { key: 'e3_mitos', label: 'E3 · 5 mitos o creencias falsas que tu sector da por ciertas y tú sabes que no.', type: 'long' },
        { key: 'e4_historias', label: 'E4 · 3 historias de clientes (sin nombres) con transformación clara: cómo llegaron y cómo acabaron.', type: 'long' },
        { key: 'e5_hacia_mal', label: 'E5 · 3 cosas que hacías mal al principio y ahora harías totalmente distinto.', type: 'long' },
        { key: 'e6_reciente', label: 'E6 · Algo que te haya pasado RECIENTEMENTE con un cliente o en tu trabajo que daría buen contenido.', type: 'long' },
        { key: 'e7_polemica', label: 'E7 · Una opinión tuya con la que sabes que MUCHA gente no estará de acuerdo.', type: 'long', rows: 2 },
        { key: 'e8_verdades', label: 'E8 · 3 "verdades incómodas" que tu cliente ideal necesita oír aunque no le guste.', type: 'long' },
        { key: 'e9_notas', label: 'E9 · ¿Tienes notas, capturas, mensajes de clientes, audios o ideas sueltas guardadas? ¿Dónde y de qué van?', type: 'long', rows: 2 },
        { key: 'e10_no_atreves', label: 'E10 · ¿Algún tema que te MUERES por tratar pero no te has atrevido? ¿Qué te frena?', type: 'long', rows: 2 },
      ],
    },
  ],
}

// ¿Se ve esta sección o este campo con las respuestas dadas hasta ahora?
// Sin `show` se ve siempre, que es el caso del onboarding de contenido.
export const seVe = (item, answers) => !item.show || item.show(answers)

// Campos visibles de un esquema, ya aplanados y con la ramificación resuelta.
export function camposVisibles(schema, answers) {
  const out = []
  for (const section of schema.sections) {
    if (!seVe(section, answers)) continue
    for (const field of section.fields) {
      if (seVe(field, answers)) out.push(field)
    }
  }
  return out
}

// Cuenta de campos rellenados vs total, para la barra de progreso. Solo cuenta
// lo VISIBLE: si a alguien que vende servicios no se le pregunta por stock, esas
// preguntas no pueden contar como pendientes ni dejar la barra clavada al 70 %.
export function countAnswered(schema, answers) {
  const campos = camposVisibles(schema, answers)
  return {
    total: campos.length,
    done: campos.filter(f => isAnswered(f, answers[f.key])).length,
  }
}

export function isAnswered(field, value) {
  if (value == null) return false
  if (field.type === 'multi') return Array.isArray(value) && value.length > 0
  if (field.type === 'table') {
    return Array.isArray(value) && value.some(row => Object.values(row || {}).some(v => String(v || '').trim()))
  }
  return String(value).trim().length > 0
}
