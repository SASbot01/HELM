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
  color: 'rgba(255,255,255,0.55)',
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
