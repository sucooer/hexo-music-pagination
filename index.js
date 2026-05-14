'use strict'

const path = require('path')
const fs = require('fs')
const { loadEntries } = require('./lib/parser')
const { processEntries, buildHomeCarouselItems, calculatePages, DEFAULT_PER_PAGE, HOME_CAROUSEL_LIMIT } = require('./lib/pager')
const { withRemoteLyrics, withPlatformCover, DEFAULT_LYRICS_API, DEFAULT_METING_API } = require('./lib/fetcher')
const { getPlatformConfig } = require('./lib/helper')

hexo.extend.generator.register('music-pagination', async function () {
  const config = hexo.config.music_pagination || {}

  const enabled = config.enabled !== false
  if (!enabled) return []

  const perPage = config.per_page || DEFAULT_PER_PAGE
  const dataFile = config.data_file || 'music.yml'
  const routePrefix = config.route_prefix || 'music'
  const autoLyrics = config.auto_lyrics !== false
  const autoCover = config.auto_cover !== false
  const lyricsApi = config.lyrics_api || DEFAULT_LYRICS_API
  const metingApi = config.meting_api || DEFAULT_METING_API
  const carouselLimit = config.carousel_limit || HOME_CAROUSEL_LIMIT

  setDefaultTemplate(hexo)

  const rawEntries = loadEntries(hexo, dataFile)
  let processedEntries = processEntries(rawEntries)

  if (autoLyrics || autoCover) {
    processedEntries = await Promise.all(
      processedEntries.map(async (entry) => {
        let result = entry
        if (autoCover) {
          result = await withPlatformCover(result, { metingApi })
        }
        if (autoLyrics) {
          result = await withRemoteLyrics(result, { lyricsApi })
        }
        return result
      })
    )
  }

  const carouselItems = buildHomeCarouselItems(processedEntries, carouselLimit).map(item => ({
    ...item,
    platform: getPlatformConfig(item)
  }))

  const carouselPayload = JSON.stringify({
    generatedAt: new Date().toISOString(),
    items: carouselItems
  }, null, 2)

  const { pages } = calculatePages(processedEntries, perPage, routePrefix)

  setDefaultTemplate(hexo)

  const results = []
  for (const page of pages) {
    const pageData = {
      musicEntries: page.entries,
      pagination: page.pagination,
      musicConfig: {
        metingApi
      }
    }

    let content
    try {
      const pageContent = getEmbeddedTemplate()
      content = await hexo.render.render({ text: pageContent, engine: 'ejs' }, pageData)
    } catch (e) {
      content = ''
    }

    results.push({
      path: page.path,
      layout: ['page'],
      data: {
        title: page.pagination.currentPage === 1 ? '音乐分享' : `音乐分享 - 第${page.pagination.currentPage}页`,
        description: '每日分享一首最近反复回放的歌，再留下一点属于当天的听后感。',
        top_img: false,
        aside: false,
        content
      }
    })
  }

  results.push({
    path: `${routePrefix}/home-carousel.json`,
    data: carouselPayload
  })

  results.push({
    path: 'css/music-carousel.css',
    data: getCarouselCss()
  })

  results.push({
    path: 'js/music-carousel.js',
    data: getCarouselJs(metingApi)
  })

  return results
})

function setDefaultTemplate(hexo) {
  const templateName = 'music-page'
  if (hexo.theme.getView(templateName)) return

  const pluginDir = path.dirname(__dirname)
  const templatePath = path.join(pluginDir, 'templates', `${templateName}.ejs`)

  let templateContent
  if (fs.existsSync(templatePath)) {
    templateContent = fs.readFileSync(templatePath, 'utf8')
  } else {
    templateContent = getEmbeddedTemplate()
  }

  if (!hexo.theme.getView(templateName)) {
    hexo.theme.setView(templateName, templateContent)
  }
}

