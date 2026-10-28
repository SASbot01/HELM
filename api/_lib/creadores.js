// Qué creador es contenido del propio cliente («Propio»): sus vídeos de Drive,
// transcritos. Se compara sin mayúsculas ni espacios de más, que el tipo se
// escribe a mano. Lo usan el taller (api/agents.js), para decidir quién lo ve,
// y el equipo de agentes (api/_lib/equipo.js), para no tomarlo por referencia.
export const esPropio = (i) => String(i?.categoria || '').trim().toLowerCase() === 'propio'
