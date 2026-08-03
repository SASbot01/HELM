// HELM — la cabecera con el logo y el nombre del perfil.
//
// Misma forma en el portal de la comunidad y en el formulario público: para
// quien las ve, las dos páginas son de la misma casa, porque lo son.
//
// El hook que reescribe la pestaña y el favicon vive en marcaPestana.js — aquí
// solo el componente, que es lo que pide el recargado en caliente.
export function Marca({ marca }) {
  if (!marca?.nombre) return null
  return (
    <div className="helm-portal-marca">
      {marca.logo
        ? <img src={marca.logo} alt="" />
        : <div className="helm-portal-ini">{marca.nombre[0].toUpperCase()}</div>}
      <div>
        <b>{marca.nombre}</b>
        {marca.subtitulo && <span>{marca.subtitulo}</span>}
      </div>
    </div>
  )
}
