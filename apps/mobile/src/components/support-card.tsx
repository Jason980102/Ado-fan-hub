import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { FanColors as C } from '@/constants/fan-theme';

const copy = {
  zh: { title: '支持開發者', body: '喜歡 Ado Fan Hub 嗎？歡迎打賞，支持這個粉絲專案的開發與維護。', button: '透過 PayPal 打賞我 ↗', pending: '打賞連結即將開放', error: '無法開啟 PayPal，請再試一次。' },
  en: { title: 'Support the developer', body: 'Enjoying Ado Fan Hub? Leave a tip to support development and maintenance of this fan project.', button: 'Tip me with PayPal ↗', pending: 'Tipping will be available soon', error: 'Unable to open PayPal. Please try again.' },
  ja: { title: '開発者を応援', body: 'Ado Fan Hubを気に入っていただけたら、このファンプロジェクトの開発・維持をチップで応援できます。', button: 'PayPalで応援する ↗', pending: '応援リンクは準備中です', error: 'PayPalを開けません。もう一度お試しください。' },
};

function paypalSupportUrl() {
  const value = process.env.EXPO_PUBLIC_PAYPAL_SUPPORT_URL?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      && ['paypal.me', 'www.paypal.me', 'paypal.com', 'www.paypal.com'].includes(url.hostname)
      && url.pathname !== '/' && (!url.port || url.port === '443') ? url.href : null;
  } catch { return null; }
}

export default function SupportCard() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage || i18n.language;
  const w = copy[language.startsWith('zh') ? 'zh' : language.startsWith('ja') ? 'ja' : 'en'];
  const url = paypalSupportUrl();
  const [error, setError] = useState(false);
  async function open() {
    if (!url) return;
    setError(false);
    try { await Linking.openURL(url); } catch { setError(true); }
  }
  return <View style={s.card}>
    <Text accessibilityRole="header" style={s.title}>{w.title}</Text>
    <Text style={s.body}>{w.body}</Text>
    <Pressable accessibilityRole="link" accessibilityState={{ disabled: !url }} disabled={!url}
      onPress={() => void open()} style={({ pressed }) => [s.button, !url && s.disabled, pressed && s.pressed]}>
      <Text style={s.buttonText}>{url ? w.button : w.pending}</Text>
    </Pressable>
    {error && <Text accessibilityRole="alert" style={s.body}>{w.error}</Text>}
  </View>;
}
const s = StyleSheet.create({
  card: { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, borderRadius: 22, padding: 24, gap: 12 },
  title: { color: C.text, fontSize: 21, fontWeight: '700' },
  body: { color: C.muted, fontSize: 14, lineHeight: 23 },
  button: { alignSelf: 'flex-start', maxWidth: '100%', backgroundColor: C.accent, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 14 },
  buttonText: { color: C.background, fontSize: 14, fontWeight: '700', flexShrink: 1 },
  disabled: { opacity: 0.5 }, pressed: { opacity: 0.8 },
});
