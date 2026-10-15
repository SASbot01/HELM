// HELM — el alta de un cliente: 40 preguntas para entrar en HELM.
//
// El formulario corto y genérico que rellena cada cliente nuevo antes de
// empezar: sirve igual a un negocio de servicios, a una marca personal, a una
// tienda o a quien vende formación. Con esto la agencia y los agentes ya saben
// qué vende, a quién, cuánto factura, dónde está en redes y cuánto puede grabar.
// Desde 2026-10-15 es el ÚNICO onboarding que se ofrece en el panel, y al
// completarlo se generan las Biblias. El de contenido (schema.js) y el
// operativo (operativo.js) siguen en el código por los perfiles que ya los
// rellenaron.
//
// Lo rellena el propio cliente desde un enlace sin cuenta (/alta/<token>, ver
// api/onboarding.js) o el equipo desde Onboarding en el panel. Mismos tipos de
// campo que schema.js. Módulo de datos puro (sin React): lo importa también
// el servidor para validar lo que llega por el enlace.

export const ONBOARDING_ALTA = {
  key: 'alta',
  title: 'Alta en HELM',
  tagline: '40 preguntas para conocer tu negocio y ponerlo a trabajar',
  intro:
    'Unos 15 minutos. Cuéntanos tu negocio con tus palabras: no hay respuestas ' +
    'correctas, y cuanto más concreto seas, mejor trabajarán tu equipo y tus ' +
    'agentes desde el primer día. Se guarda solo mientras escribes: puedes salir y volver.',
  sections: [
    {
      key: 'negocio',
      part: '1 · Tu negocio',
      title: 'Tu negocio',
      desc: 'Lo básico: qué es y quién está detrás.',
      fields: [
        { key: 'nombre', label: '1 · ¿Cómo se llama tu negocio o tu marca?', type: 'text' },
        { key: 'que_haces', label: '2 · ¿A qué se dedica tu negocio? Explícalo como si se lo contaras a alguien que no conoce tu sector.', type: 'long' },
        { key: 'sector', label: '3 · ¿En qué sector o nicho estás? (p. ej. «entrenamiento online para mujeres», «clínica dental», «formación en edición de vídeo»)', type: 'text' },
        { key: 'antiguedad', label: '4 · ¿Cuánto tiempo llevas con el negocio?', type: 'axis', options: ['Empezando (menos de 6 meses)', 'De 6 meses a 2 años', 'De 2 a 5 años', 'Más de 5 años'] },
        { key: 'cara', label: '5 · ¿Quién da la cara en el contenido?', type: 'axis', options: ['Yo (marca personal)', 'Otra persona del equipo', 'Varias personas', 'Nadie: es una marca de empresa'] },
        { key: 'equipo', label: '6 · ¿Cuántas personas trabajáis en el negocio y qué hace cada una?', type: 'long', rows: 2 },
        { key: 'ambito', label: '7 · ¿Dónde vendes?', type: 'multi', max: 4, options: ['En mi ciudad o zona', 'En toda España', 'En otros países', '100 % online'] },
      ],
    },
    {
      key: 'cliente',
      part: '2 · Tu cliente ideal',
      title: 'Tu cliente ideal',
      desc: 'A quién le vendes y por qué te compra.',
      fields: [
        { key: 'cliente_ideal', label: '8 · ¿Quién es tu cliente ideal? Edad, situación, a qué se dedica, cuánto gana… cuanto más concreto, mejor.', type: 'long' },
        { key: 'problema', label: '9 · ¿Qué problema o necesidad le resuelves?', type: 'long' },
        { key: 'resultado', label: '10 · ¿Qué resultado concreto consigue contigo? (en cuánto tiempo y con qué cifras, si las tienes)', type: 'long' },
        { key: 'objeciones', label: '11 · ¿Qué dudas u objeciones te pone antes de comprar?', type: 'long', rows: 2 },
        { key: 'donde_esta', label: '12 · ¿Dónde pasa el tiempo tu cliente ideal? (redes, webs, grupos, sitios físicos, eventos)', type: 'long', rows: 2 },
        { key: 'no_cliente', label: '13 · ¿A qué tipo de cliente NO quieres atender?', type: 'long', rows: 2 },
      ],
    },
    {
      key: 'oferta',
      part: '3 · Tu oferta',
      title: 'Tu oferta',
      desc: 'Qué vendes, cuánto cuesta y por qué te eligen a ti.',
      fields: [
        {
          key: 'servicios', label: '14 · ¿Qué vendes? Apunta tus productos o servicios con su precio.', type: 'table',
          columns: [
            { key: 'nombre', label: 'Producto o servicio', type: 'text' },
            { key: 'precio', label: 'Precio', type: 'text' },
            { key: 'modalidad', label: 'Pago único, mensual o a plazos', type: 'text' },
          ],
        },
        { key: 'estrella', label: '15 · ¿Cuál es tu producto o servicio estrella y por qué?', type: 'long', rows: 2 },
        { key: 'ticket', label: '16 · ¿Cuánto cobras de media por cliente o por servicio? (tu ticket medio)', type: 'text' },
        { key: 'forma_pago', label: '17 · ¿Cómo te pagan tus clientes?', type: 'multi', max: 5, options: ['Pago único', 'A plazos (fraccionado)', 'Suscripción mensual', 'Por sesión o por hora', 'Financiado (Sequra, Hotmart…)'] },
        { key: 'diferencia', label: '18 · ¿Qué te diferencia de tu competencia? ¿Por qué te eligen a ti y no a otro?', type: 'long' },
        { key: 'garantia', label: '19 · ¿Ofreces alguna garantía, un bonus o algo que nadie más ofrece?', type: 'long', rows: 2 },
        { key: 'casos', label: '20 · ¿Cuáles son tus mejores casos de éxito o testimonios? (tipo de cliente y resultado)', type: 'long' },
      ],
    },
    {
      key: 'numeros',
      part: '4 · Tus números',
      title: 'Tus números',
      desc: 'Aproximados valen. Solo los ve tu equipo.',
      fields: [
        { key: 'facturacion_actual', label: '21 · ¿Cuánto facturas al mes de media? (un rango vale: «entre 3.000 y 5.000 €»)', type: 'text' },
        { key: 'facturacion_objetivo', label: '22 · ¿Cuánto quieres facturar al mes dentro de 12 meses?', type: 'text' },
        { key: 'clientes_mes', label: '23 · ¿Cuántos clientes nuevos consigues al mes?', type: 'text' },
        { key: 'origen_clientes', label: '24 · ¿De dónde vienen hoy tus clientes?', type: 'multi', max: 7, options: ['Redes sociales (sin pagar)', 'Publicidad pagada', 'Boca a boca o recomendaciones', 'Google o mi web', 'Mensajes o llamadas en frío', 'Eventos o en persona', 'Otro'] },
        { key: 'publicidad', label: '25 · ¿Cuánto inviertes al mes en publicidad?', type: 'axis', options: ['Nada', 'Menos de 300 €', 'De 300 a 1.000 €', 'De 1.000 a 3.000 €', 'Más de 3.000 €'] },
        { key: 'proceso_venta', label: '26 · ¿Cómo vendes? (te escriben por mensaje, haces una llamada de venta, compran directamente en la web, pasas presupuesto…)', type: 'long', rows: 2 },
      ],
    },
    {
      key: 'redes',
      part: '5 · Tus redes y tu contenido',
      title: 'Tus redes y tu contenido',
      desc: 'Dónde estás hoy y cuánto puedes dedicarle.',
      fields: [
        {
          key: 'redes', label: '27 · ¿En qué redes estás? Apunta cada una con sus números.', type: 'table',
          columns: [
            { key: 'red', label: 'Red', type: 'text' },
            { key: 'usuario', label: '@ o enlace', type: 'text' },
            { key: 'seguidores', label: 'Seguidores', type: 'text' },
            { key: 'frecuencia', label: 'Publicaciones a la semana', type: 'text' },
          ],
        },
        { key: 'numeros_redes', label: '28 · ¿Qué números suelen tener tus publicaciones? (visualizaciones, me gusta, guardados, mensajes que te llegan por cada una)', type: 'long', rows: 2 },
        { key: 'mejor_contenido', label: '29 · ¿Qué contenido tuyo ha funcionado mejor? Pega los enlaces y di por qué crees que funcionó.', type: 'long' },
        { key: 'tiempo_grabar', label: '30 · ¿Cuánto tiempo puedes dedicar a grabar a la semana?', type: 'axis', options: ['Menos de 1 hora', 'De 1 a 2 horas', 'De 2 a 4 horas', 'Más de 4 horas'] },
        { key: 'camara', label: '31 · ¿Cómo te sientes delante de la cámara?', type: 'scale', minLabel: 'Lo paso fatal', maxLabel: 'Fluyo' },
        { key: 'edicion', label: '32 · ¿Quién edita tus vídeos?', type: 'axis', options: ['Yo', 'Alguien de mi equipo', 'Un editor externo', 'Nadie todavía'] },
        { key: 'formatos', label: '33 · ¿Qué formatos quieres hacer?', type: 'multi', max: 7, options: ['Reels o TikTok', 'Carruseles', 'Stories', 'YouTube', 'Directos', 'Newsletter o email', 'LinkedIn'] },
      ],
    },
    {
      key: 'referentes',
      part: '6 · Referentes y competencia',
      title: 'Referentes y competencia',
      desc: 'A quién miras y de quién te quieres distinguir.',
      fields: [
        {
          key: 'referentes', label: '34 · ¿Qué referentes de tu sector sigues en redes, dentro de tu nicho?', type: 'table',
          columns: [
            { key: 'nombre', label: 'Nombre o @', type: 'text' },
            { key: 'red', label: 'Red', type: 'text' },
            { key: 'gusta', label: '¿Qué te gusta de ellos?', type: 'text' },
          ],
        },
        {
          key: 'competencia', label: '35 · ¿Quién es tu competencia directa?', type: 'table',
          columns: [
            { key: 'nombre', label: 'Nombre o @', type: 'text' },
            { key: 'bien', label: '¿Qué hacen bien?', type: 'text' },
            { key: 'mal', label: '¿Qué hacen mal o les falta?', type: 'text' },
          ],
        },
        { key: 'anti_referente', label: '36 · ¿A quién de tu sector NO te quieres parecer, y por qué?', type: 'long', rows: 2 },
        { key: 'tono', label: '37 · Tres palabras para cómo quieres que suene tu marca (p. ej. «cercana, directa, con humor»)', type: 'text' },
      ],
    },
    {
      key: 'objetivos',
      part: '7 · Objetivos',
      title: 'Objetivos',
      desc: 'Qué quieres conseguir y qué te lo impide.',
      fields: [
        { key: 'objetivo', label: '38 · ¿Qué quieres conseguir en los próximos 3 meses?', type: 'multi', max: 3, options: ['Más contenido y más constancia', 'Más leads', 'Más ventas', 'Ordenar el CRM y el seguimiento', 'Tener claros mis números', 'Delegar en un equipo o en agentes de IA'] },
        { key: 'frena', label: '39 · ¿Qué te frena hoy para conseguirlo?', type: 'long', rows: 2 },
        { key: 'herramientas', label: '40 · ¿Qué herramientas usas ya? (Stripe, Calendly, Google Drive, un CRM, Notion, Excel…)', type: 'long', rows: 2 },
      ],
    },
  ],
}
