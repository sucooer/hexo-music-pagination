# hexo-music-pagination

Hexo 插件 - 音乐时间流页面，支持自动歌词获取、封面获取和分页。

## 功能特性

- 自动分页生成（默认每页5条）
- 自动从 LRCLIB 获取同步歌词
- 自动从 MetingAPI 获取封面
- 支持直链音频和平台音频（网易云等）
- 响应式分页导航

## 安装

```bash
npm install hexo-music-pagination --save
```

## 配置

在 Hexo 配置文件中添加：

```yaml
# _config.yml
music_pagination:
  enabled: true
  per_page: 5                # 每页条数，默认5
  data_file: music.yml       # 数据源文件
  route_prefix: music        # 路由前缀
  auto_lyrics: true         # 自动获取歌词
  auto_cover: true         # 自动获取封面
  lyrics_api: https://lrclib.net/api/
  meting_api: https://api.injahow.cn/meting/api
  carousel_limit: 10        # 首页轮播显示条数
```

## 数据源格式

在 `source/_data/music.yml` 中添加记录：

```yaml
# 直链模式
- dateLabel: 2026.04.14
  orderLabel: Day 012
  label: TODAY'S PICK
  title: トリセツ
  artist: 西野カナ
  intro: 一句介绍
  quote: “引用句”
  coverKicker: Now Playing
  coverSrc: /path/to/cover.jpg
  audioSrc: /path/to/audio.mp3
  writing:
    tag: 今日文字
    title: 正文标题
    paragraphs:
      - 第一段正文
      - 第二段正文

# 平台模式
- dateLabel: 2026.04.13
  orderLabel: Day 011
  label: TODAY'S PICK
  title: 明年今日
  artist: 陈奕迅
  intro: 一句介绍
  quote: “引用句”
  coverKicker: Now Playing
  platform:
    server: netease
    type: song
    id: "65952"
  writing:
    tag: 今日文字
    title: 正文标题
    paragraphs:
      - 正文
```

## 生成页面

- 首页: `/music/`
- 分页: `/music/page/2/`, `/music/page/3/` ...
- 轮播数据: `/music/home-carousel.json`

## 字段说明

| 字段 | 必填 | 说明 |
|-------|------|------|
| dateLabel | 是 | 日期，如 2026.04.14 |
| orderLabel | 是 | 序号，如 Day 001 |
| label | 否 | 标签，如 TODAY'S PICK |
| title | 是 | 歌曲名 |
| artist | 是 | 歌手 |
| intro | 否 | 歌曲介绍 |
| quote | 否 | 引用句 |
| coverKicker | 否 | 播放器小标题 |
| audioSrc | 否* | 直链音频地址 |
| platform | 否* | 平台信息 (server/type/id) |
| writing | 是 | 正文内容 |

* audioSrc 和 platform 二选一

## 使用自定义模板

如果需要自定义页面模板，设置 template 路径：

```yaml
music_pagination:
  template: /path/to/your-template.ejs
```

## 依赖

- hexo >= 7.0.0
- node >= 16.0.0

## License

MIT