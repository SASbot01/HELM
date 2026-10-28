// HELM — Onboarding Operativo Profundo.
//
// El formulario largo: 149 preguntas para radiografiar una operativa entera.
// Se usa DESPUÉS de la venta o dentro de una auditoría pagada, nunca en frío —
// para frío está el diagnóstico de /primermap, que son 32.
//
// Neutro por diseño: sirve igual a una consultora, un fabricante, una escuela
// online o un SaaS. Lo que cambia entre unos y otros no es el cuestionario
// entero, es el bloque de ENTREGA (5A–5D) y unos pocos condicionales sueltos.
// Cada perfil acaba viendo entre 95 y 115 preguntas; el resto se descartan
// solas.
//
// Las cinco ramas:
//   A · Producto físico            p8 = fisico      → bloque 5A
//   B · Producto digital           p8 = digital     → bloque 5B
//   C · Servicios                  p8 = servicios   → bloque 5C
//   D · Suscripción o SaaS         p8 = suscripcion → bloque 5D
//   E · Venta consultiva           p54 ≠ autoservicio → transversal
//
// `show(a)` recibe TODAS las respuestas y decide si el campo aparece. Las
// secciones también pueden llevarlo: si una sección entera no aplica, no se
// pinta ni cuenta para el progreso.

// Las que ya se responden en el diagnóstico web van marcadas con `web: true`.
// La vista las señala para que quien lo rellena sepa que solo confirma.
const web = true

const es = (campo, ...valores) => (a) => valores.includes(a?.[campo])
const noEs = (campo, ...valores) => (a) => a?.[campo] && !valores.includes(a[campo])

