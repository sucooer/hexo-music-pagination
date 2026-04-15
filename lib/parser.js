'use strict'

const { hasText } = require('./helper')

const getDataSource = (hexo, dataFile) => {
  const dataMethods = [
    () => hexo.locals && typeof hexo.locals.get === 'function' && hexo.locals.get('data'),
    () => hexo.site && typeof hexo.site.get === 'function' && hexo.site.get('data'),
    () => hexo.locals && typeof hexo.locals.toObject === 'function' && hexo.locals.toObject().data,
    () => hexo.site && typeof hexo.site.toObject === 'function' && hexo.site.toObject().data,
    () => hexo.theme && hexo.theme.config && hexo.theme.config.data,
    () => hasText(dataFile) ? require(require('path').join(hexo.base_dir, 'source', '_data', dataFile)) : null
  ]

  for (const method of dataMethods) {
    try {
      const result = method()
      if (result && typeof result === 'object') return result
    } catch (e) {
      continue
    }
  }

  return {}
}

const loadEntries = (hexo, dataFile) => {
  const siteData = getDataSource(hexo, dataFile)
  const dataKey = dataFile ? dataFile.replace(/\.ya?ml$/, '') : 'music'
  const entries = siteData[dataKey]

  return Array.isArray(entries) ? entries : []
}

module.exports = {
  getDataSource,
  loadEntries
}