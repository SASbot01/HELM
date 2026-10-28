// @vitest-environment jsdom
// El Onboarding con el alta como único formulario (src/helm/views/Onboarding.jsx),
// pulsando de verdad: completar el alta genera las dos Biblias con todo lo
// respondido, solo se da por completada cuando hay Biblia, un fallo de la IA se
// puede reintentar sin el falso «se ha guardado desde otro sitio», una Biblia
// editada a mano no se pisa sin preguntar, y un alta respondida sin Biblia lo
// dice. La base y la API van simuladas.
//
// Usa jsdom y @testing-library/react, que vienen del node_modules compartido
// con ~/code/HELM (declarados en su package.json).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

const h = vi.hoisted(() => {
  let t = Date.parse('2026-10-15T10:00:00.000Z')
  const tick = () => new Date(t += 1000).toISOString()
  const rows = new Map()
  const biblias = new Map()
  const calls = []
  const st = { failOn: null }
  const key = (c, f) => `${c}|${f}`
  function from() {
    const q = { filters: {}, op: 'select', payload: null }
    const api = {
      select() { return api },
      update(p) { q.op = 'update'; q.payload = p; return api },
      eq(k, v) { q.filters[k] = v; return api },
      maybeSingle() {
        const r = rows.get(key(q.filters.client_id, q.filters.form))
        return Promise.resolve({ data: r ? { ...r } : null, error: null })
      },
      then(res, rej) {
        if (q.op === 'update') {
          const r = rows.get(key(q.filters.client_id, q.filters.form))
          if (r) Object.assign(r, q.payload)
        }
        return Promise.resolve({ error: null }).then(res, rej)
      },
    }
    return api
  }
  const lib = {
    supabase: { from },
    getOnboarding: async (c, f = 'contenido') => { const r = rows.get(key(c, f)); return r ? { ...r } : null },
    saveOnboardingDraft: async (c, answers, form = 'contenido', { conservarEstado = false } = {}) => {
      const prev = rows.get(key(c, form))
      const r = { status: 'draft', completed_at: null, ...prev, client_id: c, form, answers, updated_at: tick() }
      if (!conservarEstado) r.status = 'draft'
      rows.set(key(c, form), r)
      return { ...r }
    },
    enlaceAltaPublicaDelPerfil: async () => null,
    onboardingApi: {
      biblia: async (c) => ({ biblia: { ...(biblias.get(c) || {}) } }),
      generate: async (c, kind, dossier, opts = {}) => {
        calls.push({ c, kind, dossier, form: opts.form })
        if (st.failOn === kind) throw new Error('Sin saldo')
        if (!dossier?.trim()) throw new Error('El onboarding está vacío: no hay nada que sintetizar.')
        const b = { kind, content: `# ${kind}\n\n${dossier.slice(0, 40)}`, status: 'generated' }
        biblias.set(c, { ...(biblias.get(c) || {}), [kind]: b })
        if ((opts.form || 'contenido') === 'contenido') {
          const r = rows.get(key(c, 'contenido'))
          if (r) Object.assign(r, { status: 'completed', completed_at: tick() })
        }
        return { biblia: b }
      },
      saveBiblia: async () => ({}),
      enlaceAlta: async () => ({}),
    },
  }
  return { rows, biblias, calls, st, key, lib, tick }
})

vi.mock('../src/helm/lib.js', () => h.lib)
vi.mock('../src/helm/views/Ajustes.jsx', () => ({ StripeCard: () => null }))

const { default: Onboarding } = await import('../src/helm/views/Onboarding.jsx')

// Por su papel de botón: la tarjeta del hub también nombra «Completar y
// generar la Biblia», y buscar el texto a secas pulsaría la tarjeta.
const BOTON = { name: /Completar y generar la Biblia/ }
const boton = () => screen.getByRole('button', BOTON)
const txt = () => document.body.textContent
const escribeNombre = (v) => fireEvent.change(document.querySelector('.helm-onb-q input.helm-input'), { target: { value: v } })

