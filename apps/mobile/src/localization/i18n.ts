import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

export const supportedLanguages = ['en', 'zh-TW', 'ja'] as const;

export type AppLanguage = (typeof supportedLanguages)[number];

export const resources = {
  en: {
    translation: {
      home: 'Home',
      news: 'News',
      following: 'Following',
      settings: 'Settings',
      welcome: 'Welcome to Ado Fan Hub',
      language: 'Language',
      region: 'Country / Region',
      timeZone: 'Time Zone',
      save: 'Save Settings',
      settingsSaved: 'Settings saved successfully',
      getStarted: 'Get Started',
    },
  },
  'zh-TW': {
    translation: {
      home: '首頁',
      news: '最新消息',
      following: '追蹤',
      settings: '設定',
      welcome: '歡迎使用 Ado Fan Hub',
      language: '語言',
      region: '國家 / 地區',
      timeZone: '時區',
      save: '儲存設定',
      settingsSaved: '設定已成功儲存',
      getStarted: '開始使用',
    },
  },
  ja: {
    translation: {
      home: 'ホーム',
      news: 'ニュース',
      following: 'フォロー',
      settings: '設定',
      welcome: 'Ado Fan Hub へようこそ',
      language: '言語',
      region: '国・地域',
      timeZone: 'タイムゾーン',
      save: '設定を保存',
      settingsSaved: '設定を保存しました',
      getStarted: 'はじめる',
    },
  },
};

i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  supportedLngs: [...supportedLanguages],
  interpolation: {
    escapeValue: false,
  },
  initAsync: false,
});

export default i18n;

