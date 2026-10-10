import { useEffect, useState } from 'react';
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
import { useTranslation } from 'react-i18next';

import '@/localization/i18n';
import {
  getDefaultPreferences,
  loadPreferences,
  savePreferences,
  type UserPreferences,
} from '@/services/preferences';

const languages = [
  { value: 'en', label: 'English' },
  { value: 'zh-TW', label: '繁體中文' },
  { value: 'ja', label: '日本語' },
];

const regions = [
  { value: 'US', label: 'United States' },
  { value: 'TW', label: 'Taiwan' },
  { value: 'JP', label: 'Japan' },
  { value: 'KR', label: 'South Korea' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'CA', label: 'Canada' },
  { value: 'AU', label: 'Australia' },
];

const timeZones = [
  { value: 'America/New_York', label: 'New York' },
  { value: 'America/Los_Angeles', label: 'Los Angeles' },
  { value: 'America/Toronto', label: 'Toronto' },
  { value: 'Asia/Taipei', label: 'Taipei' },
  { value: 'Asia/Tokyo', label: 'Tokyo' },
  { value: 'Asia/Seoul', label: 'Seoul' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Australia/Sydney', label: 'Sydney' },
];

function nextValue(
  current: string,
  options: { value: string; label: string }[]
) {
  const index = options.findIndex(
    (option) => option.value === current
  );
  return options[(index + 1) % options.length].value;
}

function displayValue(
  current: string,
  options: { value: string; label: string }[]
) {
  return options.find(
    (option) => option.value === current
  )?.label ?? current;
}

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const [preferences, setPreferences] = useState<UserPreferences>(
    getDefaultPreferences
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;

    loadPreferences()
      .then(async (saved) => {
        if (!active) return;
        setPreferences(saved);
        await i18n.changeLanguage(saved.language);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [i18n]);

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setMessage('');

    try {
      await savePreferences(preferences);
      await i18n.changeLanguage(preferences.language);
      setMessage(t('settingsSaved'));
    } catch (error) {
      console.error('Failed to save preferences:', error);
      if (Platform.OS === 'web') {
        setMessage('Unable to save settings.');
      } else {
        Alert.alert('Error', 'Unable to save settings.');
      }
    } finally {
      setSaving(false);
    }
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

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#B59AFF" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>ADO FAN HUB</Text>
        <Text style={styles.title}>{t('settings')}</Text>
        <Text style={styles.subtitle}>
          Customize your Ado experience.
        </Text>

        <View style={styles.card}>
          <SettingRow
            label={t('language')}
            value={displayValue(preferences.language, languages)}
            onPress={() => {
              const language = nextValue(
                preferences.language,
                languages
              ) as UserPreferences['language'];

              setPreferences((prev) => ({
                ...prev,
                language,
              }));
              setMessage('');
            }}
          />

          <SettingRow
            label={t('region')}
            value={displayValue(preferences.region, regions)}
            onPress={() => {
              setPreferences((prev) => ({
                ...prev,
                region: nextValue(prev.region, regions),
              }));
              setMessage('');
            }}
          />

          <SettingRow
            label={t('timeZone')}
            value={displayValue(preferences.timeZone, timeZones)}
            onPress={() => {
              setPreferences((prev) => ({
                ...prev,
                timeZone: nextValue(prev.timeZone, timeZones),
              }));
              setMessage('');
            }}
          />
        </View>

        <Text style={styles.hint}>
          Tap a setting to change its value.
          Your preferences are saved on this device.
        </Text>

        <Pressable
          style={[styles.saveButton, saving && styles.disabled]}
          disabled={saving}
          onPress={handleSave}
        >
          <Text style={styles.saveText}>
            {saving ? 'Saving...' : t('save')}
          </Text>
        </Pressable>

        {!!message && (
          <Text style={styles.success}>{message}</Text>
        )}

        <Text style={styles.footer}>
          Unofficial fan project · Not affiliated with Ado
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0B12',
  },
  loading: {
    flex: 1,
    backgroundColor: '#0B0B12',
    justifyContent: 'center',
  },
  content: {
    width: '100%',
    maxWidth: 850,
    alignSelf: 'center',
    padding: 24,
    paddingTop: Platform.OS === 'web' ? 110 : 24,
    paddingBottom: 110,
    gap: 18,
  },
  eyebrow: {
    color: '#B59AFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '800',
  },
  subtitle: {
    color: '#AAA6BC',
    fontSize: 15,
  },
  card: {
    backgroundColor: '#191923',
    borderRadius: 20,
    paddingHorizontal: 18,
    marginTop: 10,
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
    textAlign: 'right',
    flexShrink: 1,
  },
  hint: {
    color: '#AAA6BC',
    fontSize: 12,
    lineHeight: 20,
  },
  saveButton: {
    backgroundColor: '#8768D6',
    paddingVertical: 17,
    borderRadius: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  disabled: {
    opacity: 0.6,
  },
  saveText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  success: {
    color: '#9DE6B4',
    textAlign: 'center',
    fontSize: 14,
  },
  footer: {
    color: '#777386',
    textAlign: 'center',
    fontSize: 11,
    marginTop: 20,
  },
});
