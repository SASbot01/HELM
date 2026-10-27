// HELM — por dónde se nos escribe desde el panel.
//
// Lo que aún no puede hacer el cliente solo (conectar su Instagram, por ahora)
// se pide por mensaje directo. El usuario vive aquí y en ningún otro sitio: si
// cambia la cuenta, se cambia una línea y no cinco pantallas.
//
// Ojo, es «silvesttre» con dos t y acaba en «.ai»: es la cuenta que ya usan la
// web de AI para todo y las clases. «silvesttre.ia» no existe: lo que se
// escribiera ahí no le llegaría a nadie.
export const INSTAGRAM_CONTACTO = 'silvesttre.ai'

/** El perfil de Instagram de un usuario, listo para un enlace. */
export const enlaceInstagram = (usuario = INSTAGRAM_CONTACTO) =>
  `https://www.instagram.com/${String(usuario).replace(/^@/, '')}/`
