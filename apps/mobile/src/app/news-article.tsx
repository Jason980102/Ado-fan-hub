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
    source_url?: string; image_url?: string;
  }>();
  const router = useRouter();
  const layout = useWebLayout();
  const [imageFailed, setImageFailed] = useState(false);
  const [linkFailed, setLinkFailed] = useState(false);
  const sourceUrl = params.source_url ?? '';
  const validUrl = /^https:\/\//i.test(sourceUrl);
  const imageUrl = params.image_url ?? '';
  const showImage = /^https:\/\//i.test(imageUrl) && !imageFailed;
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
          <Text style={s.note}>{w.note}</Text>
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
  title: { color: C.text, fontSize: 22, fontWeight: '800', lineHeight: 32 },
  meta: { color: C.muted, fontSize: 13 },
  note: { color: C.muted, fontSize: 14, lineHeight: 23 },
  button: { padding: 14, borderRadius: 12, backgroundColor: C.selected, alignSelf: 'flex-start' },
  buttonText: { color: C.accent, fontSize: 14, fontWeight: '700' },
  all: { paddingVertical: 10, alignSelf: 'flex-start' },
  link: { color: C.accent, fontWeight: '700', fontSize: 14 },
});
