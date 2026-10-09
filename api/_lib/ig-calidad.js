// HELM — Calidad de Instagram: los scorers DETERMINISTAS (sin IA, sin red).
//
// Portados fielmente del repo MIT de Jake Schincariol (instagram-agent-skill,
// opusjake.ai) y verificados con node contra los vectores conocidos del propio
// repo (p. ej. «I lost $18,000…» → gancho 81.4 STRONG, punto flojo ADDRESS).
// Son funciones puras de texto: no tocan la red, ni el disco, ni la base de
// datos, ni claves. Las usan el guionista (./equipo.js) y el «Estudio de
// Instagram» del panel (../ig-calidad.js).
export { puntuarGancho, clasificaGancho, FORMULAS_GANCHO } from './ig-gancho.js'
export { lintarCaption } from './ig-caption.js'
export { humanizar, detectar } from './ig-humano.js'
export { cronometrar, RUBRICA_PERFIL } from './ig-beats.js'
