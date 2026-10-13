// Filmmaking para todo — sección «Contenido con HELM»: el sistema con el que
// Detrás de Cámara crea su contenido (el perfil detras-de-camra tiene el
// contenido automático de HELM encendido), para que quien lee lo use con sus
// clientes.
//
// Los mismos bloques que un capítulo. Lo que se cuenta de HELM sale del hilo
// de contenido de AI para todo (src/pages/aiparatodo/operaciones.js),
// comprobado contra el código el 12/10/2026: si cambia allí, se cambia aquí.
// TODO-ABEL: revisar el texto y contarlo con su experiencia.

export const HELM_REGISTRO = 'https://helm.s4sf.net/registro'
export const HELM_WEB = 'https://helm.s4sf.net'

export default [
  {
    slug: 'como-se-crea-el-contenido-con-helm',
    seccion: 'contenido',
    tema: 'sistema',
    fecha: '2026-10-13',
    titulo: 'Cómo se crea el contenido de Detrás de Cámara con HELM',
    gancho: 'Guiones escritos, calendario lleno y vídeos que se ordenan solos',
    resumen: 'La cadena con la que sale el contenido: creadores de referencia transcritos, agentes que escriben los guiones de la semana, y un Drive donde subes el vídeo y HELM lo coloca.',
    lectura: '6 min',
    bloques: [
      { tipo: 'p', texto: 'El contenido de Detrás de Cámara sale de **HELM**, un sistema que convierte el contenido en una cadena con cuatro eslabones: **referencias → guiones → calendario → Drive**. Así funciona cada uno, para que puedas montarlo igual con tu marca o con la de tus clientes.' },

      { tipo: 'h2', texto: 'Los creadores de referencia' },
      { tipo: 'p', texto: 'Cada perfil tiene unos **creadores de referencia**: cuentas que ya funcionan en su nicho. HELM descarga sus reels, los transcribe frase a frase y los etiqueta: el papel de cada frase (gancho, planteamiento, remate o venta), el tipo de gancho, la estructura, el tema y la llamada a la acción. Cada lunes, un agente rastrea sus reels recientes y añade los que mejor sirven para inspirar la semana.' },

      { tipo: 'h2', texto: 'Los guiones de la semana' },
      { tipo: 'p', texto: 'Un equipo de agentes trabaja solo dentro de HELM. El que importa aquí es el **programador**: cada lunes prepara los guiones de la semana entrante por tipo de pieza, y los deja en el calendario como **borrador**.' },
      { tipo: 'tabla', cabecera: ['Tipo', 'Piezas por semana'], filas: [
        ['Viralidad', '3'], ['Autoridad', '2'], ['Conversión', '1'], ['Venta', '0 (salvo que lo pidas)'],
      ] },
      { tipo: 'aviso', variante: 'ojo', titulo: 'Los agentes proponen, tú apruebas', texto: 'Ningún agente publica, borra ni cambia lo que ya hay en el calendario: dejan borradores y tú decides.' },

      { tipo: 'h2', texto: 'Del rodaje al Drive' },
      { tipo: 'p', texto: 'Cada guion pasa por **borrador → por grabar → sin editar → editado → publicado**. Y cada perfil tiene su carpeta de Drive, donde la carpeta en la que está una pieza ES su estado:' },
      { tipo: 'pasos', items: [
        { titulo: 'Rueda y sube a «0 · Entrada»', texto: 'El vídeo tal cual, sin renombrarlo.' },
        { titulo: 'HELM lo escucha', texto: 'Cada cinco minutos mira la Entrada, transcribe el principio del vídeo y lo compara con los guiones del calendario.' },
        { titulo: 'Lo coloca en su pieza', texto: 'Si sabe de qué guion es, lo mueve a «1 · Sin editar». Si no lo sabe, lo deja en Entrada: mejor quieto que mal puesto.' },
      ] },
      { tipo: 'aviso', variante: 'truco', titulo: 'Rueda el guion como está escrito', texto: 'HELM reconoce el vídeo por lo que se dice: cuanto más se parezca lo grabado al guion, mejor lo coloca solo.' },

      { tipo: 'h2', texto: 'Úsalo con tus clientes' },
      { tipo: 'p', texto: 'La cadena es la misma para cualquier perfil que des de alta en HELM: el tuyo o el de cada cliente al que le llevas el contenido. Créate la cuenta, asigna los creadores de referencia y deja que el programador te llene la semana.' },
    ],
    claves: [
      'Referencias transcritas y etiquetadas → guiones con su tipo → calendario → Drive.',
      'Los agentes dejan borradores; nadie publica ni borra nada sin ti.',
      'Subes el vídeo a «0 · Entrada» y HELM lo mueve a su pieza.',
    ],
  },
]