beforeEach(() => {
  h.rows.clear(); h.biblias.clear(); h.calls.length = 0; h.st.failOn = null
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('el alta, único onboarding', () => {
  it('el hub solo ofrece el alta y Conexiones', async () => {
    render(<Onboarding clientId="c0" />)
    await screen.findByText('Alta en HELM')
    expect(txt()).toContain('Conexiones')
    expect(txt()).not.toContain('Operativo profundo')
    expect(txt()).not.toContain('Próximamente')
  })

  it('perfil nuevo: rellena, genera las dos, abre la carpeta y el hub enseña la Biblia', async () => {
    render(<Onboarding clientId="c1" />)
    fireEvent.click(await screen.findByText('Empezar'))
    await screen.findByRole('button', BOTON)
    escribeNombre('Muny')
    fireEvent.click(boton())
    await screen.findByText('Generada por IA')
    const r = h.rows.get(h.key('c1', 'alta'))
    expect(r.status).toBe('completed')
    expect(r.completed_at).toBeFalsy()
    expect(h.calls.map(c => [c.kind, c.form])).toEqual([['empresa', 'alta'], ['contenido', 'alta']])
    expect(h.calls[0].dossier).toContain('Muny')
    fireEvent.click(screen.getByText('Volver'))
    await screen.findByText('Abrir Biblia')
    expect(txt()).toContain('Biblia generada.')
    expect(txt()).toContain('Completado')
  })

  it('si la IA falla (402), el alta sigue abierta y el reintento funciona', async () => {
    render(<Onboarding clientId="c2" />)
    fireEvent.click(await screen.findByText('Empezar'))
    await screen.findByRole('button', BOTON)
    escribeNombre('Muny')
    h.st.failOn = 'contenido'
    fireEvent.click(boton())
    await screen.findByText('Sin saldo')
    expect(h.rows.get(h.key('c2', 'alta')).status).toBe('draft')
    h.st.failOn = null
    fireEvent.click(boton())
    await screen.findByText('Generada por IA')
    expect(txt()).not.toContain('Mientras tenías esto abierto')
    expect(h.rows.get(h.key('c2', 'alta')).status).toBe('completed')
  })

  it('un retoque después de un fallo se guarda', async () => {
    render(<Onboarding clientId="c2b" />)
    fireEvent.click(await screen.findByText('Empezar'))
    await screen.findByRole('button', BOTON)
    escribeNombre('Muny')
    h.st.failOn = 'empresa'
    fireEvent.click(boton())
    await screen.findByText('Sin saldo')
    escribeNombre('Muny joyas')
    await waitFor(() => expect(h.rows.get(h.key('c2b', 'alta')).answers.nombre).toBe('Muny joyas'), { timeout: 3000 })
    expect(txt()).not.toContain('Mientras tenías esto abierto')
  })

  it('el cliente ya la envió: el hub avisa de que falta la Biblia y generar conserva completed_at', async () => {
    h.rows.set(h.key('c3', 'alta'), { client_id: 'c3', form: 'alta', answers: { nombre: 'Muny', que_haces: 'Joyas' }, status: 'completed', completed_at: '2026-10-10T09:00:00.000Z', updated_at: '2026-10-10T09:00:00.000Z' })
    render(<Onboarding clientId="c3" />)
    await screen.findByText(/Enviado/)
    await screen.findByText('Falta generar la Biblia')
    fireEvent.click(screen.getByText('Generar la Biblia'))
    fireEvent.click(await screen.findByRole('button', BOTON))
    await screen.findByText('Generada por IA')
    const r = h.rows.get(h.key('c3', 'alta'))
    expect(r.completed_at).toBe('2026-10-10T09:00:00.000Z')
    expect(r.status).toBe('completed')
  })

  it('perfil antiguo con contenido: genera con el alta y el contenido, y pregunta antes de pisar una editada', async () => {
    h.rows.set(h.key('c4', 'contenido'), { client_id: 'c4', form: 'contenido', answers: { marca: 'MARCA_ANTIGUA' }, status: 'completed', completed_at: 'x', updated_at: 'x' })
    h.biblias.set('c4', { empresa: { kind: 'empresa', title: 'Biblia de Empresa', content: 'editada a mano', status: 'edited' } })
    window.confirm.mockReturnValue(false)
    render(<Onboarding clientId="c4" />)
    fireEvent.click(await screen.findByText('Empezar'))
    await screen.findByRole('button', BOTON)
    escribeNombre('Muny')
    fireEvent.click(boton())
    await waitFor(() => expect(window.confirm).toHaveBeenCalled())
    expect(h.calls.length).toBe(0)
    expect(h.rows.get(h.key('c4', 'alta')).status).toBe('draft')

    window.confirm.mockReturnValue(true)
    fireEvent.click(boton())
    await screen.findByText('Generada por IA')
    expect(h.calls[0].dossier).toContain('MARCA_ANTIGUA')
    expect(h.calls[0].dossier).toContain('Muny')
  })

  it('alta vacía: no se genera ni se da por completada', async () => {
    render(<Onboarding clientId="c5" />)
    fireEvent.click(await screen.findByText('Empezar'))
    fireEvent.click(await screen.findByRole('button', BOTON))
    await screen.findByText(/Responde al menos una pregunta/)
    expect(h.calls.length).toBe(0)
    expect(h.rows.get(h.key('c5', 'alta'))?.status).not.toBe('completed')
  })

  it('carpeta Biblia: regenerar con solo contenido, con los dos y con ninguno', async () => {
    h.rows.set(h.key('c6', 'contenido'), { client_id: 'c6', form: 'contenido', answers: { marca: 'MARCA_ANTIGUA' }, status: 'completed', completed_at: 'x', updated_at: 'x' })
    h.biblias.set('c6', { empresa: { kind: 'empresa', content: 'vieja', status: 'generated' } })
    render(<Onboarding clientId="c6" />)
    fireEvent.click(await screen.findByText('Abrir Biblia'))
    fireEvent.click(await screen.findByText('Regenerar'))
    await waitFor(() => expect(h.calls.length).toBe(1))
    expect(h.calls[0]).toMatchObject({ kind: 'empresa', form: 'biblia' })
    expect(h.calls[0].dossier).toContain('MARCA_ANTIGUA')
    cleanup()

    h.rows.set(h.key('c6', 'alta'), { client_id: 'c6', form: 'alta', answers: { nombre: 'Muny' }, status: 'draft', updated_at: 'y' })
    render(<Onboarding clientId="c6" />)
    fireEvent.click(await screen.findByText('Abrir Biblia'))
    fireEvent.click(await screen.findByText('Regenerar'))
    await waitFor(() => expect(h.calls.length).toBe(2))
    expect(h.calls[1].dossier).toContain('MARCA_ANTIGUA')
    expect(h.calls[1].dossier).toContain('Muny')
    cleanup()

    h.biblias.set('c7', { empresa: { kind: 'empresa', content: 'vieja', status: 'generated' } })
    render(<Onboarding clientId="c7" />)
    fireEvent.click(await screen.findByText('Abrir Biblia'))
    fireEvent.click(await screen.findByText('Regenerar'))
    await screen.findByText(/El alta está vacía/)
  })
})
