'use strict'

const { hasText, slugify, parseDateLabel } = require('./helper')

const DEFAULT_PER_PAGE = 5
const HOME_CAROUSEL_LIMIT = 10

const fillId = (entry, index) => {
  if (hasText(entry.id)) return entry

  const datePart = hasText(entry.dateLabel) ? entry.dateLabel.replace(/[^\d]/g, '') : `entry${index + 1}`
  const titlePart = slugify(entry.title)
  const fallbackTitle = hasText(titlePart) ? titlePart : `item${index + 1}`

  return {
    ...entry,
    id: `day-${datePart}-${fallbackTitle}`
  }
}

const fillDateParts = (entry) => {
  const date = parseDateLabel(entry.dateLabel)
  if (!date) return entry

  const month = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' })
    .format(date)
    .toUpperCase()
  const day = String(date.getUTCDate()).padStart(2, '0')
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(date)

  return {
    ...entry,
    month: hasText(entry.month) ? entry.month : month,
    day: hasText(entry.day) ? entry.day : day,
    weekday: hasText(entry.weekday) ? entry.weekday : weekday
  }
}

const buildHomeCarouselItems = (entries, limit = HOME_CAROUSEL_LIMIT) =>
  entries.slice(0, limit).map((entry, index) => ({
    id: entry.id,
    dateLabel: hasText(entry.dateLabel) ? entry.dateLabel : '',
    orderLabel: hasText(entry.orderLabel) ? entry.orderLabel : `Day ${String(index + 1).padStart(3, '0')}`,
    label: hasText(entry.label) ? entry.label : 'MUSIC DIARY',
    title: hasText(entry.title) ? entry.title : '未命名歌曲',
    artist: hasText(entry.artist) ? entry.artist : '',
    intro: hasText(entry.intro) ? entry.intro : '',
    coverSrc: hasText(entry.coverSrc) ? entry.coverSrc : '',
    platform: entry.platform,
    linkPath: `music/#${entry.id}`
  }))

const calculatePages = (entries, perPage = DEFAULT_PER_PAGE, routePrefix = 'music') => {
  const totalEntries = entries.length
  const totalPages = Math.ceil(totalEntries / perPage)

  const pages = []
  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const startIdx = (pageNum - 1) * perPage
    const endIdx = Math.min(startIdx + perPage, totalEntries)
    const pageEntries = entries.slice(startIdx, endIdx)

    const buildPagePath = (num) => {
      if (num === 1) return routePrefix
      return `${routePrefix}/page/${num}`
    }

    const pagination = {
      currentPage: pageNum,
      totalPages: totalPages,
      totalEntries: totalEntries,
      hasPrev: pageNum > 1,
      hasNext: pageNum < totalPages,
      prevPage: pageNum > 1 ? (pageNum === 2 ? `/${routePrefix}/` : `/${routePrefix}/page/${pageNum - 1}/`) : null,
      nextPage: pageNum < totalPages ? `/${routePrefix}/page/${pageNum + 1}/` : null
    }

    pages.push({
      entries: pageEntries,
      pagination,
      path: pageNum === 1 ? `${routePrefix}/index.html` : `${routePrefix}/page/${pageNum}/index.html`,
      buildPagePath
    })
  }

  return {
    pages,
    totalEntries,
    totalPages
  }
}

const processEntries = (rawEntries) => {
  return rawEntries.map((entry, index) => fillDateParts(fillId(entry, index)))
}

module.exports = {
  DEFAULT_PER_PAGE,
  HOME_CAROUSEL_LIMIT,
  fillId,
  fillDateParts,
  processEntries,
  buildHomeCarouselItems,
  calculatePages
}