// Prefijos telefónicos para el selector de la P4.
//
// No es la lista completa de la ISO: es a quién le vende Silvestre. España
// primero y por defecto, después LatAm y la Europa de habla no española, que es
// de donde llega el resto. Si algún día hace falta un país que no está, se
// añade aquí y ya.
export const PAISES = [
  { code: 'ES', dial: '+34', label: 'España', flag: '🇪🇸' },
  { code: 'MX', dial: '+52', label: 'México', flag: '🇲🇽' },
  { code: 'AR', dial: '+54', label: 'Argentina', flag: '🇦🇷' },
  { code: 'CO', dial: '+57', label: 'Colombia', flag: '🇨🇴' },
  { code: 'CL', dial: '+56', label: 'Chile', flag: '🇨🇱' },
  { code: 'PE', dial: '+51', label: 'Perú', flag: '🇵🇪' },
  { code: 'EC', dial: '+593', label: 'Ecuador', flag: '🇪🇨' },
  { code: 'UY', dial: '+598', label: 'Uruguay', flag: '🇺🇾' },
  { code: 'PY', dial: '+595', label: 'Paraguay', flag: '🇵🇾' },
  { code: 'BO', dial: '+591', label: 'Bolivia', flag: '🇧🇴' },
  { code: 'VE', dial: '+58', label: 'Venezuela', flag: '🇻🇪' },
  { code: 'CR', dial: '+506', label: 'Costa Rica', flag: '🇨🇷' },
  { code: 'PA', dial: '+507', label: 'Panamá', flag: '🇵🇦' },
  { code: 'DO', dial: '+1', label: 'Rep. Dominicana', flag: '🇩🇴' },
  { code: 'GT', dial: '+502', label: 'Guatemala', flag: '🇬🇹' },
  { code: 'US', dial: '+1', label: 'Estados Unidos', flag: '🇺🇸' },
  { code: 'PT', dial: '+351', label: 'Portugal', flag: '🇵🇹' },
  { code: 'FR', dial: '+33', label: 'Francia', flag: '🇫🇷' },
  { code: 'IT', dial: '+39', label: 'Italia', flag: '🇮🇹' },
  { code: 'DE', dial: '+49', label: 'Alemania', flag: '🇩🇪' },
  { code: 'GB', dial: '+44', label: 'Reino Unido', flag: '🇬🇧' },
  { code: 'IE', dial: '+353', label: 'Irlanda', flag: '🇮🇪' },
  { code: 'NL', dial: '+31', label: 'Países Bajos', flag: '🇳🇱' },
  { code: 'BE', dial: '+32', label: 'Bélgica', flag: '🇧🇪' },
  { code: 'CH', dial: '+41', label: 'Suiza', flag: '🇨🇭' },
  { code: 'AD', dial: '+376', label: 'Andorra', flag: '🇦🇩' },
  { code: 'MA', dial: '+212', label: 'Marruecos', flag: '🇲🇦' },
]

export const PAIS_DEFECTO = PAISES[0]

// El número de dígitos varía mucho por país (9 en España, 10 en México), así
// que aquí solo se comprueba que haya un número plausible: validar de más en un
// formulario de captación cuesta leads reales.
export const telefonoValido = (n) => /^[0-9][0-9\s().-]{5,17}$/.test(String(n || '').trim())
