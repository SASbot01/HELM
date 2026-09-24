import { useState, forwardRef } from 'react'
import { Eye, EyeOff } from 'lucide-react'

const toggleBtnStyle = {
  position: 'absolute',
  top: '50%',
  right: 8,
  transform: 'translateY(-50%)',
  background: 'transparent',
  border: 'none',
  padding: 6,
  cursor: 'pointer',
  // Del token, no a pelo: con el color escrito en blanco el ojo desaparecía
  // sobre las superficies claras y el campo parecía estar cortado.
  color: 'var(--text-secondary)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 6,
}

const PasswordInput = forwardRef(function PasswordInput(
  {
    value,
    onChange,
    placeholder,
    required,
    minLength,
    autoComplete = 'current-password',
    disabled,
    className,
    style,
    inputStyle,
    name,
    id,
    onBlur,
    onKeyDown,
    iconColor,
    ...rest
  },
  ref,
) {
  const [shown, setShown] = useState(false)

  const computedInputStyle = {
    // El input tiene que ocupar el contenedor entero: si no, se queda con su
    // ancho por defecto y el botón del ojo —que va posicionado contra el
    // contenedor— aparece flotando fuera del campo.
    width: '100%',
    ...(inputStyle || {}),
    paddingRight: 40,
  }

  return (
    <div
      className={className}
      style={{ position: 'relative', display: 'block', width: '100%', ...(style || {}) }}
    >
      <input
        ref={ref}
        type={shown ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        disabled={disabled}
        name={name}
        id={id}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        style={computedInputStyle}
        {...rest}
      />
      <button
        type="button"
        onClick={() => setShown(s => !s)}
        aria-label={shown ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        title={shown ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        tabIndex={-1}
        style={{ ...toggleBtnStyle, color: iconColor || toggleBtnStyle.color }}
      >
        {shown ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  )
})

export default PasswordInput
