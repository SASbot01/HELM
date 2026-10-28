// api/_lib/passwords.js
// Helper compartido para hashing y verificación de contraseñas.
//
// Formato del hash (en columna password_hash de team / superadmins):
//   scrypt:<salt_hex>:<hash_hex>
//
// Solo se aceptan contraseñas con hash. La migración de las antiguas en plano
// terminó (0 filas el 2026-10-12) y la columna `password` se borra en
// migrations/100_fuera_password_en_claro.sql: aceptarlas era dejar abierta
// una puerta para cualquier fila que alguien escribiera a mano sin hash.

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
 * Verifica una contraseña contra el password_hash (scrypt:salt:hash) de un row.
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

  return false
}
