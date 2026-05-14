(() => {
  const state = window.__musicCarouselState || (window.__musicCarouselState = {})
  const CAROUSEL_DATA_PATH = 'music/home-carousel.json'
  const MUSIC_PAGE_PATH = 'music/'
  const DEFAULT_METING_API = '__METING_API__'
  const AUTO_PLAY_INTERVAL = 5600

  const normalizeRoot = (value) => {
    if (typeof value !== 'string' || !value.trim()) return '/'
    const trimmed = value.trim()
    return trimmed.endsWith('/') ? trimmed : `${trimmed}/`
  }

  const joinRootPath = (root, path) => {
    const safeRoot = normalizeRoot(root)
    const safePath = String(path || '').replace(/^\/+/, '')
    return `${safeRoot}${safePath}`
  }

  const getSiteRoot = () => {
    if (window.GLOBAL_CONFIG && typeof window.GLOBAL_CONFIG.root === 'string') {
      return normalizeRoot(window.GLOBAL_CONFIG.root)
    }

    return '/'
  }

  const escapeHtml = (value) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')

  const escapeCssUrl = (value) =>
    encodeURI(String(value || ''))
      .replace(/'/g, '%27')
      .replace(/\(/g, '%28')
      .replace(/\)/g, '%29')

  const getCoverInitial = (title) => {
    const text = String(title || '').trim()
    return text ? text.slice(0, 1).toUpperCase() : 'M'
  }

  const pickPlatformCover = (payload) => {
    const candidates = Array.isArray(payload) ? payload : [payload]
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== 'object') continue

      const cover = [candidate.pic, candidate.cover, candidate.image, candidate.artwork].find(
        (value) => typeof value === 'string' && value.trim()
      )

      if (cover) return cover.trim()
    }

    return ''
  }

  const buildPlatformApiUrl = (platform) => {
    if (!platform || typeof platform !== 'object') return ''
    if (!platform.server || !platform.type || (!platform.id && platform.id !== 0)) return ''

    const baseUrl = typeof platform.api === 'string' && platform.api.trim() ? platform.api.trim() : DEFAULT_METING_API
    const platformId = String(platform.id).trim()
    const platformAuth = typeof platform.auth === 'string' ? platform.auth.trim() : ''
    const hasTemplateToken = /:(server|type|id|auth|r)\b/.test(baseUrl)

    if (hasTemplateToken) {
      return baseUrl
        .replace(/:server\b/g, encodeURIComponent(String(platform.server).trim()))
        .replace(/:type\b/g, encodeURIComponent(String(platform.type).trim()))
        .replace(/:id\b/g, encodeURIComponent(platformId))
        .replace(/:auth\b/g, encodeURIComponent(platformAuth))
        .replace(/:r\b/g, String(Math.random()))
    }

    try {
      const url = new URL(baseUrl, window.location.origin)
      url.searchParams.set('server', String(platform.server).trim())
      url.searchParams.set('type', String(platform.type).trim())
      url.searchParams.set('id', platformId)
      if (platformAuth) url.searchParams.set('auth', platformAuth)
      url.searchParams.set('r', String(Math.random()))
      return url.toString()
    } catch (error) {
      return ''
    }
  }

  const fetchPlatformCover = async (platform) => {
    if (!state.platformCoverCache) state.platformCoverCache = new Map()

    const cacheKey = JSON.stringify(platform || {})
    if (state.platformCoverCache.has(cacheKey)) return state.platformCoverCache.get(cacheKey)

    const requestPromise = (async () => {
      const requestUrl = buildPlatformApiUrl(platform)
      if (!requestUrl) return ''

      try {
        const response = await fetch(requestUrl)
        if (!response.ok) return ''
        return pickPlatformCover(await response.json())
      } catch (error) {
        return ''
      }
    })()

    state.platformCoverCache.set(cacheKey, requestPromise)
    return requestPromise
  }

  const clearMountedCarousel = () => {
    if (typeof state.cleanup === 'function') {
      state.cleanup()
      state.cleanup = null
    }

    document.querySelector('[data-home-music-entry]')?.remove()
  }

  if (!state.bound) {
    document.addEventListener('pjax:send', clearMountedCarousel)
    window.addEventListener('beforeunload', clearMountedCarousel)
    state.bound = true
  }

  const fetchCarouselPayload = async () => {
    if (state.payload) return state.payload
    if (state.payloadPromise) return state.payloadPromise

    const root = getSiteRoot()
    const requestUrl = joinRootPath(root, CAROUSEL_DATA_PATH) + '?_=' + Date.now()

    state.payloadPromise = fetch(requestUrl, { credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        state.payload = payload && Array.isArray(payload.items) ? payload : { items: [] }
        return state.payload
      })
      .catch(() => {
        state.payload = { items: [] }
        return state.payload
      })
      .finally(() => {
        state.payloadPromise = null
      })

    return state.payloadPromise
  }

  const buildSlideMarkup = (item, index, root) => {
    const title = escapeHtml(item.title || '未命名歌曲')
    const artist = escapeHtml(item.artist || '')
    const intro = escapeHtml(item.intro || '')
    const label = escapeHtml(item.label || 'MUSIC DIARY')
    const dateLabel = escapeHtml(item.dateLabel || '')
    const orderLabel = escapeHtml(item.orderLabel || '')
    const href = escapeHtml(joinRootPath(root, item.linkPath || MUSIC_PAGE_PATH))
    const hasCover = typeof item.coverSrc === 'string' && item.coverSrc.trim().length > 0
    const coverMarkup = hasCover
      ? '<img class="home-music-slide-image" src="' + escapeHtml(item.coverSrc) + '" alt="' + title + ' 封面" loading="' + (index === 0 ? 'eager' : 'lazy') + '" decoding="async" referrerpolicy="no-referrer">'
      : '<span class="home-music-slide-fallback" aria-hidden="true">' + escapeHtml(getCoverInitial(item.title)) + '</span>'
    const coverStyle = hasCover ? ' style="--home-music-cover: url(' + escapeCssUrl(item.coverSrc) + ');"' : ''

    return '<a class="home-music-slide' + (index === 0 ? ' is-active' : '') + '" href="' + href + '" data-home-music-slide data-slide-index="' + index + '" aria-hidden="' + (index === 0 ? 'false' : 'true') + '" tabindex="' + (index === 0 ? '0' : '-1') + '"' + coverStyle + '>'
      + '<span class="home-music-slide-bg" aria-hidden="true"></span>'
      + '<span class="home-music-slide-glow" aria-hidden="true"></span>'
      + '<span class="home-music-slide-media">'
      + coverMarkup
      + '</span>'
      + '<span class="home-music-slide-copy">'
      + '<span class="home-music-slide-label">' + label + '</span>'
      + '<strong class="home-music-slide-title">' + title + '</strong>'
      + '<span class="home-music-slide-artist">' + artist + '</span>'
      + '<span class="home-music-slide-intro">' + intro + '</span>'
      + '<span class="home-music-slide-meta">'
      + '<span>' + dateLabel + '</span>'
      + '<span>' + orderLabel + '</span>'
      + '</span>'
      + '<span class="home-music-slide-cta">进入音乐时间流</span>'
      + '</span>'
      + '</a>'
  }

  const applyPlatformCover = (slide, item, coverSrc) => {
    if (!slide || !coverSrc) return

    slide.style.setProperty('--home-music-cover', "url('" + escapeCssUrl(coverSrc) + "')")

    const media = slide.querySelector('.home-music-slide-media')
    if (!media) return

    const existingImage = media.querySelector('.home-music-slide-image')
    if (existingImage) {
      existingImage.src = coverSrc
      return
    }

    media.innerHTML = '<img class="home-music-slide-image" src="' + escapeHtml(coverSrc) + '" alt="' + escapeHtml(item.title || '音乐封面') + ' 封面" loading="lazy" decoding="async" referrerpolicy="no-referrer">'
  }

  const hydratePlatformCovers = (section, items) => {
    items.forEach(async (item, index) => {
      const hasCover = typeof item.coverSrc === 'string' && item.coverSrc.trim().length > 0
      if (hasCover || !item.platform) return

      const coverSrc = await fetchPlatformCover(item.platform)
      if (!coverSrc) return

      const slide = section.querySelector('[data-home-music-slide][data-slide-index="' + index + '"]')
      applyPlatformCover(slide, item, coverSrc)
    })
  }

  const renderCarousel = (items) => {
    const recentPosts = document.getElementById('recent-posts')
    const recentPostItems = recentPosts?.querySelector('.recent-post-items')
    const pageType = window.GLOBAL_CONFIG_SITE && window.GLOBAL_CONFIG_SITE.pageType

    clearMountedCarousel()

    if (!recentPosts || !recentPostItems || pageType !== 'home' || !items.length) return

    const root = getSiteRoot()
    const musicPageHref = joinRootPath(root, MUSIC_PAGE_PATH)
    const section = document.createElement('section')
    section.className = 'home-music-entry'
    section.setAttribute('data-home-music-entry', '')
    section.innerHTML = '<div class="home-music-entry-head">'
      + '<div class="home-music-entry-titlebox">'
      + '<span class="home-music-entry-kicker">Music Diary</span>'
      + '<h2>把今天想循环播放的一首歌，继续留在音乐时间流里。</h2>'
      + '</div>'
      + '<a class="home-music-entry-link" href="' + escapeHtml(musicPageHref) + '">查看全部</a>'
      + '</div>'
      + '<div class="home-music-carousel">'
      + '<div class="home-music-carousel-stage">'
      + items.map(function(item, i) { return buildSlideMarkup(item, i, root) }).join('')
      + '</div>'
      + (items.length > 1
        ? '<div class="home-music-carousel-dots" role="tablist" aria-label="音乐分享轮播切换">'
          + items.map(function(item, i) {
            return '<button class="home-music-carousel-dot' + (i === 0 ? ' is-active' : '') + '" type="button" data-home-music-dot data-slide-index="' + i + '" role="tab" aria-selected="' + (i === 0 ? 'true' : 'false') + '" aria-label="切换到 ' + escapeHtml(item.title || '第 ' + (i + 1) + ' 条') + '"></button>'
          }).join('')
          + '</div>'
        : '')
      + '</div>'

    recentPosts.insertBefore(section, recentPostItems)

    const slides = Array.from(section.querySelectorAll('[data-home-music-slide]'))
    const dots = Array.from(section.querySelectorAll('[data-home-music-dot]'))
    let activeIndex = 0
    let timerId = 0
    const shouldAutoplay =
      slides.length > 1 &&
      !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)

    const syncSlides = (nextIndex) => {
      activeIndex = (nextIndex + slides.length) % slides.length

      slides.forEach((slide, slideIndex) => {
        const isActive = slideIndex === activeIndex
        slide.classList.toggle('is-active', isActive)
        slide.setAttribute('aria-hidden', String(!isActive))
        slide.tabIndex = isActive ? 0 : -1
      })

      dots.forEach((dot, dotIndex) => {
        const isActive = dotIndex === activeIndex
        dot.classList.toggle('is-active', isActive)
        dot.setAttribute('aria-selected', String(isActive))
      })
    }

    const stopAutoplay = () => {
      if (!timerId) return
      window.clearInterval(timerId)
      timerId = 0
    }

    const startAutoplay = () => {
      if (!shouldAutoplay) return
      stopAutoplay()
      timerId = window.setInterval(() => {
        syncSlides(activeIndex + 1)
      }, AUTO_PLAY_INTERVAL)
    }

    dots.forEach((dot) => {
      dot.addEventListener('click', () => {
        const slideIndex = Number(dot.getAttribute('data-slide-index'))
        if (!Number.isFinite(slideIndex)) return
        syncSlides(slideIndex)
        startAutoplay()
      })
    })

    section.addEventListener('mouseenter', stopAutoplay)
    section.addEventListener('mouseleave', startAutoplay)
    section.addEventListener('focusin', stopAutoplay)
    section.addEventListener('focusout', () => {
      window.setTimeout(() => {
        if (!section.matches(':focus-within')) startAutoplay()
      }, 0)
    })

    syncSlides(0)
    startAutoplay()
    hydratePlatformCovers(section, items)

    state.cleanup = () => {
      stopAutoplay()
    }
  }

  const initHomeMusicEntry = async () => {
    const pageType = window.GLOBAL_CONFIG_SITE && window.GLOBAL_CONFIG_SITE.pageType
    if (pageType !== 'home') {
      clearMountedCarousel()
      return
    }

    const payload = await fetchCarouselPayload()
    const items = Array.isArray(payload?.items) ? payload.items.filter((item) => item && item.id) : []
    renderCarousel(items)
  }

  initHomeMusicEntry()
})()
