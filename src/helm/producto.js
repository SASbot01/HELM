// HELM — dos productos sobre el mismo código, separados por dominio.
//
//   helm.s4sf.net         → HELM, para infoproductores y creadores.
//   consultoria.s4sf.net  → el vertical de asesorías y despachos legales.
//
// No se mezclan a propósito: un despacho al que le vendes el sistema no tiene
// por qué ver que existen Hugo o Abel, ni al revés. Cada dominio enseña solo
// los perfiles de su producto, con su nombre y su promesa.
//
// La separación es por `clients.client_type`, no por base de datos: comparten
// servidor y tablas, pero ninguno de los dos ve los perfiles del otro. Si algún
// día hace falta separación real (bases distintas), esto es el sitio por donde
// empezar a tirar del hilo.

export const TIPO_CONSULTORIA = 'consultoria'

export const PRODUCTOS = {
  helm: {
    key: 'helm',
    nombre: 'HELM',
    lema: 'El puesto de mando de tu negocio',
    // Enseña todo MENOS las asesorías.
    excluye: [TIPO_CONSULTORIA],
  },
  consultoria: {
    key: 'consultoria',
    // ↓ Cámbialo aquí cuando tengas el nombre comercial definitivo. Es el único
    //   sitio donde vive: se usa en la pestaña, en la pantalla de perfiles y en
    //   el login.
    nombre: 'Consultoría',
    lema: 'El puesto de mando de tu despacho',
    // Enseña SOLO las asesorías.
    soloTipos: [TIPO_CONSULTORIA],
    // Tema fijo, no elegible: un despacho de 48 años no se presenta con el
    // verde neón de un infoproductor.
    tema: 'toga',
    // Las secciones que EXISTEN aquí. Es una lista blanca, no un apagado por
    // perfil: el calendario de contenido, la comunidad y la formación son de
    // infoproducto y en un despacho no deberían poder encenderse siquiera.
    secciones: [
      'informe',      // el director: facturación y cobros del despacho
      'crm',          // clientes del despacho, con su pipeline
      'fiscal',       // plazos, avisos y dirección — el corazón del vertical
      'servicios',    // catálogo: cuotas y servicios que presta
      'equipo',       // los asesores
      'ventas',       // facturación del despacho
      'finanzas',     // cobros, morosos y márgenes
      'llamadas',     // citas con clientes desde el calendario
      'archivos',     // documentación por cliente
      'secciones',
      'ajustes',
      // Los módulos. Nacen apagados y se encienden en Secciones, que es donde
      // vive todo lo activable desde que se fusionó con Plugins.
      'tareas',       // el trabajo del equipo del despacho
      'formularios',  // cuestionarios al cliente, pegados a su ficha
      'biblioteca',   // documentos que amplían el contexto del sistema
      'actividad',    // quién hizo qué con cada cliente
      // FUERA a propósito:
      //   chat     → el asistente está escrito como copywriter de infoproducto
      //              ("escribe tu guion, tu hook, tu CTA"). Enseñárselo a un
      //              despacho quita credibilidad. Vuelve cuando sea el RAG de
      //              normativa, que es otra cosa y sí les sirve.
      //   enlaces  → un cajón de URLs del negocio; con Archivos les sobra.
    ],
  },
}

/** ¿Esta sección existe en el producto que se está sirviendo? */
export function seccionDelProducto(key, producto = productoActual()) {
  if (!producto.secciones) return true      // HELM: todas
  return producto.secciones.includes(key)
}

/**
 * Qué producto se está sirviendo, según el dominio por el que se ha entrado.
 *
 * Se mira el hostname y no una variable de entorno porque el MISMO servidor
 * sirve los dos: una variable obligaría a levantar dos procesos para lo que
 * distingue una sola línea.
 */
export function productoActual() {
  try {
    const h = String(window.location.hostname || '').toLowerCase()
    if (h.startsWith('consultoria.')) return PRODUCTOS.consultoria
  } catch { /* fuera del navegador: HELM por defecto */ }
  return PRODUCTOS.helm
}

/** ¿Este perfil pertenece al producto que se está sirviendo? */
export function esDeEsteProducto(client, producto = productoActual()) {
  const tipo = client?.client_type || 'growth'
  if (producto.soloTipos) return producto.soloTipos.includes(tipo)
  if (producto.excluye) return !producto.excluye.includes(tipo)
  return true
}