function getEmbeddedTemplate() {
  return `<%
const latestEntry = musicEntries[0] || null
const hasText = (value) => typeof value === 'string' && value.trim().length > 0
const escapeCssUrl = (value) =>
  encodeURI(String(value || ''))
    .replace(/'/g, '%27')
    .replace(/\\(/g, '%28')
    .replace(/\\)/g, '%29')
const parseLyrics = (lyrics) => {
  if (!hasText(lyrics)) return []
  return lyrics.split(/\\r?\\n/).flatMap((line) => {
    const matches = [...line.matchAll(/\\[(\\d{2}):(\\d{2})(?:\\.(\\d{1,3}))?\\]/g)]
    const text = line.replace(/\\[(\\d{2}):(\\d{2})(?:\\.(\\d{1,3}))?\\]/g, '').trim()
    if (!matches.length || !text) return []
    return matches.map((match) => ({
      time: Number(match[1]) * 60 + Number(match[2]) + Number('0.' + (match[3] || '0').padEnd(3, '0')),
      label: match[1] + ':' + match[2] + '.' + (match[3] || '0'),
      text
    }))
  }).sort((a, b) => a.time - b.time)
}
const getAudioMime = (src, audioType) => {
  if (hasText(audioType)) return audioType
  if (!hasText(src)) return 'audio/mpeg'
  if (/\\.m4a/i.test(src)) return 'audio/mp4'
  if (/\\.aac/i.test(src)) return 'audio/aac'
  if (/\\.ogg/i.test(src)) return 'audio/ogg'
  if (/\\.wav/i.test(src)) return 'audio/wav'
  if (/\\.flac/i.test(src)) return 'audio/flac'
  return 'audio/mpeg'
}
%>
<div class="music-daily-page">
  <section class="music-daily-hero">
    <div class="music-daily-intro">
      <span class="music-daily-kicker">Daily Music</span>
      <h1>把每天反复回放的一首歌，写成一条会继续向下生长的时间流。</h1>
      <p>把某一天反复回放的一首歌留在这里，也把那一刻的情绪和听后感一起存档。时间慢慢往前走，这一页也会像一册关于声音的日记，安静地继续写下去。</p>
    </div>
    <div class="music-daily-badge">
      <span>Latest Day</span>
      <strong><%= latestEntry ? latestEntry.dateLabel : '尚未更新' %></strong>
      <small><%= musicEntries.length %> 篇记录</small>
    </div>
  </section>
  <section class="music-stream">
    <% if (!musicEntries.length) { %>
      <article class="music-daily-entry music-daily-empty">
        <span class="music-daily-label">EMPTY</span>
        <h2>这里还没有新的音乐记录</h2>
      </article>
    <% } %>
    <% musicEntries.forEach((entry, index) => { %>
      <% const hasDirectAudio = hasText(entry.audioSrc) %>
      <% const lyricLines = parseLyrics(entry.lyrics) %>
      <% const platform = entry.platform %>
      <% const playerMode = hasDirectAudio ? 'direct' : (platform && platform.server) ? 'platform' : 'empty' %>
      <article id="<%= entry.id %>" class="music-stream-item <%= index === 0 ? 'is-current' : '' %>">
        <div class="music-stream-axis">
          <div class="music-stream-date">
            <span class="music-stream-month"><%= entry.month %></span>
            <strong><%= entry.day %></strong>
            <small><%= entry.weekday %></small>
          </div>
          <span class="music-stream-marker"></span>
          <span class="music-stream-order"><%= entry.orderLabel %></span>
        </div>
        <div class="music-stream-body">
          <article class="music-daily-entry">
            <div class="music-daily-entry-head">
              <span class="music-daily-label"><%= entry.label %></span>
              <h2><%= entry.title %></h2>
              <p><%= entry.intro %></p>
            </div>
            <div class="music-daily-entry-main">
              <% if (playerMode === 'direct') { %>
                <div class="music-daily-cover" data-daily-player data-player-mode="direct" style="<%= hasText(entry.coverSrc) ? '--music-cover-image: url(' + escapeCssUrl(entry.coverSrc) + ')' : '' %>">
                  <audio class="music-daily-audio" preload="metadata">
                    <source src="<%= entry.audioSrc %>" type="<%= getAudioMime(entry.audioSrc, entry.audioType) %>">
                  </audio>
                  <% if (lyricLines.length) { %>
                    <script type="application/json" data-player-lyrics-source><%- JSON.stringify(lyricLines) %></script>
                  <% } %>
                  <div class="music-daily-art-stack" aria-hidden="true">
                    <div class="music-daily-vinyl">
                      <span class="music-daily-artwork">
                        <% if (hasText(entry.coverSrc)) { %>
                          <img class="music-daily-artwork-image" src="<%= entry.coverSrc %>" alt="<%= entry.title %> 封面" referrerpolicy="no-referrer">
                        <% } %>
                        <span class="music-daily-artwork-overlay"></span>
                        <span class="music-daily-artwork-outline"></span>
                      </span>
                    </div>
                  </div>
                  <button class="music-daily-vinyl-trigger" type="button" data-player-toggle>
                    <span class="music-daily-vinyl-badge" data-player-icon><i class="fa-solid fa-play"></i></span>
                  </button>
                  <div class="music-daily-cover-copy">
                    <span><%= entry.coverKicker %></span>
                    <strong><%= entry.title %></strong>
                    <small><%= entry.artist %></small>
                    <em class="music-daily-cover-lyric is-placeholder" data-player-lyric>轻触唱片开始播放</em>
                    <em class="music-daily-cover-status" data-player-status></em>
                  </div>
                </div>
              <% } else if (playerMode === 'platform') { %>
                <div class="music-daily-cover music-daily-cover--platform">
                  <div class="music-daily-platform-meta">
                    <span><%= entry.coverKicker %></span>
                    <strong><%= entry.title %></strong>
                    <small><%= entry.artist %></small>
                  </div>
                  <div class="music-daily-platform-player" data-platform-player>
                    <div class="aplayer"
                      data-id="<%= platform.id %>"
                      data-server="<%= platform.server %>"
                      data-type="<%= platform.type %>"
                      data-api="<%= platform.api || musicConfig.metingApi %>"
                      data-auth="<%= platform.auth || '' %>"
                      data-title="<%= entry.title %>"
                      data-artist="<%= entry.artist %>"
                      data-cover="<%= entry.coverSrc || '' %>"></div>
                  </div>
                </div>
              <% } else { %>
                <div class="music-daily-cover music-daily-cover--empty">
                  <div class="music-daily-platform-meta">
                    <span><%= entry.coverKicker %></span>
                    <strong><%= entry.title %></strong>
                    <small><%= entry.artist %></small>
                  </div>
                </div>
              <% } %>
            </div>
            <section class="music-daily-writing">
              <p class="music-daily-quote"><%= entry.quote %></p>
              <article class="music-daily-writing-article">
                <span class="music-daily-card-tag"><%= entry.writing.tag %></span>
                <h3><%= entry.writing.title %></h3>
                <% entry.writing.paragraphs.forEach((p) => { %><p><%= p %></p><% }) %>
              </article>
            </section>
          </article>
        </div>
      </article>
    <% }) %>
    <% if (musicEntries.length) { %>
      <div class="music-stream-tail"><span>Time Flow Continues</span><p>下一首歌，下一天，再往下补一条就好。</p></div>
    <% } %>
  </section>
  <% if (pagination && pagination.totalPages > 1) { %>
  <nav class="music-pagination">
    <% if (pagination.hasPrev) { %>
      <a href="<%= pagination.prevPage %>" class="pagination-link pagination-prev"><span>上一页</span></a>
    <% } %>
    <div class="pagination-pages">
      <% 
        const total = pagination.totalPages
        const current = pagination.currentPage
        const showPage = (i) => {
          if (i < 1 || i > total) return false
          return i === 1 || i === total || Math.abs(i - current) <= 1
        }
        const showEllipsis = (i) => {
          if (i <= 1 || i >= total) return false
          return i === 2 && current > 3 || i === total - 1 && current < total - 2
        }
        let prevShown = false
      %>
      <% for (let i = 1; i <= total; i++) { %>
        <% if (showEllipsis(i) && !prevShown) { %>
          <span class="pagination-ellipsis">...</span>
          <% prevShown = true %>
        <% } else if (showPage(i)) { %>
          <% prevShown = false %>
          <% if (i === current) { %>
            <span class="pagination-page is-active"><%= i %></span>
          <% } else { %>
            <a href="/music<%= i === 1 ? '/' : '/page/' + i + '/' %>" class="pagination-page"><%= i %></a>
          <% } %>
        <% } %>
      <% } %>
    </div>
    <% if (pagination.hasNext) { %>
      <a href="<%= pagination.nextPage %>" class="pagination-link pagination-next"><span>下一页</span></a>
    <% } %>
  </nav>
  <% } %>
</div>
<script data-pjax>
(() => {
  const state = window.__musicDailyPageState || (window.__musicDailyPageState = {
    bound: false,
    activeAudio: null,
    platformRequests: new Map()
  })

  const DEFAULT_METING_API = <%- JSON.stringify((musicConfig && musicConfig.metingApi) || 'https://api.injahow.cn/meting/api') %>

  const setToggleIcon = (icon, isPlaying) => {
    if (!icon) return
    icon.innerHTML = isPlaying
      ? '<i class="fa-solid fa-pause"></i>'
      : '<i class="fa-solid fa-play"></i>'
  }

  const setLyricText = (lyricEl, text, isPlaceholder) => {
    if (!lyricEl) return
    lyricEl.textContent = text
    lyricEl.classList.toggle('is-placeholder', !!isPlaceholder)
  }

  const parseLyricsFromCover = (cover) => {
    const source = cover.querySelector('[data-player-lyrics-source]')
    if (!source) return []

    try {
      const payload = JSON.parse(source.textContent || '[]')
      return Array.isArray(payload) ? payload : []
    } catch (error) {
      return []
    }
  }

  const bindDirectPlayer = (cover) => {
    if (!cover || cover.dataset.playerBound === 'true') return
    cover.dataset.playerBound = 'true'

    const audio = cover.querySelector('audio')
    const toggle = cover.querySelector('[data-player-toggle]')
    const icon = cover.querySelector('[data-player-icon]')
    const status = cover.querySelector('[data-player-status]')
    const lyric = cover.querySelector('[data-player-lyric]')
    const lyrics = parseLyricsFromCover(cover)

    if (!audio || !toggle) return

    const updateLyric = () => {
      if (!lyric) return
      if (!lyrics.length) {
        setLyricText(lyric, audio.paused ? '轻触唱片开始播放' : '播放中', audio.paused)
        return
      }

      let current = null
      for (const line of lyrics) {
        if (typeof line.time === 'number' && line.time <= audio.currentTime) current = line
        else break
      }

      if (current && current.text) {
        setLyricText(lyric, current.text, false)
      } else {
        setLyricText(lyric, audio.paused ? '轻触唱片开始播放' : '前奏响起中...', !audio.paused ? false : true)
      }
    }

    const updateState = (isPlaying) => {
      cover.classList.toggle('is-playing', isPlaying)
      setToggleIcon(icon, isPlaying)
      if (status) status.textContent = isPlaying ? '播放中' : ''
      updateLyric()
    }

    toggle.addEventListener('click', async () => {
      if (audio.paused) {
        if (state.activeAudio && state.activeAudio !== audio) {
          state.activeAudio.pause()
        }

        try {
          await audio.play()
          state.activeAudio = audio
        } catch (error) {
          if (status) status.textContent = '播放失败，请检查音频链接'
        }
      } else {
        audio.pause()
      }
    })

    audio.addEventListener('play', () => updateState(true))
    audio.addEventListener('pause', () => updateState(false))
    audio.addEventListener('ended', () => updateState(false))
    audio.addEventListener('timeupdate', updateLyric)
    audio.addEventListener('loadedmetadata', updateLyric)
    audio.addEventListener('error', () => {
      if (status) status.textContent = '音频资源不可用'
      setLyricText(lyric, '音频资源不可用', true)
      updateState(false)
    })

    updateState(false)
  }

  const buildPlatformApiUrl = (node) => {
    const server = node.dataset.server || ''
    const type = node.dataset.type || ''
    const id = node.dataset.id || ''
    const auth = node.dataset.auth || ''
    const api = node.dataset.api || DEFAULT_METING_API
    if (!server || !type || !id || !api) return ''

    if (/:(server|type|id|auth|r)\b/.test(api)) {
      return api
        .replace(/:server\b/g, encodeURIComponent(server))
        .replace(/:type\b/g, encodeURIComponent(type))
        .replace(/:id\b/g, encodeURIComponent(id))
        .replace(/:auth\b/g, encodeURIComponent(auth))
        .replace(/:r\b/g, String(Math.random()))
    }

    try {
      const url = new URL(api, window.location.origin)
      url.searchParams.set('server', server)
      url.searchParams.set('type', type)
      url.searchParams.set('id', id)
      if (auth) url.searchParams.set('auth', auth)
      url.searchParams.set('r', String(Math.random()))
      return url.toString()
    } catch (error) {
      return ''
    }
  }

  const normalizePlatformAudio = (payload, node) => {
    const item = Array.isArray(payload) ? payload[0] : payload
    if (!item || typeof item !== 'object') return null

    const url = item.url || item.src || item.music || ''
    if (!url) return null

    return {
      name: item.name || node.dataset.title || '未命名歌曲',
      artist: item.artist || item.author || node.dataset.artist || '',
      url,
      cover: item.pic || item.cover || item.image || node.dataset.cover || '',
      lrc: item.lrc || item.lyric || ''
    }
  }

  const bindPlatformPlayer = async (node) => {
    if (!node || node.dataset.playerBound === 'true') return
    node.dataset.playerBound = 'true'

    if (typeof window.APlayer !== 'function') {
      node.dataset.playerBound = 'false'
      return
    }

    const requestUrl = buildPlatformApiUrl(node)
    if (!requestUrl) return

    if (!state.platformRequests.has(requestUrl)) {
      state.platformRequests.set(requestUrl, fetch(requestUrl).then((response) => {
        if (!response.ok) return null
        return response.json()
      }).catch(() => null))
    }

    const payload = await state.platformRequests.get(requestUrl)
    const audio = normalizePlatformAudio(payload, node)
    if (!audio) {
      node.innerHTML = '<div class="music-daily-cover-status music-daily-cover-status--platform">播放器加载失败，请检查平台 ID 或 API 配置</div>'
      return
    }

    node.innerHTML = ''
    try {
      new window.APlayer({
        container: node,
        mini: false,
        autoplay: false,
        theme: '#8c593b',
        loop: 'none',
        order: 'list',
        preload: 'metadata',
        volume: 0.7,
        lrcType: audio.lrc ? 3 : 0,
        audio: [audio]
      })
    } catch (error) {
      node.innerHTML = '<div class="music-daily-cover-status music-daily-cover-status--platform">播放器初始化失败</div>'
    }
  }

  const initPlayers = () => {
    document.querySelectorAll('[data-daily-player]').forEach(bindDirectPlayer)

    if (typeof window.APlayer === 'function') {
      document.querySelectorAll('.music-daily-platform-player .aplayer').forEach((node) => {
        bindPlatformPlayer(node)
      })
    }
  }

  if (!state.bound && window.btf && typeof window.btf.addGlobalFn === 'function') {
    window.btf.addGlobalFn('pjaxComplete', initPlayers, 'musicDailyPageInit')
    state.bound = true
  }

  if (document.readyState === 'complete') {
    setTimeout(initPlayers, 0)
  } else {
    window.addEventListener('load', initPlayers, { once: true })
  }
})()
</script>`
}

