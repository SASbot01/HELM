// Agent OS — cliente de api/agents.js.
//
// Propio y no el de src/helm/lib.js a propósito: /agents es una zona aparte,
// solo para superadmin, y no depende del panel de perfiles. Mismo contrato de
// sesión, eso sí: el JWT de admin en localStorage y vuelta al login si caduca.

async function pide(path, { method = 'GET', body } = {}) {
  const token = localStorage.getItem('bw_admin_jwt')
  const r = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = await r.json().catch(() => ({}))
  if (r.status === 401) {
    localStorage.removeItem('bw_admin_jwt')
    localStorage.removeItem('bw_superadmin')
    if (typeof window !== 'undefined') window.location.href = '/login'
    throw new Error('Tu sesión ha caducado. Vuelve a entrar.')
  }
  // 403 tiene su propio mensaje: /agents no es para cualquiera con sesión.
  if (r.status === 403) throw new Error('Esta zona es solo para administradores.')
  if (!r.ok) throw new Error(data?.error || `Error ${r.status}`)
  return data
}

const url = (accion, extra = '') => `/api/agents?action=${accion}${extra}`

export const agentsApi = {
  // Identidades
  identidades: () => pide(url('identidades')),
  guardarIdentidad: (body) => pide(url('identidad-guardar'), { method: 'POST', body }),
  borrarIdentidad: (id) => pide(url('identidad-borrar', `&id=${id}`), { method: 'DELETE' }),

  // Corpus
  reels: (identityId) => pide(url('reels', identityId ? `&identityId=${identityId}` : '')),
  reel: (id) => pide(url('reel', `&id=${id}`)),
  añadirReels: (body) => pide(url('reel-add'), { method: 'POST', body }),
  metricas: (body) => pide(url('reel-metricas'), { method: 'POST', body }),
  etiquetas: (body) => pide(url('reel-etiquetas'), { method: 'POST', body }),
  borrarReel: (id) => pide(url('reel-borrar', `&id=${id}`), { method: 'DELETE' }),
  reintentar: (id) => pide(url('reel-reintentar', `&id=${id}`), { method: 'POST' }),

  // Memoria
  memoria: (q) => pide(url('memoria', q ? `&q=${encodeURIComponent(q)}` : '')),
  guardarNota: (body) => pide(url('memoria-guardar'), { method: 'POST', body }),
  borrarNota: (id) => pide(url('memoria-borrar', `&id=${id}`), { method: 'DELETE' }),

  // Cola
  estado: () => pide(url('estado')),
}
