import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Image, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import RoseScrollView from '@/components/rose-scroll-view';
import { FanColors as C } from '@/constants/fan-theme';
import { useWebLayout } from '@/hooks/use-web-layout';

export default function NewsArticleScreen() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage || i18n.language;
  const w = language.startsWith('zh') ? {
    heading: '最新消息', official: '查看官方原文 ↗', list: '查看全部消息 →',
    note: '此頁顯示官方消息來源提供的標題、日期與圖片；完整文章請查看原始網站。',
    error: '無法開啟官方連結。',
  } : language.startsWith('ja') ? {
    heading: '最新情報', official: '公式記事を開く ↗', list: 'すべてのお知らせ →',
    note: 'このページには公開されているタイトル、日時、画像を掲載しています。本文は元サイトをご確認ください。',
    error: '公式リンクを開けませんでした。',
  } : {
    heading: 'Latest news', official: 'Read official article ↗', list: 'All news →',
    note: 'This page displays available source information, not a reproduced article. Read the original for full details.',
    error: 'Unable to open the official link.',
  };
  const params = useLocalSearchParams<{
    title?: string; published_at?: string; source_name?: string;
    source_url?: string; image_url?: string; summary?: string;
  }>();
  const router = useRouter();
  const layout = useWebLayout();
  const [imageFailed, setImageFailed] = useState(false);
  const [linkFailed, setLinkFailed] = useState(false);
  const sourceUrl = params.source_url ?? '';
  const validUrl = /^https:\/\//i.test(sourceUrl);
  const imageUrl = params.image_url ?? '';
  const showImage = /^https:\/\//i.test(imageUrl) && !imageFailed;
  const eventDates = Array.from(
    new Set(
      (params.summary ?? '').match(
        /(?<!\d)(?:0?[1-9]|1[0-2])\/(?:3[01]|[12]\d|0?[1-9])(?!\d)(?:\([^)]+\))?/g
      ) ?? []
    )
  ).slice(0, 4);

  async function openOfficial() {
    setLinkFailed(false);
    try {
      if (!validUrl) throw new Error('Invalid source');
      await Linking.openURL(sourceUrl);
    } catch { setLinkFailed(true); }
  }
  return (
    <SafeAreaView style={s.screen} edges={Platform.OS === 'web' ? ['top'] : ['left', 'right']}>
      <RoseScrollView contentContainerStyle={[s.content, layout.contentStyle]}>
        <Text style={s.eyebrow}>ADO FAN HUB</Text>
        <Text style={s.heading}>{w.heading}</Text>
        <View style={s.card}>
          {showImage && (
            <Image source={{ uri: imageUrl }} style={s.image} resizeMode="contain"
              onError={() => setImageFailed(true)} />
          )}
          <Text style={s.title}>{params.title || w.heading}</Text>
          <Text style={s.meta}>{[params.published_at?.slice(0, 10), params.source_name].filter(Boolean).join(' · ')}</Text>
          {params.summary?.trim() ? (
            <View style={s.articleBody}>
              {params.source_name === 'Ado Fan Club News' && eventDates.length > 0 && (
                <View style={s.factsSection}>
                  <Text style={s.factsHeading}>
                    {language.startsWith('zh') ? '\u6d88\u606f\u91cd\u9ede' :
                      language.startsWith('ja') ? '\u304a\u77e5\u3089\u305b\u306e\u8981\u70b9' :
                      'Key details'}
                  </Text>
                  <Text style={s.factsDescription}>
                    {language.startsWith('zh') ? '\u516c\u544a\u4e2d\u63d0\u5230\u7684\u65e5\u671f' :
                      language.startsWith('ja') ? '\u672c\u6587\u306b\u8a18\u8f09\u3055\u308c\u305f\u65e5\u4ed8' :
                      'Dates mentioned in the announcement'}
                  </Text>
                  <View style={s.dateRow}>
                    {eventDates.map((date) => (
                      <View key={date} style={s.dateChip}>
                        <Text style={s.dateChipText}>{date}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
              <Text style={s.bodyLabel}>
                {language.startsWith('zh') ? '\u516c\u958b\u5167\u5bb9\u7bc0\u9304' :
                  language.startsWith('ja') ? '\u516c\u958b\u6587\u306e\u629c\u7c8b' :
                  'Public excerpt'}
              </Text>
              <Text style={s.bodyText}>{params.summary}</Text>
              <Text style={s.note}>
                {language.startsWith('zh') ? '\u4ee5\u5b98\u65b9\u539f\u6587\u70ba\u6e96\u3002' :
                  language.startsWith('ja') ? '\u8a73\u7d30\u306f\u516c\u5f0f\u8a18\u4e8b\u3092\u3054\u78ba\u8a8d\u304f\u3060\u3055\u3044\u3002' :
                  'See the official article for complete details.'}
              </Text>
            </View>
          ) : (
            <Text style={s.note}>
              {params.source_name === 'Ado Fan Club News'
                ? (language.startsWith('zh')
                    ? '\u6b64\u7bc7\u6d88\u606f\u76ee\u524d\u6c92\u6709\u53ef\u65bc App \u986f\u793a\u7684\u516c\u958b\u5167\u5bb9\u7bc0\u9304\uff0c\u8acb\u81f3\u5b98\u65b9\u7db2\u7ad9\u67e5\u770b\u3002'
                    : language.startsWith('ja')
                      ? '\u3053\u306e\u304a\u77e5\u3089\u305b\u306f App \u5185\u3067\u8868\u793a\u3067\u304d\u308b\u516c\u958b\u629c\u7c8b\u304c\u3042\u308a\u307e\u305b\u3093\u3002\u516c\u5f0f\u30b5\u30a4\u30c8\u3092\u3054\u78ba\u8a8d\u304f\u3060\u3055\u3044\u3002'
                      : 'No public excerpt is available in the app. Please see the official article.')
                : w.note}
            </Text>
          )}
          {validUrl && (
            <Pressable accessibilityRole="link" onPress={() => void openOfficial()} style={s.button}>
              <Text style={s.buttonText}>{w.official}</Text>
            </Pressable>
          )}
          {linkFailed && <Text accessibilityRole="alert" style={s.meta}>{w.error}</Text>}
        </View>
        <Pressable accessibilityRole="button" onPress={() => router.push('/news')} style={s.all}>
          <Text style={s.link}>{w.list}</Text>
        </Pressable>
      </RoseScrollView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background },
  content: { width: '100%', maxWidth: 850, alignSelf: 'center', padding: 24, paddingTop: Platform.OS === 'web' ? 110 : 8, paddingBottom: 110, gap: 18 },
  eyebrow: { color: C.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1.4 },
  heading: { color: C.text, fontSize: 28, fontWeight: '800' },
  card: { backgroundColor: C.surface, borderRadius: 20, padding: 20, gap: 16 },
  image: { width: '100%', height: 230, borderRadius: 14, backgroundColor: C.surfaceAlt },
  title: { color: C.text, fontSize: 20, fontWeight: '800', lineHeight: 29 },
  meta: { color: C.muted, fontSize: 13 },
  note: { color: C.muted, fontSize: 14, lineHeight: 23 },
  articleBody: {
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.muted,
    gap: 12,
  },
  factsSection: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: C.surfaceAlt,
    gap: 8,
  },
  factsHeading: {
    color: C.accent,
    fontSize: 15,
    fontWeight: '700',
  },
  factsDescription: {
    color: C.muted,
    fontSize: 12,
  },
  dateRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dateChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: C.selected,
  },
  dateChipText: {
    color: C.text,
    fontSize: 14,
    fontWeight: '700',
  },
  bodyLabel: { color: C.accent, fontSize: 13, fontWeight: '700' },
  bodyText: { color: C.text, fontSize: 15, lineHeight: 26 },
  button: { padding: 14, borderRadius: 12, backgroundColor: C.selected, alignSelf: 'flex-start' },
  buttonText: { color: C.accent, fontSize: 14, fontWeight: '700' },
  all: { paddingVertical: 10, alignSelf: 'flex-start' },
  link: { color: C.accent, fontWeight: '700', fontSize: 14 },
});
