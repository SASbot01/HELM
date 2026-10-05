// Lo que no puede volver a abrirse: la pasarela /sb, los enlaces que llegan a
// yt-dlp y las direcciones internas que el servidor no debe visitar.
import { describe, it, expect } from 'vitest'
import { motivoBloqueo } from '../scripts/sb-proxy.mjs'

const jwt = (role) => `x.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.y`
const con = (role) => ({ apikey: jwt(role), authorization: `Bearer ${jwt(role)}` })

describe('pasarela /sb', () => {
  it('deja pasar tablas y archivos con la clave pública', () => {
    expect(motivoBloqueo({ url: '/sb/rest/v1/crm_contacts?select=*', headers: con('anon') })).toBe('')
    expect(motivoBloqueo({ method: 'POST', url: '/sb/storage/v1/object/helm/a/b.pdf', headers: con('anon') })).toBe('')
    expect(motivoBloqueo({ url: '/sb/storage/v1/object/public/helm/a/b.png', headers: {} })).toBe('')
    expect(motivoBloqueo({ method: 'OPTIONS', url: '/sb/rest/v1/crm_contacts', headers: {} })).toBe('')
  })

  it('no deja pasar la administración ni nada que no sean tablas y archivos', () => {
    for (const url of ['/sb/pg/tables', '/sb/pg/query', '/sb/auth/v1/settings', '/sb/rest/v1/', '/sb/rest/v1/rpc/x',
      '/sb/graphql/v1', '/sb/storage/v1/bucket', '/sb/realtime/v1/websocket', '/sb/functions/v1/x']) {
      expect(motivoBloqueo({ url, headers: con('anon') }), url).toBe('ruta')
    }
  })

  it('no deja pasar la clave de servicio, vaya donde vaya', () => {
    const anon = jwt('anon'), servicio = jwt('service_role')
    expect(motivoBloqueo({ url: '/sb/rest/v1/team', headers: con('service_role') })).toBe('rol')
    expect(motivoBloqueo({ url: '/sb/rest/v1/team', headers: { apikey: anon, authorization: `Bearer ${servicio}` } })).toBe('rol')
    expect(motivoBloqueo({ url: `/sb/rest/v1/team?apikey=${servicio}`, headers: { apikey: anon } })).toBe('rol')
    expect(motivoBloqueo({ url: '/sb/rest/v1/team', headers: { apikey: 'no-es-un-jwt' } })).toBe('rol')
  })

  it('sin clave solo se abren los enlaces públicos de archivos', () => {
    expect(motivoBloqueo({ url: '/sb/rest/v1/clients', headers: {} })).toBe('sin clave')
    expect(motivoBloqueo({ method: 'POST', url: '/sb/storage/v1/object/list/helm', headers: {} })).toBe('sin clave')
  })
})
