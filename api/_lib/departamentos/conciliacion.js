// HELM — la conciliación del departamento de Finanzas.
//
// Cruza las VENTAS (sales) con los APUNTES de Finanzas (ceo_finance_entries)
// para cazar lo que no cuadra, y por cada caso deja una propuesta en la bandeja
// con su porqué. Nunca borra ni reescribe las cuentas: no hay escritura para
// deshacer un cobro, así que casi todo se propone como NOTA PARA REVISAR
// (propuesta sin herramienta: aprobar = darla por revisada). Solo cuando la
// corrección es clara y segura (un pago con contacto pero sin venta) deja una
// nota en la ficha del CRM con crm_nota.
//
// Cuatro cosas que mira (con las columnas reales, sin inventar nada):
//   1. Ventas duplicadas   — dos ventas del mismo cliente, mismo importe y el
//                            mismo día (o casi): un doble registro / doble
//                            importación.
//   2. Apuntes duplicados  — dos apuntes de Finanzas iguales (categoría,
//                            importe, concepto) el mismo día: un cobro apuntado
//                            dos veces.
//   3. Venta sin cobro      — una venta de pago único, no cancelada, con importe
//                            pero cash_collected a 0: marcada como vendida y sin
//                            cobro registrado.
//   4. Pago sin venta       — un Ingreso de Finanzas atado a un contacto que no
//                            tiene ninguna venta: dinero apuntado sin su venta.
//
// Para no revisar años de historia, solo mira lo reciente (config.dias_atras,
// 120 por defecto) y como mucho config.max casos por pasada.

// ── Cálculo puro (el día es el de Madrid, como api/_lib/bot/comun.js) ────────
const fmtMadrid = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' })
const hoyMadrid = (d = new Date()) => fmtMadrid.format(d)
const redondea = (n) => Math.round((Number(n) || 0) * 100) / 100
const euros = (n) => `${new Intl.NumberFormat('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(redondea(n))} €`
const masDias = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const diasEntre = (a, b) => Math.abs(Math.round((new Date(`${a}T12:00:00Z`) - new Date(`${b}T12:00:00Z`)) / 86_400_000))
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

const cancelada = (v) => String(v?.status || '').toLowerCase().trim() === 'cancelada'
const esFraccionado = (v) => (Number(v?.installments_total) || 0) > 0
// Una clave de agrupación estable a partir de unos ids (para no proponer dos
// veces el mismo caso aunque cambie el orden).
const claveIds = (ids) => [...ids].sort().join('_')

