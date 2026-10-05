// Tema oscuro forzado antes de que React pinte (evita el FOUC claro). Va en un
// archivo y no en línea en index.html: la CSP no deja ejecutar scripts en línea.
try {
  if (localStorage.getItem('blackwolf-theme') === 'light') {
    localStorage.removeItem('blackwolf-theme');
  }
} catch (e) {}
