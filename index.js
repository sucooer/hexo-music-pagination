'use strict'

const path = require('path')
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

  const templatePath = config.template || getDefaultTemplatePath(hexo)

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
      content = await hexo.render.render({ path: templatePath }, pageData)
    } catch (e) {
      content = ''
    }

    if (!content) {
      content = await hexo.render.renderSync({ path: templatePath }, pageData)
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

function getDefaultTemplatePath(hexo) {
  const defaultPath = path.join(hexo.base_dir, 'templates', 'music-page-content.ejs')
  return defaultPath
}