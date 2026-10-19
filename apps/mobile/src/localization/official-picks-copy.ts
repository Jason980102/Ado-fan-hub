/**
 * Ado-curated third-party covers.
 * The playlist title retains its official Japanese spelling.
 */

export type OfficialPicksCopy = {
  heading: string;
  description: string;
  creator: string;
  count: (n: number) => string;
  loading: string;
  unavailable: string;
  empty: string;
  openPlaylist: string;
  retry: string;
};

const copy = {
  zh: {
    heading: '\u{1F3A4}\u7D20\u6575\u306A\u6B4C\u3063\u3066\u307F\u305F',
    description: '\u0041\u0064\u006F \u5B98\u65B9\u7CBE\u9078\u7684\u5176\u4ED6\u5275\u4F5C\u8005\u7FFB\u5531\u4F5C\u54C1',
    creator: '\u5275\u4F5C\u8005',
    count: (n: number) => `${n} \u90E8\u5F71\u7247`,
    loading: '\u6B63\u5728\u8F09\u5165\u5B98\u65B9\u7CBE\u9078\u2026',
    unavailable: '\u5B98\u65B9\u7CBE\u9078\u66AB\u6642\u7121\u6CD5\u8F09\u5165',
    empty: '\u76EE\u524D\u6C92\u6709\u53EF\u986F\u793A\u7684\u5F71\u7247',
    openPlaylist: '\u5728 YouTube \u67E5\u770B\u5B8C\u6574\u6E05\u55AE',
    retry: '\u91CD\u8A66',
  },
  en: {
    heading: '\u{1F3A4}\u7D20\u6575\u306A\u6B4C\u3063\u3066\u307F\u305F',
    description: 'Covers by other creators, curated by Ado',
    creator: 'Creator',
    count: (n: number) => `${n} videos`,
    loading: 'Loading official picks\u2026',
    unavailable: 'Official picks are temporarily unavailable',
    empty: 'No videos available',
    openPlaylist: 'View full playlist on YouTube',
    retry: 'Retry',
  },
  ja: {
    heading: '\u{1F3A4}\u7D20\u6575\u306A\u6B4C\u3063\u3066\u307F\u305F',
    description: 'Ado\u516C\u5F0F\u304C\u9078\u3093\u3060\u3001\u307B\u304B\u306E\u30AF\u30EA\u30A8\u30A4\u30BF\u30FC\u306B\u3088\u308B\u6B4C\u3063\u3066\u307F\u305F',
    creator: '\u6295\u7A3F\u8005',
    count: (n: number) => `${n}\u672C\u306E\u52D5\u753B`,
    loading: '\u516C\u5F0F\u30BB\u30EC\u30AF\u30B7\u30E7\u30F3\u3092\u8AAD\u307F\u8FBC\u307F\u4E2D\u2026',
    unavailable: '\u516C\u5F0F\u30BB\u30EC\u30AF\u30B7\u30E7\u30F3\u3092\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093',
    empty: '\u8868\u793A\u3067\u304D\u308B\u52D5\u753B\u304C\u3042\u308A\u307E\u305B\u3093',
    openPlaylist: 'YouTube\u3067\u30D7\u30EC\u30A4\u30EA\u30B9\u30C8\u3092\u898B\u308B',
    retry: '\u518D\u8A66\u884C',
  },
} satisfies Record<string, OfficialPicksCopy>;

export function officialPicksCopy(language: string): OfficialPicksCopy {
  if (language.startsWith('ja')) return copy.ja;
  if (language.startsWith('zh')) return copy.zh;
  return copy.en;
}