export const ONBOARDING_OPERATIVO = {
  key: 'operativo',
  title: 'Onboarding operativo profundo',
  tagline: 'La radiografía completa de cómo funciona tu negocio por dentro',
  intro:
    'Unas 100 preguntas, entre 40 y 60 minutos. No hace falta hacerlo de una '
    + 'sentada: se guarda solo mientras escribes y puedes salir y volver. '
    + 'Muchas se descartan solas según lo que respondas — a quien vende '
    + 'servicios no se le pregunta por stock. Las marcadas como «ya respondida» '
    + 'vienen del diagnóstico: solo confírmalas. '
    + 'La última pregunta es la más valiosa de todas; déjale tiempo.',

  sections: [
    // ══ BLOQUE 0 · IDENTIFICACIÓN ═════════════════════════════════════════
    {
      key: 'b0', part: 'Bloque 0 · Identificación', title: 'Quiénes sois',
      fields: [
        { key: 'p1_quien', label: '1 · Nombre y cargo', type: 'text', web },
        { key: 'p2_marca', label: '2 · Nombre comercial y web', type: 'text' },
        { key: 'p3_contacto', label: '3 · Email y teléfono directo', type: 'text' },
        { key: 'p4_fundacion', label: '4 · Año de fundación', type: 'text' },
        { key: 'p5_geo', label: '5 · ¿Desde dónde trabajáis y a qué países vendéis?', type: 'long', rows: 2 },
        { key: 'p6_equipo', label: '6 · Personas trabajando hoy, incluyendo freelance y agencias', type: 'axis', web,
          options: ['Solo yo', '2–5', '6–15', '16–50', 'Más de 50'] },
        { key: 'p7_socios', label: '7 · ¿Hay socios? ¿Cómo se reparten las decisiones?', type: 'long', rows: 3 },
      ],
    },

    // ══ BLOQUE 1 · MODELO DE NEGOCIO ══════════════════════════════════════
    {
      key: 'b1', part: 'Bloque 1 · Modelo de negocio', title: 'Qué vendes y a quién',
      desc: 'La pregunta 8 es el eje: define qué bloque de entrega verás más adelante.',
      fields: [
        { key: 'p8_vende', label: '8 · Qué vendes principalmente', type: 'axis', web,
          hint: 'Esta respuesta activa la rama del bloque de entrega.',
          options: ['Producto físico', 'Producto digital o formación', 'Servicios', 'Suscripción o membresía', 'Software / SaaS'] },
        { key: 'p9_secundario', label: '9 · ¿Vendes algo más de forma secundaria?', type: 'multi',
          options: ['Físico', 'Digital', 'Servicios', 'Suscripción', 'Software', 'Nada más'] },
        { key: 'p10_describe', label: '10 · Describe en 3–4 frases qué vendes y a quién', type: 'long' },
        { key: 'p11_mercado', label: '11 · Mercado', type: 'axis', web, options: ['B2C', 'B2B', 'Ambos'] },
        { key: 'p12_ofertas', label: '12 · ¿Cuántas ofertas o servicios distintos tienes activos?', type: 'axis',
          options: ['1', '2–5', '6–20', '21–100', 'Más de 100'] },
        { key: 'p13_top', label: '13 · Cuál es la oferta que más factura', type: 'text' },
        { key: 'p14_precios', label: '14 · Precio de la oferta más barata y de la más cara', type: 'text' },
        { key: 'p15_ingreso', label: '15 · Tipo de ingreso', type: 'axis',
          options: ['Pago único', 'Recurrente', 'Proyecto cerrado', 'Mixto'] },
        { key: 'p16_recurrente', label: '16 · ¿Hay algún ingreso recurrente hoy?', type: 'axis',
          options: ['Sí, es la mayor parte', 'Sí, una parte pequeña', 'Lo estamos montando', 'No'] },
        { key: 'p17_canales_venta', label: '17 · Canales por los que se cierra la venta', type: 'multi',
          options: ['Web propia', 'Llamada o reunión', 'WhatsApp o DM', 'Marketplace o directorio', 'Email', 'Presencial', 'Partner o intermediario'] },
        { key: 'p18_reparto', label: '18 · Reparto aproximado de facturación por canal', type: 'long', rows: 3 },
        { key: 'p19_upsell', label: '19 · ¿Ofrecéis algo más en el momento de comprar?', type: 'axis', web,
          options: ['Sí y lo optimizamos', 'Sí, algo básico', 'Lo quitamos', 'No'] },
      ],
    },

    // ══ BLOQUE 2 · NÚMEROS ════════════════════════════════════════════════
    {
      key: 'b2', part: 'Bloque 2 · Números', title: 'Los números de verdad',
      desc: 'Aproximados valen. Lo que importa es el orden de magnitud.',
      fields: [
        { key: 'p20_factura', label: '20 · Facturación últimos 12 meses', type: 'axis', web,
          options: ['Menos de 100k €', '100–300k €', '300–700k €', '700k–2M €', '2–10M €', 'Más de 10M €'] },
        { key: 'p21_media3m', label: '21 · Facturación media de los últimos 3 meses', type: 'text' },
        { key: 'p22_tendencia', label: '22 · Tendencia frente al año pasado', type: 'axis', web,
          options: ['Creciendo fuerte', 'Despacio', 'Plano', 'Cayendo'] },
        { key: 'p23_meses', label: '23 · Mes mejor y mes peor del último año', type: 'text' },
        { key: 'p24_estacional', label: '24 · ¿Hay estacionalidad marcada?', type: 'axis',
          options: ['Sí, mucha', 'Algo', 'Nada'] },
        { key: 'p25_ticket', label: '25 · Ticket medio', type: 'axis', web,
          options: ['Menos de 50 €', '50–200 €', '200–1.000 €', '1.000–5.000 €', 'Más de 5.000 €'] },
        { key: 'p26_ventas', label: '26 · Ventas o clientes nuevos al mes', type: 'axis', web,
          options: ['Menos de 10', '10–50', '50–250', '250–1.000', 'Más de 1.000'] },
        { key: 'p27_margen', label: '27 · Margen bruto medio', type: 'axis', web,
          options: ['Menos del 20 %', '20–40 %', '40–60 %', '60–80 %', 'Más del 80 %'] },
        { key: 'p28_costehora', label: '28 · Coste medio por hora de una persona del equipo', type: 'axis', web,
          options: ['Menos de 15 €', '15–25 €', '25–40 €', '40–70 €', 'Más de 70 €'] },
        { key: 'p29_cac', label: '29 · ¿Conocéis el coste de captar un cliente?', type: 'axis', web,
          options: ['Sí, semanal', 'Aproximado', 'No'] },
        { key: 'p30_ltv', label: '30 · ¿Y lo que deja un cliente en total?', type: 'axis', web,
          options: ['Sí, calculado', 'Aproximado', 'No'] },
        { key: 'p31_payback', label: '31 · ¿Cuánto tarda un cliente en amortizar lo que costó captarlo?', type: 'axis',
          options: ['En la primera venta', '1–3 meses', '3–12 meses', 'No lo sabemos'] },
        { key: 'p32_recompra', label: '32 · Tasa de recompra o renovación a 12 meses', type: 'axis',
          options: ['Menos del 10 %', '10–25 %', '25–50 %', 'Más del 50 %', 'No lo medimos'] },
        { key: 'p33_confianza', label: '33 · Confianza en los datos de tus informes', type: 'scale', web,
          minLabel: 'No me fío nada', maxLabel: 'Son mi fuente de verdad' },
        { key: 'p34_metrica', label: '34 · ¿Qué métrica miras nada más levantarte?', type: 'text' },
      ],
    },

    // ══ BLOQUE 3 · CAPTACIÓN ══════════════════════════════════════════════
    {
      key: 'b3', part: 'Bloque 3 · Captación', title: 'De dónde sale la gente',
      fields: [
        { key: 'p35_canales', label: '35 · Fuentes de tráfico y contactos', type: 'multi', web,
          options: ['Meta Ads', 'Google Ads', 'TikTok Ads', 'SEO y contenido', 'Email', 'Orgánico en redes',
            'Afiliados o influencers', 'Referidos y boca a boca', 'Prospección en frío', 'Marketplaces o directorios'] },
        { key: 'p36_rentable', label: '36 · ¿Cuál de ellas es hoy la más rentable?', type: 'text' },
        { key: 'p37_dependencia', label: '37 · ¿Y cuál te preocupa más por dependencia?', type: 'text' },
        { key: 'p38_adspend', label: '38 · Inversión publicitaria mensual', type: 'axis', web,
          show: (a) => ['Meta Ads', 'Google Ads', 'TikTok Ads'].some(c => (a.p35_canales || []).includes(c)),
          options: ['Menos de 2.000 €', '2.000–10.000 €', '10.000–50.000 €', 'Más de 50.000 €'] },
        { key: 'p39_roas', label: '39 · ROAS o CPL medio de los últimos 90 días', type: 'text',
          hint: 'Si no lo medís, escríbelo tal cual: es un dato en sí mismo.',
          show: (a) => ['Meta Ads', 'Google Ads', 'TikTok Ads'].some(c => (a.p35_canales || []).includes(c)) },
        { key: 'p40_quien_ads', label: '40 · ¿Quién gestiona la publicidad?', type: 'axis',
          show: (a) => ['Meta Ads', 'Google Ads', 'TikTok Ads'].some(c => (a.p35_canales || []).includes(c)),
          options: ['Interno', 'Agencia', 'Freelance', 'Yo'] },
        { key: 'p41_contenido', label: '41 · ¿Cuánto contenido nuevo producís al mes?', type: 'axis',
          options: ['0–5 piezas', '6–20', '21–50', 'Más de 50'] },
        { key: 'p42_atasco', label: '42 · ¿Dónde se atasca la producción de contenido?', type: 'axis',
          options: ['Ideas', 'Producción', 'Edición', 'Aprobación interna', 'No se atasca'] },
        { key: 'p43_outbound', label: '43 · ¿Tenéis prospección en frío activa?', type: 'axis',
          options: ['Sí, sistematizada', 'Sí, manual y a ratos', 'Lo intentamos sin éxito', 'No'] },
        { key: 'p44_outbound_como', label: '44 · Herramientas y volumen mensual de envíos', type: 'long', rows: 2,
          show: (a) => ['Sí, sistematizada', 'Sí, manual y a ratos'].includes(a.p43_outbound) },
        { key: 'p45_referidos', label: '45 · ¿Programa de referidos o partners?', type: 'axis',
          options: ['Sí, formalizado', 'Informal', 'Lo queremos montar', 'No'] },
        { key: 'p46_leads', label: '46 · Contactos nuevos al mes', type: 'axis', web,
          options: ['Menos de 20', '20–100', '100–500', '500–2.000', 'Más de 2.000'] },
        { key: 'p47_entrada', label: '47 · ¿Cómo entran esos contactos al sistema?', type: 'axis',
          options: ['Integración automática', 'Formulario conectado', 'Alguien los mete a mano', 'No entran a ningún sitio'] },
        { key: 'p48_respuesta', label: '48 · Tiempo medio hasta el primer contacto', type: 'axis', web,
          options: ['Menos de 5 min, automático', 'Menos de 1 h', 'Mismo día', '1–3 días', 'A veces se nos pasan'] },
        { key: 'p49_quien_responde', label: '49 · ¿Ese primer contacto lo hace una persona o un sistema?', type: 'axis',
          options: ['Sistema', 'Persona', 'Mezcla'] },
        { key: 'p50_prioridad', label: '50 · ¿Hay criterio para saber qué contacto merece atención primero?', type: 'axis',
          options: ['Sí, puntuación automática', 'Criterio informal', 'No'] },
      ],
    },

    // ══ BLOQUE 4 · VENTA ══════════════════════════════════════════════════
    {
      key: 'b4', part: 'Bloque 4 · Venta', title: 'Cómo se cierra',
      fields: [
        { key: 'p51_recorrido', label: '51 · Describe paso a paso el recorrido desde que te descubren hasta que pagan', type: 'long', rows: 5 },
        { key: 'p52_conv', label: '52 · De cada 100 contactos, cuántos compran', type: 'axis', web,
          options: ['Menos de 5', '5–15', '15–30', 'Más de 30', 'No lo medimos'] },
        { key: 'p53_ciclo', label: '53 · ¿Cuánto tarda de media en cerrarse una venta?', type: 'axis',
          options: ['Mismo día', 'Menos de una semana', '1–4 semanas', '1–3 meses', 'Más de 3 meses'] },
        { key: 'p54_llamada', label: '54 · ¿Hay conversación de venta antes de cobrar?', type: 'axis', web,
          options: ['Siempre', 'No, se compra solo', 'Depende'] },

        // ── Rama E · venta consultiva ──────────────────────────────────────
        { key: 'p55_noshow', label: '55 · ¿Cuántas reuniones de venta se caen?', type: 'axis', web,
          show: noEs('p54_llamada', 'No, se compra solo'),
          options: ['Menos del 10 %', '10–25 %', '25–40 %', 'Más del 40 %', 'No lo medimos'] },
        { key: 'p56_agenda', label: '56 · ¿Cómo se agenda esa reunión?', type: 'axis', web,
          show: noEs('p54_llamada', 'No, se compra solo'),
          options: ['Calendario automático con recordatorios', 'Automático sin recordatorios', 'A mano por mensajes'] },
        { key: 'p57_quien_vende', label: '57 · ¿Quién hace las reuniones y cuántas al mes cada uno?', type: 'long', rows: 3,
          show: noEs('p54_llamada', 'No, se compra solo') },
        { key: 'p58_guion', label: '58 · ¿Hay guion o estructura común?', type: 'axis',
          show: noEs('p54_llamada', 'No, se compra solo'),
          options: ['Sí, documentado', 'Cada uno el suyo', 'No'] },
        { key: 'p59_graban', label: '59 · ¿Se graban y se revisan?', type: 'axis',
          show: noEs('p54_llamada', 'No, se compra solo'),
          options: ['Sí, con análisis', 'Se graban pero nadie las ve', 'No'] },

        // ── Autoservicio ───────────────────────────────────────────────────
        { key: 'p60_abandono', label: '60 · ¿Recuperáis a quien se queda a medias en el pago?', type: 'axis', web,
          show: noEs('p54_llamada', 'Siempre'),
          options: ['Sí, secuencia automática', 'Hay algo pero no lo tocamos', 'A mano cuando podemos', 'No'] },
        { key: 'p61_checkout', label: '61 · Conversión de la página de pago', type: 'axis',
          show: noEs('p54_llamada', 'Siempre'),
          options: ['Menos del 20 %', '20–40 %', '40–60 %', 'Más del 60 %', 'No lo medimos'] },

        { key: 'p62_seguimiento', label: '62 · ¿Cuántos seguimientos recibe alguien que no compra?', type: 'axis', web,
          options: ['5 o más, con secuencia', 'Entre 2 y 4', 'Una vez y ya', 'Ninguno'] },
        { key: 'p63_precio', label: '63 · ¿Quién decide el precio y cuánta negociación hay?', type: 'axis',
          options: ['Precio fijo público', 'Fijo pero se negocia', 'A medida siempre', 'Depende del cliente'] },
        { key: 'p64_propuestas', label: '64 · ¿Cómo se preparan las propuestas o presupuestos?', type: 'axis', web,
          show: (a) => a.p8_vende === 'Servicios' || a.p11_mercado !== 'B2C',
          options: ['Se generan solas', 'Plantilla a mano', 'Desde cero cada una', 'No hacemos propuesta formal'] },
        { key: 'p65_tiempo_prop', label: '65 · ¿Cuánto tiempo lleva preparar una propuesta?', type: 'axis',
          show: (a) => (a.p8_vende === 'Servicios' || a.p11_mercado !== 'B2C') && a.p64_propuestas !== 'No hacemos propuesta formal',
          options: ['Menos de 15 min', '15–45 min', '1–3 h', 'Más de 3 h'] },
        { key: 'p66_firma', label: '66 · ¿Y la firma o el alta del cliente?', type: 'axis', web,
          show: (a) => a.p8_vende === 'Servicios' || a.p11_mercado === 'B2B',
          options: ['Firma digital automática', 'PDF por email', 'No hay contrato'] },
        { key: 'p67_caida', label: '67 · ¿En qué punto se cae más gente?', type: 'axis',
          options: ['Falta tráfico', 'No dejan datos', 'No responden después', 'No cierran', 'Compran una vez y no vuelven'] },
      ],
    },

    // ══ BLOQUE 5A · ENTREGA · PRODUCTO FÍSICO ═════════════════════════════
    {
      key: 'b5a', part: 'Bloque 5 · Entrega', title: 'Entrega · Producto físico',
      show: es('p8_vende', 'Producto físico'),
      fields: [
        { key: 'a68_donde', label: '68 · ¿Dónde está el producto?', type: 'axis',
          options: ['Almacén propio', 'Operador logístico', 'Dropshipping', 'Directo de fábrica', 'Mixto'] },
        { key: 'a69_stock', label: '69 · ¿Cómo se sincroniza el stock entre canales?', type: 'axis', web,
          options: ['Automático en todos', 'A mano', 'Vendemos en un solo canal'] },
        { key: 'a70_roturas', label: '70 · ¿Cuántas veces al mes vendéis algo sin stock?', type: 'axis',
          options: ['Nunca', '1–5', '5–20', 'Constantemente'] },
        { key: 'a71_reposicion', label: '71 · ¿Cómo se reponen los pedidos a proveedor?', type: 'axis',
          options: ['Automático por umbral', 'Revisión programada', 'Cuando alguien se da cuenta', 'No aplica'] },
        { key: 'a72_etiquetas', label: '72 · ¿Cómo se generan etiquetas y seguimiento?', type: 'axis', web,
          options: ['Automático', 'Semi-manual', 'Una a una a mano'] },
        { key: 'a73_avisos', label: '73 · ¿El cliente recibe avisos de envío automáticos?', type: 'axis',
          options: ['Sí, todos', 'Solo algunos', 'No'] },
        { key: 'a74_transportistas', label: '74 · Transportistas con los que trabajáis', type: 'text' },
        { key: 'a75_incidencias', label: '75 · ¿Cómo se gestionan las incidencias de entrega?', type: 'axis',
          options: ['Proceso definido y asignado', 'Lo coge quien puede', 'Solo cuando se queja el cliente'] },
        { key: 'a76_devoluciones', label: '76 · Tasa de devoluciones', type: 'axis',
          options: ['Menos del 2 %', '2–8 %', '8–20 %', 'Más del 20 %'] },
        { key: 'a77_proceso_dev', label: '77 · Proceso de devolución, paso a paso', type: 'long', rows: 3 },
      ],
    },

    // ══ BLOQUE 5B · ENTREGA · DIGITAL ═════════════════════════════════════
    {
      key: 'b5b', part: 'Bloque 5 · Entrega', title: 'Entrega · Producto digital o formación',
      show: es('p8_vende', 'Producto digital o formación'),
      fields: [
        { key: 'b68_donde', label: '68 · ¿Dónde se aloja el producto?', type: 'text' },
        { key: 'b69_acceso', label: '69 · ¿Cómo recibe el cliente su acceso tras pagar?', type: 'axis', web,
          options: ['Automático al instante', 'Automático pero falla', 'A mano'] },
        { key: 'b70_manuales', label: '70 · ¿Cuántas veces al mes hay que dar un acceso manualmente?', type: 'axis',
          options: ['Nunca', '1–5', '5–20', 'Constantemente'] },
        { key: 'b71_primeros7', label: '71 · ¿Qué pasa los primeros 7 días después de la compra?', type: 'axis',
          options: ['Secuencia de activación automática', 'Un email de bienvenida y ya', 'Alguien escribe a mano', 'Nada'] },
        { key: 'b72_consumo', label: '72 · ¿Medís cuánta gente consume lo que compró?', type: 'axis',
          options: ['Sí, con alertas si no entran', 'Lo podemos ver pero no lo miramos', 'No'] },
        { key: 'b73_completado', label: '73 · ¿Qué porcentaje termina el contenido?', type: 'axis',
          options: ['Menos del 10 %', '10–30 %', '30–60 %', 'Más del 60 %', 'No lo sabemos'] },
        { key: 'b74_incluido', label: '74 · ¿Hay comunidad, soporte o tutorías incluidas?', type: 'multi',
          options: ['Comunidad', 'Sesiones en directo', 'Tutoría individual', 'Solo contenido'] },
        { key: 'b75_actualizacion', label: '75 · ¿Cómo se actualiza el contenido y cada cuánto?', type: 'long', rows: 2 },
      ],
    },

    // ══ BLOQUE 5C · ENTREGA · SERVICIOS ═══════════════════════════════════
    {
      key: 'b5c', part: 'Bloque 5 · Entrega', title: 'Entrega · Servicios',
      show: es('p8_vende', 'Servicios'),
      fields: [
        { key: 'c68_onboarding', label: '68 · Cuando entra un cliente, ¿cómo arranca el trabajo?', type: 'axis', web,
          options: ['Onboarding automático', 'Checklist manual', 'Cada uno a su manera'] },
        { key: 'c69_primer_resultado', label: '69 · ¿Cuánto tarda un cliente desde que firma hasta que ve el primer resultado?', type: 'axis',
          options: ['Días', '1–2 semanas', '3–6 semanas', '2–3 meses', 'Más'] },
        { key: 'c70_info', label: '70 · ¿Qué información necesitáis del cliente para empezar y cómo la pedís?', type: 'long', rows: 3 },
        { key: 'c71_perseguir', label: '71 · ¿Cuántas veces hay que perseguir al cliente para conseguir esa información?', type: 'axis',
          options: ['Casi nunca', 'Un par de veces', 'Muchas, es un problema', 'Es el mayor cuello de botella'] },
        { key: 'c72_gestion', label: '72 · ¿Con qué gestionáis los proyectos o cuentas?', type: 'axis',
          options: ['Notion', 'ClickUp', 'Asana', 'Trello', 'Hojas de cálculo', 'Nada concreto'] },
        { key: 'c73_responsable', label: '73 · ¿Cada cliente tiene un responsable asignado?', type: 'axis',
          options: ['Sí, siempre', 'A veces', 'No'] },
        { key: 'c74_horas', label: '74 · ¿Se registran las horas dedicadas a cada cliente?', type: 'axis',
          options: ['Automático', 'Parte de horas manual', 'A ojo', 'No se mide'] },
        { key: 'c75_rentabilidad', label: '75 · ¿Sabéis qué clientes son rentables y cuáles no?', type: 'axis',
          options: ['Sí, por cliente', 'Solo en global', 'No'] },
        { key: 'c76_reporting', label: '76 · ¿Cómo informáis al cliente de lo hecho?', type: 'axis', web,
          options: ['Panel o informe automático', 'A mano cada mes', 'Solo cuando preguntan', 'No de forma estructurada'] },
        { key: 'c77_horas_informes', label: '77 · ¿Cuántas horas al mes se van en preparar esos informes?', type: 'text' },
        { key: 'c78_renovacion', label: '78 · ¿Cómo se renueva o amplía un contrato?', type: 'axis',
          options: ['Renovación automática', 'Conversación programada', 'Cuando se acuerda alguien', 'No hay proceso'] },
        { key: 'c79_bajas', label: '79 · ¿Cuántos clientes se han ido en los últimos 12 meses y por qué?', type: 'long', rows: 3 },
      ],
    },

    // ══ BLOQUE 5D · ENTREGA · SUSCRIPCIÓN O SAAS ══════════════════════════
    {
      key: 'b5d', part: 'Bloque 5 · Entrega', title: 'Entrega · Suscripción o SaaS',
      show: es('p8_vende', 'Suscripción o membresía', 'Software / SaaS'),
      fields: [
        { key: 'd68_alta', label: '68 · ¿Cómo es el alta de un usuario nuevo?', type: 'axis',
          options: ['Autoservicio completo', 'Autoservicio con ayuda', 'Onboarding guiado por persona', 'Implantación a medida'] },
        { key: 'd69_activacion', label: '69 · ¿Medís la activación, no solo el registro?', type: 'axis',
          options: ['Sí, con definición clara', 'Lo intuimos', 'No'] },
        { key: 'd70_uso_real', label: '70 · ¿Qué porcentaje de registros llega a usar el producto de verdad?', type: 'axis',
          options: ['Menos del 20 %', '20–40 %', '40–70 %', 'Más del 70 %', 'No lo sabemos'] },
        { key: 'd71_impagos', label: '71 · ¿Qué pasa cuando falla un cobro recurrente?', type: 'axis', web,
          options: ['Reintento y avisos automáticos', 'Alguien lo persigue', 'No hay proceso'] },
        { key: 'd72_perdida', label: '72 · Cuánto perdéis al mes por cobros fallidos', type: 'text',
          hint: 'Si no lo sabéis, escríbelo: también es un dato.' },
        { key: 'd73_churn_por_que', label: '73 · ¿Sabéis por qué se van los que se van?', type: 'axis', web,
          options: ['Sí, lo medimos', 'Tenemos una intuición', 'No'] },
        { key: 'd74_churn', label: '74 · Churn mensual', type: 'axis',
          options: ['Menos del 2 %', '2–5 %', '5–10 %', 'Más del 10 %', 'No lo medimos'] },
        { key: 'd75_alertas_uso', label: '75 · ¿Hay avisos cuando un cliente empieza a usar menos el producto?', type: 'axis',
          options: ['Sí, automáticos', 'Lo vemos tarde', 'No'] },
        { key: 'd76_planes', label: '76 · ¿Cómo se gestionan las subidas y bajadas de plan?', type: 'axis',
          options: ['Autoservicio', 'Hay que escribir a soporte', 'Caso por caso'] },
      ],
    },

    // ══ BLOQUE 6 · COBROS Y ADMINISTRACIÓN ════════════════════════════════
    {
      key: 'b6', part: 'Bloque 6 · Cobros y administración', title: 'El dinero por dentro',
      fields: [
        { key: 'p80_pasarelas', label: '80 · Pasarelas y métodos de cobro', type: 'multi',
          options: ['Stripe', 'PayPal', 'Redsys', 'Pago fraccionado', 'Transferencia', 'Domiciliación', 'Contrareembolso'] },
        { key: 'p81_aplazado', label: '81 · ¿Ofrecéis pago aplazado o en cuotas?', type: 'axis', options: ['Sí', 'No'] },
        { key: 'p82_impagos', label: '82 · ¿Cómo se persigue un impago?', type: 'axis',
          show: es('p81_aplazado', 'Sí'),
          options: ['Automático', 'A mano', 'No hay proceso'] },
        { key: 'p83_facturas', label: '83 · ¿Cómo se emiten las facturas?', type: 'axis', web,
          options: ['Automáticas', 'Semi-manuales', 'A mano'] },
        { key: 'p84_software_fact', label: '84 · Software de facturación o contabilidad', type: 'text' },
        { key: 'p85_conectado', label: '85 · ¿Está conectado con la pasarela de cobro?', type: 'axis',
          options: ['Sí', 'Se exporta a mano', 'No'] },
        { key: 'p86_horasadmin', label: '86 · Horas al mes en administración y gestión', type: 'axis', web,
          options: ['Menos de 5', '5–15', '15–40', '40–80', 'Más de 80'] },
        { key: 'p87_quien_admin', label: '87 · ¿Quién hace ese trabajo administrativo?', type: 'axis',
          options: ['El fundador', 'Alguien del equipo', 'Gestoría externa', 'Repartido'] },
        { key: 'p88_cuadre', label: '88 · ¿Cómo se cuadran los cobros con la contabilidad?', type: 'axis',
          options: ['Automático', 'Manual cada mes', 'No se cuadra bien'] },
        { key: 'p89_caja', label: '89 · ¿Tenéis a la vista la caja y el margen actualizados?', type: 'axis',
          options: ['Sí, en tiempo real', 'Un archivo que actualizamos a veces', 'No'] },
        { key: 'p90_reembolsos', label: '90 · ¿Cómo se gestionan reembolsos o notas de crédito?', type: 'long', rows: 2 },
      ],
    },

    // ══ BLOQUE 7 · ATENCIÓN AL CLIENTE ════════════════════════════════════
    {
      key: 'b7', part: 'Bloque 7 · Atención al cliente', title: 'Quién contesta y cuántas veces',
      fields: [
        { key: 'p91_canales_sop', label: '91 · Canales por los que os escriben', type: 'multi', web,
          options: ['Email', 'WhatsApp', 'Chat web', 'DM redes', 'Teléfono', 'Tickets', 'Slack compartido'] },
        { key: 'p92_volumen', label: '92 · Consultas al día', type: 'axis', web,
          options: ['Menos de 10', '10–30', '30–100', '100–300', 'Más de 300'] },
        { key: 'p93_centralizado', label: '93 · ¿Están todos los canales en una sola herramienta?', type: 'axis', web,
          options: ['Sí, todo en una', 'Algunos sí, otros no', 'Cada canal por su lado'] },
        { key: 'p94_tiempo_resp', label: '94 · Tiempo medio de primera respuesta', type: 'axis',
          options: ['Menos de 15 min', 'Menos de 1 h', 'Menos de 4 h', 'Mismo día', 'Más de 24 h'] },
        { key: 'p95_horario', label: '95 · ¿Hay horario definido de atención y se cumple?', type: 'axis',
          options: ['Sí', 'Está definido pero no se cumple', 'No hay horario'] },
        { key: 'p96_repetidas', label: '96 · Qué parte de las consultas son la misma pregunta de siempre', type: 'axis', web,
          options: ['Menos del 20 %', '20–50 %', '50–80 %', 'Más del 80 %'] },
        { key: 'p97_top5', label: '97 · Escribe las cinco preguntas que más os repiten', type: 'long', rows: 5,
          hint: 'Literalmente, como las escribe el cliente. Es el material con el que se entrena un asistente.' },
        { key: 'p98_base', label: '98 · ¿Tenéis respuestas guardadas o base de conocimiento?', type: 'axis',
          options: ['Sí, actualizada', 'Sí, pero desfasada', 'No'] },
        { key: 'p99_bot', label: '99 · ¿Usáis chatbot o IA en atención?', type: 'axis',
          options: ['Sí, resuelve casos reales', 'Sí, pero solo deriva', 'Lo quitamos', 'No'] },
        { key: 'p100_nunca_mas', label: '100 · ¿Qué consulta os gustaría no volver a contestar nunca?', type: 'text' },
      ],
    },

    // ══ BLOQUE 8 · RETENCIÓN ══════════════════════════════════════════════
    {
      key: 'b8', part: 'Bloque 8 · Retención', title: 'Que el cliente vuelva',
      fields: [
        { key: 'p101_retencion', label: '101 · Qué hacéis para que un cliente vuelva', type: 'multi', web,
          options: ['Secuencia post-compra', 'Reactivación de dormidos', 'Reseñas automáticas', 'Referidos', 'Avisos de renovación', 'Nada'] },
        { key: 'p102_recompra', label: '102 · ¿Cuánto tarda de media un cliente en volver a comprar?', type: 'axis',
          options: ['Menos de 1 mes', '1–3 meses', '3–6 meses', 'Más de 6 meses', 'No vuelven'] },
        { key: 'p103_enfriamiento', label: '103 · ¿Sabéis identificar a un cliente que se está enfriando?', type: 'axis',
          options: ['Sí, con avisos', 'Lo vemos tarde', 'No'] },
        { key: 'p104_resenas', label: '104 · ¿Cómo pedís reseñas o testimonios?', type: 'axis',
          options: ['Automático en el mejor momento', 'Manual uno a uno', 'Cuando nos acordamos', 'No las pedimos'] },
        { key: 'p105_email_tool', label: '105 · Herramienta de email o mensajería', type: 'text' },
        { key: 'p106_lista', label: '106 · Tamaño de la lista y porcentaje activo', type: 'text' },
        { key: 'p107_secuencias', label: '107 · Secuencias automáticas vivas hoy', type: 'multi',
          options: ['Bienvenida', 'Recuperación', 'Post-compra', 'Reactivación', 'Renovación', 'Cumpleaños', 'Ninguna'] },
        { key: 'p108_whatsapp', label: '108 · ¿Usáis WhatsApp de forma estructurada?', type: 'axis',
          options: ['Sí, con API oficial', 'WhatsApp Business manual', 'Desde el móvil de alguien', 'No'] },
        { key: 'p109_segmentacion', label: '109 · ¿Segmentáis los envíos o va todo a todos?', type: 'axis',
          options: ['Segmentado por comportamiento', 'Segmentación básica', 'Todo a todos'] },
      ],
    },

    // ══ BLOQUE 9 · DATOS Y HERRAMIENTAS ═══════════════════════════════════
    {
      key: 'b9', part: 'Bloque 9 · Datos y herramientas', title: 'Dónde vive la información',
      desc: 'Aquí suele estar el problema de raíz. La 120 es la más reveladora de todo el bloque.',
      fields: [
        { key: 'p110_crm', label: '110 · Dónde apuntáis clientes y contactos', type: 'axis', web,
          options: ['CRM actualizado', 'CRM desfasado', 'Hojas de cálculo', 'Nada'] },
        { key: 'p111_donde', label: '111 · En cuántos sitios distintos vive esa información', type: 'multi', web,
          options: ['CRM', 'Hojas de cálculo', 'Plataforma de venta', 'Email marketing', 'WhatsApp', 'En la cabeza de alguien', 'Facturación'] },
        { key: 'p112_duplicada', label: '112 · ¿Está duplicada entre esos sitios?', type: 'axis',
          hint: '«Completamente descontrolado» bloquea cualquier automatización hasta unificar la fuente.',
          options: ['No, hay fuente única', 'Parcialmente', 'Completamente descontrolado'] },
        { key: 'p113_quien_mantiene', label: '113 · ¿Quién mantiene esa información al día?', type: 'text' },
        { key: 'p114_herramientas', label: '114 · Lista TODAS las herramientas que pagáis al mes', type: 'long', rows: 4, web },
        { key: 'p115_coste', label: '115 · Coste mensual total del software', type: 'axis', web,
          options: ['Menos de 200 €', '200–500 €', '500–1.500 €', '1.500–5.000 €', 'Más de 5.000 €'] },
        { key: 'p116_sinusar', label: '116 · ¿Herramientas pagadas que casi no usáis?', type: 'axis', web,
          options: ['Sí seguro', 'No', 'No lo sé'] },
        { key: 'p117_automat', label: '117 · ¿Usáis Zapier, Make, n8n o similar?', type: 'axis', web,
          options: ['Sí, varios flujos', 'Un par de cosas sueltas', 'Lo probamos y lo dejamos', 'No'] },
        { key: 'p118_flujos', label: '118 · ¿Cuántos flujos activos y quién los mantiene?', type: 'text',
          show: es('p117_automat', 'Sí, varios flujos', 'Un par de cosas sueltas') },
        { key: 'p119_funcionan', label: '119 · Automatizaciones que ya funcionan hoy', type: 'long', rows: 3 },
        { key: 'p120_abandonadas', label: '120 · Alguna que intentasteis y abandonasteis', type: 'long', rows: 3,
          hint: 'Aquí sale casi siempre el motivo real por el que se desconfía de automatizar. Cuéntalo entero.' },
        { key: 'p121_ia', label: '121 · ¿Usáis IA para algo concreto?', type: 'axis', web,
          options: ['Sí, dentro de procesos', 'Solo ChatGPT suelto', 'Lo probamos sin resultado', 'No'] },
        { key: 'p122_analitica', label: '122 · Herramientas de analítica instaladas', type: 'multi',
          options: ['GA4', 'Pixel de anuncios', 'Mapas de calor', 'Panel de BI', 'Ninguna'] },
        { key: 'p123_informe', label: '123 · ¿Cómo se genera el informe mensual y cuánto cuesta?', type: 'axis',
          options: ['Panel automático', 'Semi-automático', 'A mano', 'No hacemos informe'] },
        { key: 'p124_exportaciones', label: '124 · ¿Alguien exporta datos a hojas de cálculo de forma recurrente? ¿Para qué y cada cuánto?', type: 'long', rows: 2 },
        { key: 'p125_pregunta', label: '125 · ¿Qué pregunta sobre tu negocio te gustaría responder al instante y hoy no puedes?', type: 'long', rows: 2 },
      ],
    },

    // ══ BLOQUE 10 · EQUIPO ════════════════════════════════════════════════
    {
      key: 'b10', part: 'Bloque 10 · Equipo', title: 'Quién hace qué',
      fields: [
        { key: 'p126_personas', label: '126 · Enumera cada persona con su rol y si es interna, freelance o agencia', type: 'long', rows: 4 },
        { key: 'p127_organigrama', label: '127 · Organigrama, si existe', type: 'text',
          hint: 'Pega el enlace (Drive, Notion, Figma…).' },
        { key: 'p128_decisiones', label: '128 · ¿Quién decide sobre herramientas e inversiones?', type: 'axis',
          options: ['Solo el fundador', 'Fundador y socio', 'Comité', 'Cada área'] },
        { key: 'p129_tecnico', label: '129 · ¿Hay alguien con perfil técnico dentro?', type: 'axis',
          options: ['Sí, dedicado', 'Alguien se apaña', 'No'] },
        { key: 'p130_saturado', label: '130 · Qué parte está más ahogada', type: 'axis', web,
          show: noEs('p6_equipo', 'Solo yo'),
          options: ['Ventas', 'Marketing', 'Operaciones', 'Atención al cliente', 'Administración', 'Yo'] },
        { key: 'p131_fundador', label: '131 · Horas semanales del fundador en tareas repetitivas', type: 'axis', web,
          options: ['Menos de 2', '2–5', '5–10', '10–20', 'Más de 20'] },
        { key: 'p132_sin_criterio', label: '132 · Qué tareas hace hoy una persona y no requieren criterio humano', type: 'long', rows: 3 },
        { key: 'p133_busfactor', label: '133 · Si desapareciera la persona clave, ¿qué pasaría?', type: 'axis', web,
          show: noEs('p6_equipo', 'Solo yo'),
          options: ['Poco, está documentado', 'Un mes malo', 'Se pararían cosas importantes', 'Sería un desastre'] },
        { key: 'p134_que_rompe', label: '134 · ¿Qué se rompería primero exactamente?', type: 'long', rows: 2,
          show: noEs('p6_equipo', 'Solo yo') },
        { key: 'p135_vacante', label: '135 · ¿Habéis intentado cubrir un puesto sin conseguirlo? ¿Cuál?', type: 'text' },
        { key: 'p136_formacion', label: '136 · ¿Cómo se forma a alguien que entra nuevo?', type: 'axis',
          options: ['Manual documentado', 'Vídeos grabados', 'Alguien le acompaña', 'Se busca la vida'] },
        { key: 'p137_documentado', label: '137 · Qué parte de los procesos está escrita', type: 'axis', web,
          options: ['Más del 70 %', '30–70 %', 'Menos del 30 %', 'Nada'] },
        { key: 'p138_donde_doc', label: '138 · ¿Dónde vive esa documentación?', type: 'axis',
          options: ['Notion', 'Drive', 'Herramienta de tareas', 'Repartida sin orden', 'En las cabezas'] },
        { key: 'p139_copypaste', label: '139 · ¿Cuánto se copian datos de una herramienta a otra a mano?', type: 'axis', web,
          options: ['Casi nunca', 'Unas pocas veces al día', 'Constantemente', 'No lo sé'] },
        { key: 'p140_comunicacion', label: '140 · ¿Por dónde se comunica el equipo?', type: 'multi',
          options: ['Slack', 'WhatsApp', 'Email', 'Teams', 'Presencial'] },
      ],
    },

    // ══ BLOQUE 11 · PRIORIDADES ═══════════════════════════════════════════
    {
      key: 'b11', part: 'Bloque 11 · Prioridades', title: 'Por dónde empezamos',
      fields: [
        { key: 'p141_triple', label: '141 · ¿Aguantaría la operativa el triple de clientes sin contratar?', type: 'axis', web,
          options: ['Sí, sin despeinarnos', 'Con esfuerzo', 'No, se rompería', 'No lo sé'] },
        { key: 'p142_freno', label: '142 · Qué te frena más hoy', type: 'axis', web,
          options: ['No entra suficiente gente', 'Entra pero no convertimos', 'La operativa no da abasto', 'El equipo está saturado', 'Estoy metido en todo'] },
        { key: 'p143_se_rompe', label: '143 · Tres cosas que se rompen de forma recurrente', type: 'long', rows: 3 },
        { key: 'p144_eliminar', label: '144 · Si pudieras borrar una tarea para siempre, cuál sería', type: 'text', web },
        { key: 'p145_objetivo', label: '145 · Objetivo para los próximos doce meses', type: 'axis', web,
          options: ['Duplicar facturación', 'Crecer sin ampliar equipo', 'Recuperar mi tiempo', 'Ordenar el caos antes de crecer'] },
        { key: 'p146_presupuesto', label: '146 · Presupuesto mensual para sistemas y automatización', type: 'axis',
          options: ['Menos de 500 €', '500–1.500 €', '1.500–5.000 €', 'Más de 5.000 €', 'Depende del retorno'] },
        { key: 'p147_urgencia', label: '147 · Urgencia', type: 'axis', web,
          options: ['Ya', 'Este trimestre', 'Este año', 'Explorando'] },
        { key: 'p148_exito', label: '148 · ¿Qué tendría que pasar en 90 días para que consideres esto un éxito?', type: 'long', rows: 3 },
      ],
    },

    // ══ LA PREGUNTA QUE VA SOLA ═══════════════════════════════════════════
    {
      key: 'b12', part: 'La pregunta que va sola', title: 'El recorrido completo, de principio a fin',
      desc:
        'Es la pregunta más valiosa de las 149 y la única sin respuesta cerrada. '
        + 'En tres párrafos aparecen los traspasos entre personas, las herramientas que no se '
        + 'hablan entre sí y los pasos que existen solo porque un día alguien los hizo así. '
        + 'Tómate el tiempo que haga falta.',
      fields: [
        { key: 'p149_recorrido', label:
            '149 · Describe el recorrido completo de un cliente desde que entra el dinero hasta que '
            + 'el trabajo está cerrado, indicando quién hace cada paso y con qué herramienta',
          type: 'long', rows: 16 },
      ],
    },
  ],
}
