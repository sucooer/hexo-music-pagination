'use strict'

const https = require('https')
const { hasText, toFiniteNumber, normalizeLookupText, sanitizeLookupValue, pickField, getPlatformConfig } = require('./helper')

const DEFAULT_LYRICS_API = 'https://lrclib.net/api/'
const DEFAULT_METING_API = 'https://api.injahow.cn/meting/?server=:server&type=:type&id=:id&r=:r'
const LYRICS_TIMEOUT_MS = 8000
const LYRICS_REDIRECT_LIMIT = 3

const lyricsRequestCache = new Map()
const platformMetadataCache = new Map()

const buildApiUrl = (pathname, params, baseUrl = DEFAULT_LYRICS_API) => {
  const url = new URL(pathname, baseUrl)

  Object.entries(params || {}).forEach(([key, value]) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      url.searchParams.set(key, String(value))
      return
    }

    if (hasText(value)) {
      url.searchParams.set(key, value.trim())
    }
  })

  return url
}

const requestJson = (url, redirectCount = 0) =>
  new Promise((resolve) => {
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }

    const request = https.request(
      url,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'identity',
          'User-Agent': 'hexo-music-pagination/1.0 (+https://lrclib.net/docs)'
        }
      },
      (response) => {
        const statusCode = response.statusCode || 0

        if (statusCode >= 300 && statusCode < 400 && response.headers.location && redirectCount < LYRICS_REDIRECT_LIMIT) {
          response.resume()
          finish(requestJson(new URL(response.headers.location, url), redirectCount + 1))
          return
        }

        if (statusCode < 200 || statusCode >= 300) {
          response.resume()
          finish(null)
          return
        }

        let rawBody = ''
        response.setEncoding('utf8')
        response.on('data', (chunk) => {
          rawBody += chunk
        })
        response.on('end', () => {
          try {
            finish(JSON.parse(rawBody))
          } catch (error) {
            finish(null)
          }
        })
      }
    )

    request.on('error', () => finish(null))
    request.setTimeout(LYRICS_TIMEOUT_MS, () => {
      request.destroy()
      finish(null)
    })
    request.end()
  })

const getSyncedLyrics = (candidate) => pickField(candidate, ['syncedLyrics', 'synced_lyrics'])

const scoreLyricsCandidate = (query, candidate) => {
  const syncedLyrics = getSyncedLyrics(candidate)
  if (!hasText(syncedLyrics)) return Number.NEGATIVE_INFINITY

  const candidateTitle = normalizeLookupText(pickField(candidate, ['trackName', 'track_name', 'name']))
  const candidateArtist = normalizeLookupText(pickField(candidate, ['artistName', 'artist_name']))
  const candidateAlbum = normalizeLookupText(pickField(candidate, ['albumName', 'album_name']))
  const queryTitle = normalizeLookupText(query.trackName)
  const queryArtist = normalizeLookupText(query.artistName)
  const queryAlbum = normalizeLookupText(query.albumName)
  const candidateDuration = toFiniteNumber(candidate.duration)

  let score = 0

  if (queryTitle && candidateTitle) {
    if (candidateTitle === queryTitle) score += 8
    else if (candidateTitle.includes(queryTitle) || queryTitle.includes(candidateTitle)) score += 4
  }

  if (queryArtist && candidateArtist) {
    if (candidateArtist === queryArtist) score += 7
    else if (candidateArtist.includes(queryArtist) || queryArtist.includes(candidateArtist)) score += 3
  }

  if (queryAlbum && candidateAlbum) {
    if (candidateAlbum === queryAlbum) score += 2
    else if (candidateAlbum.includes(queryAlbum) || queryAlbum.includes(candidateAlbum)) score += 1
  }

  if (Number.isFinite(query.duration) && Number.isFinite(candidateDuration)) {
    const diff = Math.abs(candidateDuration - query.duration)
    if (diff <= 1) score += 4
    else if (diff <= 3) score += 3
    else if (diff <= 5) score += 2
    else if (diff <= 10) score += 1
    else score -= Math.min(4, diff / 15)
  }

  return score
}

const pickBestLyricsCandidate = (query, payload) => {
  if (!payload) return null

  const candidates = Array.isArray(payload) ? payload : [payload]
  let bestCandidate = null
  let bestScore = Number.NEGATIVE_INFINITY

  candidates.forEach((candidate) => {
    const score = scoreLyricsCandidate(query, candidate)
    if (score > bestScore) {
      bestScore = score
      bestCandidate = candidate
    }
  })

  return hasText(getSyncedLyrics(bestCandidate)) ? bestCandidate : null
}