function getCarouselJs(metingApi) {
  const sourcePath = path.join(__dirname, 'lib', 'carousel-js.js')
  let source
  try {
    source = fs.readFileSync(sourcePath, 'utf8')
  } catch (e) {
    return ''
  }

  const apiUrl = metingApi || 'https://api.injahow.cn/meting/api?server=:server&type=:type&id=:id&r=:r'
  return source.replace('__METING_API__', apiUrl)
}

function getCarouselCss() {
  return `.home-music-entry-head,
.home-music-carousel {
    position: relative;
    z-index: 1;
}

.home-music-entry-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 18px;
    margin-bottom: 18px;
}

.home-music-entry-kicker {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    padding: 0 12px;
    border: 1px solid rgba(255, 245, 238, 0.16);
    border-radius: 999px;
    background: rgba(255, 245, 238, 0.08);
    color: rgba(255, 243, 235, 0.82);
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
}

.home-music-entry-titlebox h2 {
    margin: 10px 0 0;
    max-width: 26ch;
    color: #fff6f0;
    font-size: clamp(1.35rem, 2.6vw, 1.95rem);
    line-height: 1.35;
}

.home-music-entry-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 42px;
    padding: 0 18px;
    border: 1px solid rgba(255, 246, 240, 0.14);
    border-radius: 999px;
    background: rgba(255, 246, 240, 0.08);
    color: #fff5ee !important;
    font-weight: 600;
    white-space: nowrap;
    transition: transform 0.2s ease, background-color 0.2s ease;
}

.home-music-entry-link:hover {
    background: rgba(255, 246, 240, 0.14);
    transform: translateY(-1px);
}

.home-music-carousel-stage {
    display: grid;
}

.home-music-slide {
    position: relative;
    grid-area: 1 / 1;
    display: grid;
    grid-template-columns: minmax(140px, 196px) minmax(0, 1fr);
    gap: 24px;
    align-items: center;
    overflow: hidden;
    min-width: 0;
    padding: 24px;
    border: 1px solid rgba(255, 245, 238, 0.08);
    border-radius: 24px;
    background: linear-gradient(135deg, rgba(19, 15, 13, 0.84), rgba(19, 15, 13, 0.62));
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
    color: inherit;
    text-decoration: none !important;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transform: translateY(12px);
    transition: opacity 0.45s ease, transform 0.45s ease, visibility 0.45s ease;
}

.home-music-slide.is-active {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
    transform: translateY(0);
}

.home-music-slide-bg,
.home-music-slide-glow {
    position: absolute;
    inset: 0;
    pointer-events: none;
}

.home-music-slide-bg {
    background-image:
        linear-gradient(110deg, rgba(19, 15, 13, 0.88) 0%, rgba(19, 15, 13, 0.76) 42%, rgba(19, 15, 13, 0.34) 100%),
        var(--home-music-cover, linear-gradient(135deg, #5f4634, #2d2119));
    background-position: center;
    background-size: cover;
    transform: scale(1.06);
}

.home-music-slide-glow {
    left: auto;
    right: -34px;
    top: 50%;
    bottom: auto;
    width: 240px;
    height: 240px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(255, 205, 159, 0.22), transparent 70%);
    transform: translateY(-50%);
}

.home-music-slide-media,
.home-music-slide-copy {
    position: relative;
    z-index: 1;
    min-width: 0;
}

.home-music-slide-media {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    aspect-ratio: 1 / 1;
    overflow: hidden;
    border-radius: 24px;
    background: linear-gradient(135deg, rgba(255, 244, 236, 0.16), rgba(255, 244, 236, 0.06));
    box-shadow: 0 18px 36px rgba(10, 8, 7, 0.24);
}

.home-music-slide-image {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.home-music-slide-fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: rgba(255, 246, 240, 0.92);
    font-size: clamp(2.4rem, 5vw, 3.6rem);
    font-weight: 700;
    letter-spacing: 0.08em;
}

.home-music-slide-copy {
    display: grid;
    gap: 10px;
}

.home-music-slide-label,
.home-music-slide-meta span {
    color: rgba(255, 241, 232, 0.72);
    letter-spacing: 0.12em;
    text-transform: uppercase;
}

.home-music-slide-label {
    font-size: 0.76rem;
    font-weight: 700;
}

.home-music-slide-title {
    display: -webkit-box;
    margin: 0;
    overflow: hidden;
    color: #fff8f2;
    font-size: clamp(1.7rem, 4vw, 2.45rem);
    line-height: 1.14;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
}

.home-music-slide-artist {
    display: block;
    color: rgba(255, 240, 230, 0.84);
    font-size: 1rem;
    font-weight: 600;
}

.home-music-slide-intro {
    display: -webkit-box;
    overflow: hidden;
    color: rgba(255, 241, 232, 0.74);
    line-height: 1.75;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
}

.home-music-slide-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 2px;
}

.home-music-slide-meta span {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    padding: 0 10px;
    border-radius: 999px;
    background: rgba(255, 246, 240, 0.08);
    font-size: 0.72rem;
    font-weight: 700;
}

.home-music-slide-cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: fit-content;
    min-height: 38px;
    margin-top: 4px;
    padding: 0 16px;
    border-radius: 999px;
    background: rgba(255, 246, 240, 0.92);
    color: #4d3728;
    font-size: 0.9rem;
    font-weight: 700;
    transition: transform 0.2s ease, background-color 0.2s ease;
}

.home-music-slide:hover .home-music-slide-cta {
    background: #fffaf6;
    transform: translateY(-1px);
}

.home-music-carousel-dots {
    display: flex;
    justify-content: center;
    gap: 10px;
    margin-top: 16px;
}

.home-music-carousel-dot {
    width: 10px;
    height: 10px;
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: rgba(255, 245, 238, 0.26);
    cursor: pointer;
    transition: width 0.2s ease, background-color 0.2s ease, opacity 0.2s ease;
}

.home-music-carousel-dot.is-active {
    width: 28px;
    background: rgba(255, 245, 238, 0.9);
}

@media (max-width: 900px) {
    .home-music-slide {
        grid-template-columns: 128px minmax(0, 1fr);
        gap: 18px;
        padding: 20px;
    }

    .home-music-slide-title {
        font-size: clamp(1.45rem, 5vw, 2rem);
    }

    .home-music-slide-intro {
        -webkit-line-clamp: 2;
    }
}

@media (max-width: 680px) {
    .home-music-entry {
        margin-bottom: 24px;
        padding: 18px;
        border-radius: 24px;
    }

    .home-music-entry-head {
        flex-direction: column;
        align-items: stretch;
        gap: 14px;
        margin-bottom: 14px;
    }

    .home-music-entry-titlebox h2 {
        max-width: none;
        font-size: 1.2rem;
    }

    .home-music-entry-link {
        width: fit-content;
    }

    .home-music-slide {
        grid-template-columns: 84px minmax(0, 1fr);
        gap: 14px;
        padding: 16px;
        border-radius: 20px;
    }

    .home-music-slide-media {
        border-radius: 18px;
    }

    .home-music-slide-copy {
        gap: 7px;
    }

    .home-music-slide-artist {
        font-size: 0.92rem;
    }

    .home-music-slide-intro {
        font-size: 0.92rem;
        line-height: 1.65;
    }

    .home-music-slide-meta {
        gap: 8px;
    }

    .home-music-slide-meta span {
        min-height: 24px;
        font-size: 0.68rem;
    }

    .home-music-slide-cta {
        min-height: 34px;
        padding: 0 14px;
        font-size: 0.84rem;
    }
}`
}
