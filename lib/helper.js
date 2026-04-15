'use strict'

const hasText = (value) => typeof value === 'string' && value.trim().length > 0

const slugify = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const toFiniteNumber = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (!hasText(value)) return null

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const normalizeLookupText = (value) =>
  String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s"'`'{}<>-_.:;!?/|,+@#$%^&*=]+/g, '')
    .trim()

const sanitizeLookupValue = (value) => {
  if (!hasText(value)) return ''

  const rawValue = value.trim()
  const sanitized = rawValue
    .replace(/^[\s"'`'{"[(\-_<]/, '')
    .replace(/[\s"'`'")}\-_"'.]+$/, '')
    .trim()

  return hasText(sanitized) ? sanitized : rawValue
}

const pickField = (source, keys) => {
  if (!source || typeof source !== 'object') return ''

  for (const key of keys) {
    if (hasText(source[key])) return source[key].trim()
  }

  return ''
}

const parseDateLabel = (value) => {
  if (!hasText(value)) return null

  const match = value.trim().match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))

  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  return date
}

const getPlatformConfig = (entry) => {
  if (!entry || !entry.platform || typeof entry.platform !== 'object') return null

  const { platform } = entry
  const platformId = hasText(platform.id) || typeof platform.id === 'number' ? String(platform.id).trim() : ''
  if (!hasText(platform.server) || !hasText(platform.type) || !platformId) return null

  return {
    server: platform.server.trim(),
    type: platform.type.trim(),
    id: platformId,
    api: hasText(platform.api) ? platform.api.trim() : '',
    auth: hasText(platform.auth) ? platform.auth.trim() : ''
  }
}

module.exports = {
  hasText,
  slugify,
  toFiniteNumber,
  normalizeLookupText,
  sanitizeLookupValue,
  pickField,
  parseDateLabel,
  getPlatformConfig
}