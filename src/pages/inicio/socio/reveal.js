import { useEffect } from 'react'

// Aparición suave al hacer scroll: todo lo que lleve `data-reveal` entra con
// un fundido hacia arriba la primera vez que se ve. Sin librería: un solo
// IntersectionObserver. Con "reducir movimiento" activado, el CSS lo anula.
export function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('[data-reveal]')
    if (!('IntersectionObserver' in window)) {
      els.forEach(el => el.classList.add('visto'))
      return
    }
    const io = new IntersectionObserver((entradas) => {
      for (const e of entradas) {
        if (e.isIntersecting) { e.target.classList.add('visto'); io.unobserve(e.target) }
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 })
    els.forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [])
}

// El botón fijo del móvil: sale cuando el hero ya no se ve y se esconde en
// cuanto el formulario entra en pantalla (ahí sobra: ya estás donde lleva).
export function useBotonFijo(setVisible) {
  useEffect(() => {
    const hero = document.getElementById('so-hero')
    const form = document.getElementById('auditoria')
    const cierre = document.getElementById('so-cierre')
    if (!hero || !form || !('IntersectionObserver' in window)) return
    const estado = { hero: true, form: false, cierre: false }
    const io = new IntersectionObserver((entradas) => {
      for (const e of entradas) {
        if (e.target === hero) estado.hero = e.isIntersecting
        if (e.target === form) estado.form = e.isIntersecting
        if (e.target === cierre) estado.cierre = e.isIntersecting
      }
      setVisible(!estado.hero && !estado.form && !estado.cierre)
    })
    io.observe(hero); io.observe(form); if (cierre) io.observe(cierre)
    return () => io.disconnect()
  }, [setVisible])
}
