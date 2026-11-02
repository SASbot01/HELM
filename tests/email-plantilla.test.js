// Email marketing · la plantilla (api/_lib/email/plantilla.js): el formato
// mínimo sale como HTML, las variables con su valor por defecto, y lo que trae
// un nombre del CRM (que lo escribe cualquiera en un formulario) nunca se
// convierte en HTML ni en un enlace. Cada correo lleva el pie legal y las
// cabeceras de baja de un clic, y sale igual byte a byte en cada repetición.
import { describe, it, expect } from 'vitest'
import {
  cuerpoHtml, cuerpoTexto, componerCorreo, cargaResend, remitenteDe, rellena, valoresDe, variablesDesconocidas,
} from '../api/_lib/email/plantilla.js'

const REMITENTE = { nombre: 'Ana de Acme', email: 'hola@acme.es', responderA: 'ana@acme.es', empresa: 'Acme S.L.', direccion: 'Calle Mayor 1, Lorca' }
const MALO = '<img src=x onerror="alert(1)"> [pincha](https://evil.example) **Ana**'
const BAJA = 'https://helm.s4sf.net/api/email-baja?t=abc.def'

describe('plantilla · formato', () => {
  it('negrita, cursiva, enlaces, URL sueltas, listas, titulares y párrafos', () => {
    const html = cuerpoHtml('# Hola\n\nEsto es **clave** y *bonito*: [la web](https://acme.es/precios) o https://acme.es/x_y.\nOtra línea\n- uno\n- dos', {})
    expect(html).toContain('<h2')
    expect(html).toContain('<strong>clave</strong>')
    expect(html).toContain('<em>bonito</em>')
    expect(html).toContain('<a href="https://acme.es/precios"')
    expect(html).toContain('>la web</a>')
    expect(html).toContain('<a href="https://acme.es/x_y"')
    expect(html).toContain('Otra línea')
    expect(html).toMatch(/<br>Otra línea<\/p>/)
    expect(html).toMatch(/<ul[^>]*><li[^>]*>uno<\/li><li[^>]*>dos<\/li><\/ul>/)
  })

  it('el HTML que escribe el dueño se escapa y los enlaces raros no se enlazan', () => {
    const html = cuerpoHtml('<script>alert(1)</script> [x](javascript:alert(1)) [y](data:text/html,hola) "comillas" & más', {})
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toMatch(/href="(javascript|data):/i)
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&quot;comillas&quot; &amp; más')
  })

  it('un nombre con HTML o con formato entra como texto, también dentro de un enlace (codificado)', () => {
    const v = valoresDe({ nombre: MALO, email: 'a@b.es' }, REMITENTE)
    const html = cuerpoHtml('Hola {{nombre}}, **mira** [esto](https://acme.es/?n={{primer_nombre}}) y [hueco]({{nombre}})', v)
    expect(html).not.toMatch(/<img/i)
    expect(html).not.toContain('href="https://evil.example"')
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt; [pincha](https://evil.example) **Ana**')
    // El primer nombre («<img») va codificado en la URL, no como HTML.
    expect(html).toContain('href="https://acme.es/?n=%3Cimg"')
    // Una variable no puede ser el destino de un enlace.
    expect(html.match(/<a /g)).toHaveLength(1)
    // Y el formato del dueño sigue funcionando.
    expect(html).toContain('<strong>mira</strong>')
  })

  it('las variables con su valor por defecto cuando falta el dato', () => {
    const v = valoresDe({ nombre: '  ana   maría  ', email: 'ana@b.es' }, { empresa: 'Acme' })
    expect(rellena('{{primer_nombre|amigo}} · {{nombre}} · {{email}} · {{empresa}}', v)).toBe('ana · ana maría · ana@b.es · Acme')
    expect(rellena('Hola {{ primer_nombre | amigo }}', valoresDe({ nombre: '' }))).toBe('Hola amigo')
    expect(rellena('Hola {{nombre}}', valoresDe({}))).toBe('Hola')
  })

  it('avisa de las variables que no existen (y no se las inventa al mandar)', () => {
    expect(variablesDesconocidas('Hola {{nombre}} y {{apellido}} y {{Empresa}}')).toEqual(['apellido'])
    expect(rellena('Hola {{apellido}}', valoresDe({ nombre: 'Ana' }))).toBe('Hola {{apellido}}')
  })

  it('el asunto es una línea: sin saltos que rompan la cabecera', () => {
    expect(rellena('Hola\r\n{{nombre}}\nBcc: x@y.z', valoresDe({ nombre: 'Ana\r\nBcc: otro@x.es' }))).toBe('Hola Ana Bcc: otro@x.es Bcc: x@y.z')
  })

  it('el texto plano: sin marcas de formato y con los enlaces a la vista', () => {
    const t = cuerpoTexto('Hola {{nombre}}, **mira** [la web](https://acme.es/?n={{primer_nombre}})', valoresDe({ nombre: '**Ana** López' }))
    expect(t).toBe('Hola **Ana** López, mira la web (https://acme.es/?n=**Ana**)')
  })
})

describe('plantilla · el correo entero', () => {
  const mensaje = { asunto: '{{primer_nombre|Hola}}, una cosa', cuerpo: 'Hola {{nombre|}}\n\nTe escribo por…' }

  it('lleva el pie legal (empresa, dirección y enlace de baja) en HTML y en texto', () => {
    const c = componerCorreo({ mensaje, persona: { nombre: 'Ana', email: 'ana@b.es' }, remitente: REMITENTE, enlaceBaja: BAJA })
    expect(c.subject).toBe('Ana, una cosa')
    expect(c.html).toContain('<strong>Acme S.L.</strong> · Calle Mayor 1, Lorca')
    expect(c.html).toContain(`href="${BAJA}"`)
    expect(c.html).toContain('date de baja aquí')
    expect(c.text).toContain('Recibes este correo de Acme S.L. · Calle Mayor 1, Lorca.')
    expect(c.text).toContain(`date de baja aquí: ${BAJA}`)
  })

  it('las cabeceras de baja de un clic (RFC 8058), el remitente y responder a', () => {
    const compuesto = componerCorreo({ mensaje, persona: { email: 'ana@b.es' }, remitente: REMITENTE, enlaceBaja: BAJA })
    const carga = cargaResend({ compuesto, para: 'ana@b.es', remitente: REMITENTE, enlaceBaja: BAJA, etiquetas: { helm_campana: 'c-1', helm_envio: 7 } })
    expect(carga.headers).toEqual({ 'List-Unsubscribe': `<${BAJA}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' })
    expect(carga.from).toBe('"Ana de Acme" <hola@acme.es>')
    expect(carga.to).toEqual(['ana@b.es'])
    expect(carga.reply_to).toBe('ana@acme.es')
    expect(carga.tags).toEqual([{ name: 'helm_campana', value: 'c-1' }, { name: 'helm_envio', value: '7' }])
    expect(compuesto.subject).toBe('Hola, una cosa')
  })

  it('un nombre de remitente con comillas o saltos no rompe la cabecera From', () => {
    expect(remitenteDe({ nombre: 'Ana "la jefa"\r\nBcc: x@y.es <z>', email: 'hola@acme.es' })).toBe('"Ana la jefa Bcc: x@y.es z" <hola@acme.es>')
    expect(remitenteDe({ nombre: '', email: 'hola@acme.es' })).toBe('hola@acme.es')
  })

  it('sale igual cada vez (la Idempotency-Key de Resend exige el mismo cuerpo)', () => {
    const una = () => JSON.stringify(cargaResend({
      compuesto: componerCorreo({ mensaje, persona: { nombre: 'Ana', email: 'ana@b.es' }, remitente: REMITENTE, enlaceBaja: BAJA }),
      para: 'ana@b.es', remitente: REMITENTE, enlaceBaja: BAJA, etiquetas: { helm_envio: 1 },
    }))
    expect(una()).toBe(una())
  })
})
