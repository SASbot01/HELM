// FILMMAKING PARA TODO — s4sf.net/filmmakingparatodo
//
// La comunidad de Detrás de Cámara (Abel Casal Díaz). La pinta el motor de
// las comunidades (src/pages/comunidad/Comunidad.jsx) con su configuración
// (./config.jsx); su contenido está en los archivos de esta carpeta.
import Comunidad from '../comunidad/Comunidad.jsx'
import FMPT from './config.jsx'
import '../../fonts/inter.css'
import './ddc.css'

export default function FilmmakingParaTodo() {
  return <Comunidad config={FMPT} />
}
