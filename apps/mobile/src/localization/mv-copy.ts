const copy = {
  zh: {
    title: '影音作品', all: '全部', original: '原唱', cover: '翻唱', live: '現場演出', collaboration: '合作作品', other: '其他', unclassified: '未分類',
    search: '搜尋歌名、官方英文名稱或別名…', clear: '清除搜尋', reset: '清除搜尋與分類',
    hint: '支援日文、官方多語歌名及部分關鍵字；尚無官方別名的寫法可能找不到。',
    empty: '沒有符合條件的作品，請試試其他歌名或分類。', count: '符合條件的作品：',
    views: '觀看次數', likes: '按讚人數', image: '無縮圖', published: '發布日期', watch: '觀看影片 ↗',
    scope: '收錄 Ado 官方播放清單中的原唱、翻唱、Live、Remix 與客串作品；分類待確認的影片保留未分類。',
    partial: '部分官方播放清單暫時無法取得，目前顯示可用來源。', missing: '部分影片已不可用或缺少必要資料，未顯示在清單中。',
    error: '影音目錄暫時無法載入，請重試。', retry: '重試', loading: '正在載入影音目錄…',
    more: '顯示更多作品', newest: '最新發布', oldest: '最早發布', popular: '熱門作品',
  },
  en: {
    title: 'Video library', all: 'All', original: 'Original', cover: 'Cover', live: 'Live', collaboration: 'Collaboration', other: 'Other', unclassified: 'Unclassified',
    search: 'Search songs, official English titles or aliases…', clear: 'Clear search', reset: 'Clear search and category',
    hint: 'Search Japanese titles, official localized names or partial keywords. Names without official aliases may not match.',
    empty: 'No matching videos. Try another title or category.', count: 'Matching videos: ',
    views: 'Views', likes: 'Likes', image: 'No thumbnail', published: 'Published', watch: 'Watch video ↗',
    scope: 'Originals, covers, live videos, remixes and guest works from Ado’s official playlists. Unverified types remain unclassified.',
    partial: 'Some official playlists are unavailable. Showing available sources.', missing: 'Some videos are unavailable or missing required data and are not shown.',
    error: 'Unable to load the video library. Please retry.', retry: 'Retry', loading: 'Loading video library…',
    more: 'Show more videos', newest: 'Newest', oldest: 'Oldest', popular: 'Most viewed',
  },
  ja: {
    title: '映像ライブラリ', all: 'すべて', original: 'オリジナル', cover: 'カバー', live: 'ライブ', collaboration: 'コラボ', other: 'その他', unclassified: '未分類',
    search: '曲名・公式英語名・別名を検索…', clear: '検索をクリア', reset: '検索と分類をクリア',
    hint: '日本語名・公式の多言語曲名・部分キーワードに対応。公式の別名がない表記は一致しない場合があります。',
    empty: '該当する作品がありません。曲名や分類を変えてください。', count: '該当する作品：',
    views: '再生回数', likes: '高評価数', image: '画像なし', published: '公開日', watch: '動画を見る ↗',
    scope: 'Ado公式プレイリストのオリジナル・カバー・ライブ・Remix・ゲスト作品を収録。種類を確認できない動画は未分類です。',
    partial: '一部の公式プレイリストを取得できないため、利用できる作品を表示しています。', missing: '利用不可または必要な情報のない動画は表示されません。',
    error: '映像ライブラリを取得できません。再試行してください。', retry: '再試行', loading: '映像ライブラリを読み込み中…',
    more: 'さらに表示', newest: '新しい順', oldest: '古い順', popular: '人気順',
  },
};
export function mvCopy(language: string) {
  return copy[language.startsWith('zh') ? 'zh' : language.startsWith('ja') ? 'ja' : 'en'];
}
