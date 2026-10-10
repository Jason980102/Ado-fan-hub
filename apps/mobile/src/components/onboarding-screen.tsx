import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { usePreferences } from '@/contexts/preferences-context';
import type { UserPreferences } from '@/services/preferences';

type Option = {
  value: string;
  label: string;
};

const languages: Option[] = [
  { value: 'en', label: 'English' },
  { value: 'zh-TW', label: '繁體中文' },
  { value: 'ja', label: '日本語' },
];

const regions: Option[] = [
  { value: 'US', label: 'United States' },
  { value: 'TW', label: 'Taiwan' },
  { value: 'JP', label: 'Japan' },
  { value: 'KR', label: 'South Korea' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'CA', label: 'Canada' },
  { value: 'AU', label: 'Australia' },
];

const timeZones: Option[] = [
  { value: 'America/New_York', label: 'New York' },
  { value: 'America/Los_Angeles', label: 'Los Angeles' },
  { value: 'America/Toronto', label: 'Toronto' },
  { value: 'Asia/Taipei', label: 'Taipei' },
  { value: 'Asia/Tokyo', label: 'Tokyo' },
  { value: 'Asia/Seoul', label: 'Seoul' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Australia/Sydney', label: 'Sydney' },
];

function nextValue(current: string, options: Option[]) {
  const index = options.findIndex((item) => item.value === current);
  return options[(index + 1) % options.length].value;
}

function displayValue(current: string, options: Option[]) {
  return options.find((item) => item.value === current)?.label ?? current;
}

const translations = {
  en: {
    title: 'Welcome to Ado Fan Hub',
    subtitle: 'Personalize your fan experience.',
    language: 'Language',
    region: 'Country / Region',
    timeZone: 'Time Zone',
    start: 'Get Started',
    hint: 'Tap each setting to change its value.',
  },
  'zh-TW': {
    title: '歡迎使用 Ado Fan Hub',
    subtitle: '打造你的個人化粉絲體驗。',
    language: '語言',
    region: '國家 / 地區',
    timeZone: '時區',
    start: '開始使用',
    hint: '點擊設定項目即可切換選項。',
  },
  ja: {
    title: 'Ado Fan Hub へようこそ',
    subtitle: 'あなたに合ったファン体験を設定しましょう。',
    language: '言語',
    region: '国・地域',
    timeZone: 'タイムゾーン',
    start: 'はじめる',
    hint: '各項目をタップして変更できます。',
  },
};

export default function OnboardingScreen() {
  const { preferences, updatePreferences } = usePreferences();

  const [draft, setDraft] = useState<UserPreferences>(preferences);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const text = translations[draft.language];

  function changeSetting(
    field: 'language' | 'region' | 'timeZone',
    options: Option[]
  ) {
    setDraft((current) => ({
      ...current,
      [field]: nextValue(current[field], options),
    }));
    setError('');
  }

  async function handleStart() {
    if (saving) return;

    setSaving(true);
    setError('');

    try {
      await updatePreferences({
        ...draft,
        onboardingCompleted: true,
      });
    } catch (err) {
      console.error('Failed to complete onboarding:', err);
      setError('Unable to save settings. Please try again.');

      if (Platform.OS !== 'web') {
        Alert.alert(
          'Save failed',
          'Unable to save settings. Please try again.'
        );
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.brand}>ADO FAN HUB</Text>

        <Text style={styles.eyebrow}>WELCOME</Text>
        <Text style={styles.title}>{text.title}</Text>
        <Text style={styles.subtitle}>{text.subtitle}</Text>

        <View style={styles.card}>
          <SettingRow
            label={text.language}
            value={displayValue(draft.language, languages)}
            onPress={() => changeSetting('language', languages)}
          />

          <SettingRow
            label={text.region}
            value={displayValue(draft.region, regions)}
            onPress={() => changeSetting('region', regions)}
          />

          <SettingRow
            label={text.timeZone}
            value={displayValue(draft.timeZone, timeZones)}
            onPress={() => changeSetting('timeZone', timeZones)}
          />
        </View>

        <Text style={styles.hint}>{text.hint}</Text>

        <Pressable
          style={[styles.button, saving && styles.disabled]}
          onPress={handleStart}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>{text.start} →</Text>
          )}
        </Pressable>

        {error !== '' && (
          <Text style={styles.error}>{error}</Text>
        )}

        <Text style={styles.footer}>
          Unofficial fan project · No account required
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value} ›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0B12',
  },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 750,
    alignSelf: 'center',
    justifyContent: 'center',
    padding: 24,
    paddingVertical: 60,
    gap: 20,
  },
  brand: {
    color: '#B59AFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 3,
    marginBottom: 24,
  },
  eyebrow: {
    color: '#B59AFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '800',
    lineHeight: 45,
  },
  subtitle: {
    color: '#AAA6BC',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#191923',
    paddingHorizontal: 18,
    borderRadius: 20,
  },
  row: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#33303D',
    gap: 12,
  },
  rowLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    flexShrink: 1,
  },
  rowValue: {
    color: '#B59AFF',
    fontSize: 14,
    flexShrink: 1,
    textAlign: 'right',
  },
  hint: {
    color: '#AAA6BC',
    fontSize: 13,
    lineHeight: 20,
  },
  button: {
    backgroundColor: '#8768D6',
    paddingVertical: 18,
    borderRadius: 15,
    alignItems: 'center',
    marginTop: 10,
  },
  disabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  error: {
    color: '#FF9F9F',
    textAlign: 'center',
  },
  footer: {
    color: '#777386',
    textAlign: 'center',
    fontSize: 12,
    marginTop: 22,
  },
});
