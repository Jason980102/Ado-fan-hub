const copy = {
  zh: {
    eyebrow: '你的 Ado 粉絲夥伴', hero: '從一首歌，走進 Ado 的世界。',
    intro: '認識她的音樂歷程，探索原唱與 Cover，掌握官方最新消息。',
    about: '認識 Ado', aboutNote: '簡介、基本資料與音樂歷程', listen: '探索 MV',
    news: '最新消息', newsNote: '官方公告與最新動態', all: '查看全部',
    analytics: '數據分析', analyticsNote: '頻道概況、觀看增長與排行', official: '官方入口', officialNote: '社群、會員網站與周邊商店',
    mvNote: '原唱與 Cover，找到想聽的歌曲', shortcuts: '繼續探索', retry: '重新載入', refresh: '重新整理',
    error: '消息暫時無法載入，請稍後重試。', empty: '目前沒有可顯示的消息。', linkError: '無法開啟連結，請稍後重試。',
    biography: '關於 Ado', bio: 'Ado 是來自東京的日本歌手，於 2020 年以〈うっせぇわ〉正式出道。從原創歌曲到翻唱作品，她的音樂也延伸至《ONE PIECE FILM RED》的歌曲演唱。',
    facts: '基本資料', birthday: '出生日期', hometown: '出身地', tokyo: '日本・東京', debut: '正式出道',
    journey: '音樂歷程精選', releases: ['以〈うっせぇわ〉正式出道', '首張專輯《狂言》發行', '《ウタの歌 ONE PIECE FILM RED》發行', '第二張專輯《残夢》發行', '精選輯《Adoのベストアドバム》發行'],
    sources: '官方資料來源', sourceNote: '簡介與歷程依官方公開資料整理；完整資訊請查看官方網站。',
    footer: '非官方粉絲專案，與 Ado 官方無隸屬關係。',
  },
  en: {
    eyebrow: 'YOUR ADO COMPANION', hero: 'One song. A whole world to discover.',
    intro: 'Get to know Ado, explore originals and covers, and catch up on official news.',
    about: 'Meet Ado', aboutNote: 'Biography, profile and music milestones', listen: 'Explore MVs',
    news: 'Latest news', newsNote: 'Official announcements and updates', all: 'View all',
    analytics: 'Analytics', analyticsNote: 'Channel totals, view growth and rankings', official: 'Official links', officialNote: 'Social accounts, fan club and merchandise',
    mvNote: 'Discover original songs and covers', shortcuts: 'Keep exploring', retry: 'Retry', refresh: 'Refresh',
    error: 'News is temporarily unavailable. Please try again.', empty: 'No news to display yet.', linkError: 'Unable to open this link. Please try again.',
    biography: 'About Ado', bio: 'Ado is a Japanese singer from Tokyo who made her major debut with “Usseewa” in 2020. Her work spans original songs, covers and songs for ONE PIECE FILM RED.',
    facts: 'At a glance', birthday: 'Date of birth', hometown: 'From', tokyo: 'Tokyo, Japan', debut: 'Major debut',
    journey: 'Selected music milestones', releases: ['Major debut with “Usseewa”', 'First album: Kyogen', 'Uta’s Songs: ONE PIECE FILM RED', 'Second album: Zanmu', 'Greatest-hits album: Ado no Best Adobum'],
    sources: 'Official sources', sourceNote: 'Profile and milestones summarized from public official sources. Visit the official sites for full details.',
    footer: 'Unofficial fan project · Not affiliated with Ado',
  },
  ja: {
    eyebrow: 'あなたの Ado ファンコンパニオン', hero: '一曲から、Adoの世界へ。',
    intro: 'Adoの歩みを知り、オリジナル曲やカバーを探し、公式情報をチェック。',
    about: 'Adoを知る', aboutNote: 'プロフィールと音楽の歩み', listen: 'MVを探す',
    news: '最新情報', newsNote: '公式のお知らせと最新情報', all: 'すべて見る',
    analytics: 'データ分析', analyticsNote: 'チャンネル情報・再生数の増減・ランキング', official: '公式リンク', officialNote: 'SNS・ファンクラブ・グッズショップ',
    mvNote: 'オリジナル曲とカバーを探す', shortcuts: 'もっと楽しむ', retry: '再試行', refresh: '更新',
    error: 'お知らせを取得できません。もう一度お試しください。', empty: '表示できるお知らせがありません。', linkError: 'リンクを開けませんでした。',
    biography: 'Adoについて', bio: '東京出身の歌い手。2020年に「うっせぇわ」でメジャーデビュー。オリジナル曲や歌ってみたに加え、『ONE PIECE FILM RED』の楽曲でも歌声を届けています。',
    facts: 'プロフィール', birthday: '生年月日', hometown: '出身地', tokyo: '東京都', debut: 'メジャーデビュー',
    journey: '音楽の歩み・ピックアップ', releases: ['「うっせぇわ」でメジャーデビュー', '1stアルバム『狂言』発売', '『ウタの歌 ONE PIECE FILM RED』発売', '2ndアルバム『残夢』発売', '『Adoのベストアドバム』発売'],
    sources: '公式情報', sourceNote: '公式公開情報をもとに紹介しています。詳細は公式サイトをご確認ください。',
    footer: '非公式ファンプロジェクト · Ado公式とは関係ありません',
  },
};
export function hubCopy(language: string) {
  return copy[language.startsWith('zh') ? 'zh' : language.startsWith('ja') ? 'ja' : 'en'];
}
export const profileSources = [
  { title: 'Cloud Nine · Ado', url: 'https://cloud9pro.co.jp/artist/profile/ado/' },
  { title: 'UNIVERSAL MUSIC JAPAN', url: 'https://www.universal-music.co.jp/ado/biography/' },
];
export const milestoneDates = ['2020.10.23', '2022.01.26', '2022.08.10', '2024.07.10', '2025.04.09'];