export default {
  key: 'conciliacion',
  departamento: 'finanzas',

  async corre(ctx) {
    const { supabase, clientId, config = {} } = ctx
    const hoy = hoyMadrid(ctx.hoy || new Date())
    const desde = masDias(hoy, -(Number.isFinite(config.dias_atras) ? config.dias_atras : 120))
    const tope = Number.isFinite(config.max) ? config.max : 30
    const margenDias = Number.isFinite(config.margen_dias) ? config.margen_dias : 1   // «el mismo día o casi»

    const [{ data: ventasRaw, error: eV }, { data: apuntesRaw, error: eA }] = await Promise.all([
      supabase.from('sales')
        .select('id, date, client_name, client_email, product, revenue, cash_collected, status, installments_total, contact_id')
        .eq('client_id', clientId).gte('date', desde).limit(5000),
      supabase.from('ceo_finance_entries')
        .select('id, date, category, description, amount, notes, person_name, contact_ids')
        .eq('client_id', clientId).gte('date', desde).limit(5000),
    ])
    if (eV) throw eV
    if (eA) throw eA

    const ventas = (ventasRaw || []).filter(v => !cancelada(v))
    const apuntes = apuntesRaw || []

    let propuestas = 0
    const cuenta = { ventas_dup: 0, apuntes_dup: 0, sin_cobro: 0, pago_sin_venta: 0 }
    const propon = async (p) => {
      if (propuestas >= tope) return null
      const r = await ctx.proponer(p); if (r) propuestas++; return r
    }

    // ── 1) Ventas duplicadas ───────────────────────────────────────────────
    // Mismo cliente (email o nombre), mismo importe, a ≤ margen días.
    const porCliente = new Map()
    for (const v of ventas) {
      const quien = norm(v.client_email) || norm(v.client_name)
      if (!quien || !(Number(v.revenue) > 0)) continue
      const k = `${quien}|${redondea(v.revenue)}`
      ;(porCliente.get(k) || porCliente.set(k, []).get(k)).push(v)
    }
    for (const grupo of porCliente.values()) {
      if (grupo.length < 2) continue
      // Se juntan las que caen a ≤ margen días entre sí.
      const orden = [...grupo].sort((a, b) => String(a.date).localeCompare(String(b.date)))
      for (let i = 0; i < orden.length - 1; i++) {
        const a = orden[i]; const b = orden[i + 1]
        if (diasEntre(a.date, b.date) > margenDias) continue
        const r = await propon({
          clave: `conciliacion:venta-dup:${claveIds([a.id, b.id])}`,
          titulo: `Posible venta duplicada: ${a.client_name || a.client_email || 'cliente'} — ${euros(a.revenue)}`,
          porque: `Dos ventas del mismo cliente por ${euros(a.revenue)} a un día o menos: ${a.date} (${a.product || 'sin producto'}) y ${b.date} (${b.product || 'sin producto'}). ` +
            `Revisa si es un doble registro; si lo es, deja solo una en Ventas.`,
          datos: { tipo: 'venta_duplicada', ventas: [a.id, b.id], importe: redondea(a.revenue) },
        })
        if (r) cuenta.ventas_dup++
      }
    }

    // ── 2) Apuntes de Finanzas duplicados ──────────────────────────────────
    // Misma categoría, mismo importe, mismo concepto y a ≤ margen días. Los
    // Ingresos de cuota llevan notes «telegram:<venta>:<mes>» y no se duplican
    // entre sí (la escritura lo impide), pero un apunte a mano sí puede repetir.
    const porApunte = new Map()
    for (const e of apuntes) {
      const k = `${norm(e.category)}|${redondea(e.amount)}|${norm(e.description)}`
      ;(porApunte.get(k) || porApunte.set(k, []).get(k)).push(e)
    }
    for (const grupo of porApunte.values()) {
      if (grupo.length < 2) continue
      const orden = [...grupo].sort((a, b) => String(a.date).localeCompare(String(b.date)))
      for (let i = 0; i < orden.length - 1; i++) {
        const a = orden[i]; const b = orden[i + 1]
        if (diasEntre(a.date, b.date) > margenDias) continue
        const r = await propon({
          clave: `conciliacion:apunte-dup:${claveIds([a.id, b.id])}`,
          titulo: `Apunte de Finanzas repetido: ${a.category} ${euros(a.amount)}`,
          porque: `Dos apuntes iguales en Finanzas (${a.category}, ${euros(a.amount)}${a.description ? `, «${a.description}»` : ''}) el ${a.date} y el ${b.date}. ` +
            `Si es el mismo cobro apuntado dos veces, borra uno en Finanzas.`,
          datos: { tipo: 'apunte_duplicado', apuntes: [a.id, b.id], importe: redondea(a.amount) },
        })
        if (r) cuenta.apuntes_dup++
      }
    }

    // ── 3) Ventas de pago único sin cobro registrado ───────────────────────
    for (const v of ventas) {
      if (propuestas >= tope) break
      if (esFraccionado(v)) continue   // el cobrador ya persigue las cuotas
      const facturado = Number(v.revenue) || 0
      const cobrado = Number(v.cash_collected) || 0
      if (facturado <= 0 || cobrado > 0) continue
      const r = await propon({
        clave: `conciliacion:sin-cobro:${v.id}`,
        titulo: `Venta sin cobro: ${v.client_name || 'cliente'} — ${euros(facturado)}`,
        porque: `La venta de ${v.product || 'sin producto'} (${v.date}) por ${euros(facturado)} figura con 0 € cobrados. ` +
          `Comprueba si se cobró y no se apuntó, o si todavía está por cobrar.`,
        datos: { tipo: 'venta_sin_cobro', venta: v.id, importe: facturado },
      })
      if (r) cuenta.sin_cobro++
    }

    // ── 4) Pagos (Ingresos) atados a un contacto sin ninguna venta ─────────
    const contactosConVenta = new Set(ventas.map(v => v.contact_id).filter(Boolean))
    for (const e of apuntes) {
      if (propuestas >= tope) break
      if (norm(e.category) !== 'ingreso' || !(Number(e.amount) > 0)) continue
      const ids = Array.isArray(e.contact_ids) ? e.contact_ids.filter(Boolean) : []
      if (ids.length !== 1) continue          // con varios o ninguno no está claro de quién es
      const contacto = ids[0]
      if (contactosConVenta.has(contacto)) continue
      const r = await propon({
        clave: `conciliacion:pago-sin-venta:${e.id}`,
        titulo: `Ingreso sin venta: ${euros(e.amount)} del ${e.date}`,
        porque: `Hay un Ingreso de ${euros(e.amount)} (${e.date}${e.description ? `, «${e.description}»` : ''}) atado a un contacto que no tiene ninguna venta registrada. ` +
          `Revisa si falta registrar su venta en Ventas.`,
        // Corrección clara y segura: dejar constancia en la ficha del contacto.
        herramienta: 'crm_nota',
        input: {
          contacto,
          titulo: 'Revisar: ingreso sin venta',
          texto: `Finanzas tiene un Ingreso de ${euros(e.amount)} del ${e.date}${e.description ? ` («${e.description}»)` : ''} a su nombre, pero no hay venta registrada. Revisar si falta darla de alta en Ventas.`,
        },
        datos: { tipo: 'pago_sin_venta', apunte: e.id, contacto, importe: redondea(e.amount) },
      })
      if (r) cuenta.pago_sin_venta++
    }

    const partes = [
      cuenta.ventas_dup && `${cuenta.ventas_dup} venta(s) duplicada(s)`,
      cuenta.apuntes_dup && `${cuenta.apuntes_dup} apunte(s) repetido(s)`,
      cuenta.sin_cobro && `${cuenta.sin_cobro} venta(s) sin cobro`,
      cuenta.pago_sin_venta && `${cuenta.pago_sin_venta} ingreso(s) sin venta`,
    ].filter(Boolean)
    const resumen = partes.length ? `Conciliación: ${partes.join(', ')}.` : 'Conciliación: las cuentas cuadran.'
    return { propuestas, resumen }
  },
}
