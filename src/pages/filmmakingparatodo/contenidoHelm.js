// Filmmaking para todo — sección «Contenido con HELM»: el sistema con el que
// Detrás de Cámara crea su contenido (el perfil detras-de-camra tiene el
// contenido automático de HELM encendido), para que quien lee lo use con sus
// clientes.
//
// Los mismos bloques que un capítulo. Lo que se cuenta de HELM salió del hilo
// de contenido que tuvo la sección Operaciones de AI para todo (retirada el
// 14/10/2026; está en git: src/pages/aiparatodo/operaciones.js en 774b77e),
// comprobado contra el código el 12/10/2026.
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
    gancho: 'Guiones escritos, calendario lleno y vídeos colocados en su sitio con Claude',
    resumen: 'La cadena con la que sale el contenido: creadores de referencia transcritos, agentes que escriben los guiones de la semana, y un Drive donde subes el vídeo y lo colocas en su sitio con Claude.',
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
        { titulo: 'Rueda y sube a «0 · Entrada»', texto: 'El vídeo tal cual, a la carpeta de Entrada de su Drive.' },
        { titulo: 'Ordénalo con Claude', texto: 'Por el conector de HELM le dices a Claude de qué guion es el vídeo que hay en la Entrada.' },
        { titulo: 'Queda en su pieza', texto: 'Claude lo mueve a «1 · Sin editar», a la carpeta del guion, y lo marca como grabado.' },
      ] },
      { tipo: 'aviso', variante: 'truco', titulo: 'Tú marcas de qué guion es', texto: 'Al ordenarlo con Claude le dices a qué guion pertenece el vídeo: va directo a su pieza, sin adivinar.' },

      { tipo: 'h2', texto: 'Úsalo con tus clientes' },
      { tipo: 'p', texto: 'La cadena es la misma para cualquier perfil que des de alta en HELM: el tuyo o el de cada cliente al que le llevas el contenido. Créate la cuenta, asigna los creadores de referencia y deja que el programador te llene la semana.' },
    ],
    claves: [
      'Referencias transcritas y etiquetadas → guiones con su tipo → calendario → Drive.',
      'Los agentes dejan borradores; nadie publica ni borra nada sin ti.',
      'Subes el vídeo a «0 · Entrada» y lo colocas en su pieza con Claude por el conector.',
    ],
  },
]
