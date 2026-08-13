// HELM — el botón que lleva al Discord de una comunidad.
//
// Montar un chat en vivo dentro de HELM es un producto entero, y la gente ya
// está en Discord. Lo que faltaba no era el chat: era que el enlace estuviera
// donde se busca. Así que el enlace se guarda con el resto de la comunidad
// (helm_community.discord_url) y sale en los dos sitios donde alguien va a
// preguntar "¿dónde habláis?": el muro del panel y la página de los alumnos.
//
// La misma pieza en los dos lados a propósito: si el botón del dueño y el del
// alumno se escriben por separado, en tres meses dicen cosas distintas.

// El logotipo va inline y no como <img>: son 400 bytes y ahorra una petición a
// un dominio externo desde una página que se comparte con gente de fuera.
function MarcaDiscord({ size = 18 }) {
  return (
    <svg viewBox="0 0 127.14 96.36" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15ZM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69Zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69Z" />
    </svg>
  )
}

/**
 * @param {string} url        La invitación (https://discord.gg/...).
 * @param {string} nombre     Cómo se llama la comunidad, para el texto.
 * @param {boolean} compacto  En la página pública el bloque es la fila entera;
 *                            en el panel va dentro de una tarjeta y estorba.
 */
export default function BotonDiscord({ url, nombre, compacto = false }) {
  if (!url) return null

  return (
    <div className={'helm-discord' + (compacto ? ' compacto' : '')}>
      <div className="helm-discord-txt">
        <b><MarcaDiscord /> El chat está en Discord</b>
        {!compacto && (
          <span>
            La formación y los anuncios están aquí. Para hablar con
            {nombre ? ` ${nombre} ` : ' el resto '}
            en directo, entra al servidor.
          </span>
        )}
      </div>
      {/* noreferrer además de noopener: es un enlace a un sitio de fuera desde
          una página que puede tener el nombre del alumno en pantalla. */}
      <a className="helm-btn primary" href={url} target="_blank" rel="noopener noreferrer">
        <MarcaDiscord size={15} /> Entrar en Discord
      </a>
    </div>
  )
}
