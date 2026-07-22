// api/_lib/passwords.js
// Helper compartido para hashing y verificación de contraseñas.
//
// Formato del hash (en columna password_hash de team / superadmins):
//   scrypt:<salt_hex>:<hash_hex>
//
// El proyecto está en migración (BUG-002): hay rows con password en plano y
// rows con password_hash. verifyPassword soporta ambos formatos para que el
// login no se rompa durante la transición.

import crypto from 'node:crypto'

const SCRYPT_KEYLEN = 64
const SCRYPT_SALT_BYTES = 16

/**
 * Genera un hash scrypt de la contraseña.
 * @param {string} plain
 * @returns {string} `scrypt:<salt_hex>:<hash_hex>`
 */
export function hashPassword(plain) {
  if (!plain || typeof plain !== 'string') {
    throw new Error('hashPassword: plain string requerido')
  }
  const salt = crypto.randomBytes(SCRYPT_SALT_BYTES)
  const hash = crypto.scryptSync(plain, salt, SCRYPT_KEYLEN)
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`
}

/**
 * Verifica una contraseña contra un row que puede tener password_hash
 * (formato scrypt:salt:hash) o password (plano legacy).
 * @param {string} plain
 * @param {object} row
 * @returns {boolean}
 */
export function verifyPassword(plain, row) {
  if (!plain || !row) return false

  const stored = row.password_hash || row.passwordHash
  if (stored && typeof stored === 'string' && stored.startsWith('scrypt:')) {
    const [, saltHex, hashHex] = stored.split(':')
    if (!saltHex || !hashHex) return false
    const salt = Buffer.from(saltHex, 'hex')
    const expected = Buffer.from(hashHex, 'hex')
    const actual = crypto.scryptSync(plain, salt, expected.length)
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
  }

  if (row.password && typeof row.password === 'string') {
    const a = Buffer.from(plain)
    const b = Buffer.from(row.password)
    return a.length === b.length && crypto.timingSafeEqual(a, b)
  }

  return false
}