const buildLyricsQuery = (entry) => {
  const trackName = sanitizeLookupValue(hasText(entry.lyricsTitle) ? entry.lyricsTitle : entry.title)
  const artistName = sanitizeLookupValue(hasText(entry.lyricsArtist) ? entry.lyricsArtist : entry.artist)
  const albumName = sanitizeLookupValue(entry.lyricsAlbum)
  const duration = toFiniteNumber(entry.lyricsDuration)

  return { trackName, artistName, albumName, duration }
}

const shouldFetchLyrics = (entry) =>
  !!(
    entry &&
    entry.lyricsApi !== false &&
    !hasText(entry.lyrics) &&
    hasText(entry.audioSrc) &&
    hasText(entry.title) &&
    hasText(entry.artist)
  )

const fetchLyricsFromLrclib = async (query, lyricsApi = DEFAULT_LYRICS_API) => {
  const cacheKey = JSON.stringify(query)
  if (lyricsRequestCache.has(cacheKey)) return lyricsRequestCache.get(cacheKey)

  const requestPromise = (async () => {
    const getPayload = await requestJson(
      buildApiUrl('get', {
        track_name: query.trackName,
        artist_name: query.artistName,
        album_name: query.albumName,
        duration: query.duration
      }, lyricsApi)
    )
    const exactCandidate = pickBestLyricsCandidate(query, getPayload)
    if (exactCandidate) return getSyncedLyrics(exactCandidate)

    const searchPayload = await requestJson(
      buildApiUrl('search', {
        track_name: query.trackName,
        artist_name: query.artistName,
        album_name: query.albumName
      }, lyricsApi)
    )
    const searchCandidate = pickBestLyricsCandidate(query, searchPayload)
    return searchCandidate ? getSyncedLyrics(searchCandidate) : ''
  })()

  lyricsRequestCache.set(cacheKey, requestPromise)
  return requestPromise
}

const withRemoteLyrics = async (entry, options = {}) => {
  if (!shouldFetchLyrics(entry)) return entry

  const lyricsApi = options.lyricsApi || DEFAULT_LYRICS_API
  const query = buildLyricsQuery(entry)
  if (!hasText(query.trackName) || !hasText(query.artistName)) return entry

  const lyrics = await fetchLyricsFromLrclib(query, lyricsApi)
  if (!hasText(lyrics)) return entry

  return {
    ...entry,
    lyrics,
    lyricsFetchedFrom: 'lrclib'
  }
}

const buildPlatformApiUrl = (platformConfig, metingApi = DEFAULT_METING_API) => {
  const baseUrl = hasText(platformConfig.api) ? platformConfig.api : metingApi
  const hasTemplateToken = /:(server|type|id|auth|r)\b/.test(baseUrl)

  if (hasTemplateToken) {
    return new URL(
      baseUrl
        .replace(/:server\b/g, encodeURIComponent(platformConfig.server))
        .replace(/:type\b/g, encodeURIComponent(platformConfig.type))
        .replace(/:id\b/g, encodeURIComponent(platformConfig.id))
        .replace(/:auth\b/g, encodeURIComponent(platformConfig.auth || ''))
        .replace(/:r\b/g, String(Math.random()))
    )
  }

  const url = new URL(baseUrl)
  url.searchParams.set('server', platformConfig.server)
  url.searchParams.set('type', platformConfig.type)
  url.searchParams.set('id', platformConfig.id)
  if (hasText(platformConfig.auth)) url.searchParams.set('auth', platformConfig.auth)
  url.searchParams.set('r', String(Math.random()))
  return url
}

const pickPlatformCover = (payload) => {
  if (!payload) return ''

  const candidates = Array.isArray(payload) ? payload : [payload]
  for (const candidate of candidates) {
    const cover = pickField(candidate, ['pic', 'cover', 'image', 'artwork'])
    if (hasText(cover)) return cover
  }

  return ''
}

const fetchPlatformCover = async (platformConfig, metingApi = DEFAULT_METING_API) => {
  const cacheKey = JSON.stringify(platformConfig)
  if (platformMetadataCache.has(cacheKey)) return platformMetadataCache.get(cacheKey)

  const requestPromise = (async () => {
    const payload = await requestJson(buildPlatformApiUrl(platformConfig, metingApi))
    return pickPlatformCover(payload)
  })()

  platformMetadataCache.set(cacheKey, requestPromise)
  return requestPromise
}

const withPlatformCover = async (entry, options = {}) => {
  if (hasText(entry.coverSrc)) return entry

  const metingApi = options.metingApi || DEFAULT_METING_API
  const platformConfig = getPlatformConfig(entry)
  if (!platformConfig) return entry

  const coverSrc = await fetchPlatformCover(platformConfig, metingApi)
  if (!hasText(coverSrc)) return entry

  return {
    ...entry,
    coverSrc
  }
}

module.exports = {
  withRemoteLyrics,
  withPlatformCover,
  fetchLyricsFromLrclib,
  fetchPlatformCover,
  DEFAULT_LYRICS_API,
  DEFAULT_METING_API
}
