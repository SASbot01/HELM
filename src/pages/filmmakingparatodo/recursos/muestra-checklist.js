// MUESTRA — cómo es un recurso de Filmmaking para todo. Se borra cuando
// entren los de verdad.
// TODO-ABEL: sustituir por los recursos reales (plantillas, LUTs, checklists…).
//
// Un recurso es un archivo de esta carpeta con su sección, su tema (uno de
// los de Recursos en ../contenido.js) y los mismos bloques que un capítulo de
// la guía. El archivo para descargar va en public/filmmakingparatodo/ y se
// enlaza con un bloque `descarga`; sin `url`, sale «pronto».
export default {
  slug: 'muestra-checklist-de-rodaje',
  seccion: 'recursos',
  tema: 'checklists',
  muestra: true,
  titulo: 'Muestra · Checklist de rodaje',
  gancho: 'Así se ve un recurso',
  resumen: 'Un recurso de ejemplo para ver cómo queda: una explicación corta, lo que incluye y el archivo para descargar.',
  fecha: '2026-10-13',
  lectura: '2 min',
  bloques: [
    { tipo: 'aviso', variante: 'dato', titulo: 'Esto es una muestra', texto: 'Así se verán los recursos de la comunidad. El contenido de verdad lo pone Abel.' },
    { tipo: 'h2', texto: 'Qué incluye' },
    { tipo: 'lista', items: ['Para qué sirve y cuándo usarlo', 'Cómo adaptarlo a cada cliente', 'El archivo, listo para descargar'] },
    { tipo: 'descarga', titulo: 'Checklist de rodaje', texto: 'El archivo editable, para imprimir o llevar en el móvil.' },
  ],
}
