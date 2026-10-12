// Lo que no puede volver a abrirse: la pasarela /sb, los enlaces que llegan a
// yt-dlp y las direcciones internas que el servidor no debe visitar.
import { Buffer } from 'node:buffer'
import { describe, it, expect } from 'vitest'
import { motivoBloqueo } from '../scripts/sb-proxy.mjs'

const jwt = (role) => `x.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.y`
const con = (role) => ({ apikey: jwt(role), authorization: `Bearer ${jwt(role)}` })

describe('pasarela /sb', () => {
  it('solo deja ver archivos públicos y subir a una URL firmada', () => {
    expect(motivoBloqueo({ url: '/sb/storage/v1/object/public/helm/a/b.png', headers: {} })).toBe('')
    expect(motivoBloqueo({ method: 'HEAD', url: '/sb/storage/v1/object/public/helm/a/b.png', headers: {} })).toBe('')
    expect(motivoBloqueo({ method: 'PUT', url: '/sb/storage/v1/object/upload/sign/helm/fiscal/a/b.pdf?token=x', headers: {} })).toBe('')
    expect(motivoBloqueo({ method: 'OPTIONS', url: '/sb/storage/v1/object/upload/sign/helm/a.pdf?token=x', headers: {} })).toBe('')
  })

  it('ya no deja pasar tablas, ni con la clave pública', () => {
    for (const url of ['/sb/rest/v1/crm_contacts?select=*', '/sb/rest/v1/clients', '/sb/rest/v1/rpc/x']) {
      expect(motivoBloqueo({ url, headers: con('anon') }), url).toBe('ruta')
    }
  })

  it('no deja subir, borrar ni listar archivos sin URL firmada', () => {
    expect(motivoBloqueo({ method: 'POST', url: '/sb/storage/v1/object/helm/a/b.pdf', headers: con('anon') })).toBe('ruta')
    expect(motivoBloqueo({ method: 'DELETE', url: '/sb/storage/v1/object/helm', headers: con('anon') })).toBe('ruta')
    expect(motivoBloqueo({ method: 'POST', url: '/sb/storage/v1/object/list/helm', headers: {} })).toBe('ruta')
    expect(motivoBloqueo({ method: 'DELETE', url: '/sb/storage/v1/object/public/helm/a.png', headers: {} })).toBe('ruta')
    expect(motivoBloqueo({ method: 'PUT', url: '/sb/storage/v1/object/upload/sign/helm/a.pdf', headers: {} })).toBe('ruta')
  })

  it('no deja pasar la administración ni nada más', () => {
    for (const url of ['/sb/pg/tables', '/sb/pg/query', '/sb/auth/v1/settings', '/sb/rest/v1/',
      '/sb/graphql/v1', '/sb/storage/v1/bucket', '/sb/realtime/v1/websocket', '/sb/functions/v1/x']) {
      expect(motivoBloqueo({ url, headers: con('anon') }), url).toBe('ruta')
    }
  })

  it('no deja pasar la clave de servicio, vaya donde vaya', () => {
    const anon = jwt('anon'), servicio = jwt('service_role')
    const url = '/sb/storage/v1/object/public/helm/a.png'
    expect(motivoBloqueo({ url, headers: con('service_role') })).toBe('rol')
    expect(motivoBloqueo({ url, headers: { apikey: anon, authorization: `Bearer ${servicio}` } })).toBe('rol')
    expect(motivoBloqueo({ url: `${url}?apikey=${servicio}`, headers: { apikey: anon } })).toBe('rol')
    expect(motivoBloqueo({ url, headers: { apikey: 'no-es-un-jwt' } })).toBe('rol')
  })
})
