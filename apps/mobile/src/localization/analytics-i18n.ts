import i18n from './i18n';

const translations = {
  en: {
    tab: 'Analytics', title: 'Ado Analytics',
    subtitle: 'Public statistics from the official YouTube channel.',
    subscribers: 'Subscribers', views: 'Channel views', videos: 'Public videos',
    approx: 'Approx.', unknown: 'Unavailable', refresh: 'Refresh',
    loading: 'Loading YouTube data...', error: 'Unable to load data. Please retry.',
    retry: 'Try again', updated: 'Fetched', cache: 'Cached response',
    fresh: 'Newly fetched', note: 'Server cache: 10 minutes. Refresh may return the same data.',
    mv: 'MV views', scope: 'Three selected recent MVs, ranked by views. The selection does not update automatically.',
    empty: 'No MV data available.', missing: 'Some selected videos are unavailable.',
    published: 'Published', watch: 'Watch on YouTube',
    linkError: 'Unable to open YouTube.', source: 'Source',
  },
  'zh-TW': {
    tab: '數據', title: 'Ado Analytics',
    subtitle: '來自官方 YouTube 頻道的公開統計。',
    subscribers: '訂閱人數', views: '頻道總觀看數', videos: '公開影片數',
    approx: '約', unknown: '無資料', refresh: '重新整理',
    loading: '正在載入 YouTube 數據…', error: '無法載入數據，請重試。',
    retry: '重試', updated: '抓取時間', cache: '快取資料',
    fresh: '新抓取資料', note: '後端快取 10 分鐘，重新整理可能取得相同資料。',
    mv: 'MV 觀看數', scope: '目前選定近期 3 支 MV，依觀看數排序；清單尚不會自動更新。',
    empty: '目前沒有 MV 數據。', missing: '部分指定影片暫時無法取得。',
    published: '發布日期', watch: '前往 YouTube',
    linkError: '無法開啟 YouTube。', source: '資料來源',
  },
  ja: {
    tab: 'データ', title: 'Ado Analytics',
    subtitle: '公式YouTubeチャンネルの公開統計。',
    subscribers: '登録者数', views: 'チャンネル総再生回数', videos: '公開動画数',
    approx: '約', unknown: 'データなし', refresh: '更新',
    loading: 'YouTubeデータを読み込み中…', error: 'データを取得できませんでした。再試行してください。',
    retry: '再試行', updated: '取得日時', cache: 'キャッシュ',
    fresh: '新しく取得', note: 'サーバーのキャッシュは10分間です。更新しても同じデータが表示される場合があります。',
    mv: 'MV再生回数', scope: '選択した最近のMV 3本を再生回数順に表示。対象リストは自動更新されません。',
    empty: 'MVデータがありません。', missing: '一部の動画を取得できません。',
    published: '公開日', watch: 'YouTubeで見る',
    linkError: 'YouTubeを開けませんでした。', source: '情報元',
  },
};

for (const [language, texts] of Object.entries(translations)) {
  i18n.addResourceBundle(language, 'analytics', texts, true, true);
}

i18n.addResourceBundle('zh-TW', 'analytics', {
  historyTitle: '最近 {{days}} 天的歷史趨勢',
  historyRange: '{{days}} 天',
  historyNote: '僅顯示已累積的快照；訂閱數為公開約數。縱軸自動縮放，上下界限並非實際增減。',
  historyError: '歷史趨勢載入失敗，請重新整理。',
  historyTruncated: '資料超過筆數上限，目前僅顯示最近部分。',
}, true, true);

i18n.addResourceBundle('en', 'analytics', {
  historyTitle: 'History · Last {{days}} days',
  historyRange: '{{days}} days',
  historyNote: 'Only collected snapshots are shown. Subscriber counts are approximate. The vertical axis scales automatically; its bounds are not actual changes.',
  historyError: 'Unable to load history. Please refresh.',
  historyTruncated: 'The record limit was reached. Only the most recent records are shown.',
}, true, true);

i18n.addResourceBundle('ja', 'analytics', {
  historyTitle: '過去{{days}}日間の推移',
  historyRange: '{{days}}日',
  historyNote: '収集済みの記録のみ表示します。登録者数は概数です。縦軸は自動調整され、上下限は実際の増減ではありません。',
  historyError: '履歴を取得できませんでした。更新してください。',
  historyTruncated: '件数の上限に達したため、直近の記録のみ表示しています。',
}, true, true);

const rankingTranslations = {
  'zh-TW': {
    rankingTitle: 'MV 觀看數前 10 名',
    rankingAll: '綜合',
    rankingOriginal: '原創曲',
    rankingCover: 'Cover',
    rankingScope: '依指定的原創與 Cover 播放清單排名；綜合排名合併去重。僅比較可取得觀看數的影片。',
    videoViews: '觀看次數',
  },
  en: {
    rankingTitle: 'Top 10 MV views',
    rankingAll: 'Overall',
    rankingOriginal: 'Original',
    rankingCover: 'Cover',
    rankingScope: 'Ranked within the selected Original and Cover playlists. Overall combines both without duplicates. Only videos with available view counts are ranked.',
    videoViews: 'views',
  },
  ja: {
    rankingTitle: 'MV再生回数トップ10',
    rankingAll: '総合',
    rankingOriginal: 'オリジナル',
    rankingCover: 'カバー',
    rankingScope: '指定のオリジナル・カバー再生リスト内の順位です。総合では重複を除外し、再生回数を取得できた動画のみ比較します。',
    videoViews: '再生回数',
  },
};

for (const [language, texts] of Object.entries(rankingTranslations)) {
  i18n.addResourceBundle(language, 'analytics', texts, true, true);
}