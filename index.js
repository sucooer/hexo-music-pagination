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

  const results = []
  for (const page of pages) {
    const pageData = {
      musicEntries: page.entries,
      pagination: page.pagination
    }

    let content
    try {
      content = await hexo.render.render({ layout: 'music-page' }, pageData)
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

  hexo.theme.setView(templateName, templateContent)
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
                  <button class="music-daily-vinyl-trigger" type="button" data-player-toggle>
                    <span class="music-daily-vinyl-badge" data-player-icon><i class="fa-solid fa-play"></i></span>
                  </button>
                  <div class="music-daily-cover-copy">
                    <span><%= entry.coverKicker %></span>
                    <strong><%= entry.title %></strong>
                    <small><%= entry.artist %></small>
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
                    <div class="aplayer" data-id="<%= platform.id %>" data-server="<%= platform.server %>" data-type="<%= platform.type %>"></div>
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
      <% for (let i = 1; i <= pagination.totalPages; i++) { %>
        <% if (i === 1) { %>
          <a href="/music/" class="pagination-page<%= pagination.currentPage === 1 ? ' is-active' : '' %>">1</a>
        <% } else if (i === pagination.currentPage) { %>
          <span class="pagination-page is-active"><%= i %></span>
        <% } else if (i === 2 || i === pagination.totalPages) { %>
          <a href="/music/page/<%= i %>/" class="pagination-page"><%= i %></a>
        <% } else if (i === 3) { %>
          <span class="pagination-ellipsis">...</span>
        <% } %>
      <% } %>
    </div>
    <% if (pagination.hasNext) { %>
      <a href="<%= pagination.nextPage %>" class="pagination-link pagination-next"><span>下一页</span></a>
    <% } %>
  </nav>
  <% } %>
</div>`
}