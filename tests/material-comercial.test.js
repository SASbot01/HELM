// Material comercial: etiqueta `comercial` en helm_library, solo PDF, y el
// enlace no sale del perfil. La facturación no se abre a setter ni closer
// por el hecho de ver la sección.
import { describe, it, expect, vi } from 'vitest'
import {
  TAG_COMERCIAL, esComercial, esPdf, esMaterialComercial, conEtiqueta, enlaceDelPerfil, pestañasDeDocumentos,
} from '../src/helm/documentos/material.js'

vi.mock('../src/helm/lib', () => ({ supabase: {} }))
const { DEFAULT_VISIBLE, DEFAULT_MATRIX, puedeVer, puedeVerFacturacion } = await import('../src/helm/permisos.js')

const PERFIL = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const OTRO = 'ffffffff-1111-2222-3333-444444444444'
const pdf = (extra = {}) => ({
  title: 'Dossier',
  file_name: 'dossier.pdf',
  file_url: `https://helm.example/api/db/storage/v1/object/public/helm/${PERFIL}/biblioteca/ab12-dossier.pdf`,
  tags: [TAG_COMERCIAL],
  client_id: PERFIL,
  ...extra,
})

describe('material comercial · qué cuenta', () => {
  it('un PDF con la etiqueta comercial, sí', () => {
    expect(esMaterialComercial(pdf())).toBe(true)
    expect(esComercial({ tags: ['Ventas', ' COMERCIAL '] })).toBe(true)
    expect(esPdf({ file_name: 'Oferta.PDF', file_url: '' })).toBe(true)
  })

  it('sin etiqueta, sin PDF o sin enlace, no', () => {
    expect(esMaterialComercial(pdf({ tags: ['ventas'] }))).toBe(false)
    expect(esMaterialComercial(pdf({ file_name: 'notas.docx', file_url: 'https://x/notas.docx' }))).toBe(false)
    expect(esMaterialComercial(pdf({ file_url: '  ' }))).toBe(false)
    expect(esPdf({ file_name: 'foto.pdf.png', file_url: '' })).toBe(false)
  })

  it('el enlace del bucket solo vale si el perfil de la ruta es el abierto', () => {
    expect(enlaceDelPerfil(pdf(), PERFIL)).toContain(`/helm/${PERFIL}/`)
    expect(enlaceDelPerfil(pdf(), OTRO)).toBe('')
    expect(enlaceDelPerfil(pdf({
      file_url: `https://helm.example/api/db/storage/v1/object/public/helm/${encodeURIComponent(PERFIL)}/biblioteca/a.pdf`,
    }), PERFIL)).toContain(PERFIL)
    // Drive y el resto de enlaces externos se abren igual que en la Biblioteca.
    const drive = 'https://drive.google.com/file/d/abc/view'
    expect(enlaceDelPerfil(pdf({ file_url: drive }), PERFIL)).toBe(drive)
  })

  it('marcar y desmarcar no duplica la etiqueta ni borra las otras', () => {
    expect(conEtiqueta(['ventas', 'Comercial'], TAG_COMERCIAL, true)).toEqual(['ventas', 'comercial'])
    expect(conEtiqueta('ventas, comercial', TAG_COMERCIAL, false)).toEqual(['ventas'])
    expect(conEtiqueta('', TAG_COMERCIAL, true)).toEqual(['comercial'])
  })

  it('sin facturación la única pestaña es el material', () => {
    expect(pestañasDeDocumentos(false).map(t => t.key)).toEqual(['material'])
    expect(pestañasDeDocumentos(true).map(t => t.label)).toEqual(['Facturas', 'Presupuestos', 'Material comercial'])
  })
})

describe('material comercial · quién ve las facturas', () => {
  it('setter y closer ven Documentos y no la facturación', () => {
    for (const rol of ['setter', 'closer']) {
      expect(DEFAULT_VISIBLE[rol]).toContain('documentos')
      expect(puedeVer(DEFAULT_VISIBLE, rol, 'documentos')).toBe(true)
      expect(puedeVerFacturacion(DEFAULT_MATRIX, DEFAULT_VISIBLE, rol)).toBe(false)
      expect(DEFAULT_MATRIX[rol]).not.toContain('documentos')
    }
  })

  it('el resto no gana Documentos de serie', () => {
    for (const rol of ['csm', 'editor', 'otro']) {
      expect(puedeVer(DEFAULT_VISIBLE, rol, 'documentos')).toBe(false)
      expect(puedeVerFacturacion(DEFAULT_MATRIX, DEFAULT_VISIBLE, rol)).toBe(false)
    }
  })

  it('dueño, administrador y quien puede editar Documentos ven las facturas', () => {
    expect(puedeVerFacturacion(DEFAULT_MATRIX, DEFAULT_VISIBLE, 'closer', 'admin')).toBe(true)
    expect(puedeVerFacturacion(DEFAULT_MATRIX, DEFAULT_VISIBLE, 'setter', 'admin,ceo,director')).toBe(true)
    expect(puedeVerFacturacion(DEFAULT_MATRIX, DEFAULT_VISIBLE, 'dueno')).toBe(true)
    expect(puedeVerFacturacion(DEFAULT_MATRIX, DEFAULT_VISIBLE, null)).toBe(true)
    const matrix = { ...DEFAULT_MATRIX, closer: [...DEFAULT_MATRIX.closer, 'documentos'] }
    expect(puedeVerFacturacion(matrix, DEFAULT_VISIBLE, 'closer', 'member')).toBe(true)
  })

  it('un rol que no es de ventas y tiene la sección en el menú ve las facturas', () => {
    const visible = { ...DEFAULT_VISIBLE, csm: [...DEFAULT_VISIBLE.csm, 'documentos'] }
    expect(puedeVerFacturacion(DEFAULT_MATRIX, visible, 'csm', 'member')).toBe(true)
  })

  it('quitarle Documentos a un closer le quita la sección entera', () => {
    const visible = { ...DEFAULT_VISIBLE, closer: ['crm', 'diario', 'tareas'] }
    expect(puedeVer(visible, 'closer', 'documentos')).toBe(false)
    expect(puedeVerFacturacion(DEFAULT_MATRIX, visible, 'closer')).toBe(false)
  })
})
