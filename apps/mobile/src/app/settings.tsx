import { fanPageHeader } from '@/constants/fan-page-header';
import RoseScrollView from '@/components/rose-scroll-view';
import { FanColors } from '@/constants/fan-theme';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import '@/localization/i18n';
import SelectionModal, { type SelectionOption } from '@/components/selection-modal';
import {
  languageOptions,
  regionOptions,
  timeZoneOptions,
  getOptionLabel,
} from '@/constants/preference-options';
import { usePreferences } from '@/contexts/preferences-context';
import type { UserPreferences } from '@/services/preferences';



export default function SettingsScreen() {
  const { t } = useTranslation();
  const { preferences, loading, updatePreferences } = usePreferences();

  const [draft, setDraft] = useState<UserPreferences>(preferences);
  const [activeSelection, setActiveSelection] = useState<{
    field: 'language' | 'region' | 'timeZone';
    options: SelectionOption[];
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<'success' | 'error' | ''>('');

  const [previousPreferences, setPreviousPreferences] = useState(preferences);
  if (preferences !== previousPreferences) {
    setPreviousPreferences(preferences);
    setDraft(preferences);
  }

  function changeSetting(
    field: 'language' | 'region' | 'timeZone',
    options: SelectionOption[]
  ) {
    setActiveSelection({ field, options });
    setMessage('');
  }

  async function handleSave() {
    if (saving) return;

    setSaving(true);
    setMessage('');

    try {
      await updatePreferences(draft);
      setMessage('success');
    } catch (error) {
      console.error('Failed to save settings:', error);

      if (Platform.OS === 'web') {
        setMessage('error');
      } else {
        Alert.alert(t('settings'), t('settingsSaveError'));
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={FanColors.accent} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={Platform.OS === 'web' ? ['top'] : ['left', 'right']}>
      <RoseScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.eyebrow, fanPageHeader.eyebrow]}>ADO FAN HUB</Text>
        <Text style={[styles.title, fanPageHeader.title]}>{t('settings')}</Text>
        <Text style={[styles.subtitle, fanPageHeader.subtitle]}>
          {t('settingsSubtitle')}
        </Text>

        <View style={styles.card}>
          <SettingRow
            label={t('language')}
            value={getOptionLabel(draft.language, languageOptions)}
            onPress={() => changeSetting('language', languageOptions)}
          />

          <SettingRow
            label={t('region')}
            value={getOptionLabel(draft.region, regionOptions)}
            onPress={() => changeSetting('region', regionOptions)}
          />

          <SettingRow
            label={t('timeZone')}
            value={getOptionLabel(draft.timeZone, timeZoneOptions)}
            onPress={() => changeSetting('timeZone', timeZoneOptions)}
          />
        </View>

        <Text style={styles.hint}>
          {t('settingsHint')}
        </Text>

        <Pressable
          style={[styles.saveButton, saving && styles.disabled]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.saveText}>
            {saving ? t('settingsSaving') : t('save')}
          </Text>
        </Pressable>

        {message !== '' && (
          <Text style={styles.message}>{t(message === 'success' ? 'settingsSaved' : 'settingsSaveError')}</Text>
        )}

        <Text style={styles.footer}>
          {t('homeFooter')}
        </Text>
        {activeSelection !== null && (
          <SelectionModal
            visible={true}
            title={t(activeSelection.field)}
            options={activeSelection.options}
            selectedValue={draft[activeSelection.field]}
            onSelect={(value) => {
              setDraft((current) => ({
                ...current,
                [activeSelection.field]: value,
              }));
              setMessage('');
            }}
            onClose={() => setActiveSelection(null)}
          />
        )}
      </RoseScrollView>
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
    backgroundColor: FanColors.background,
  },
  loading: {
    flex: 1,
    backgroundColor: FanColors.background,
    justifyContent: 'center',
  },
  content: {
    width: '100%',
    maxWidth: 850,
    alignSelf: 'center',
    padding: 24,
    paddingTop: Platform.OS === 'web' ? 110 : 8,
    paddingBottom: 110,
    gap: 18,
  },
  eyebrow: {
    color: FanColors.accent,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
  },
  title: {
    color: FanColors.text,
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: FanColors.muted,
    fontSize: 15,
  },
  card: {
    backgroundColor: FanColors.surface,
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
    borderBottomColor: FanColors.surfaceAlt,
    gap: 12,
  },
  rowLabel: {
    color: FanColors.text,
    fontSize: 15,
    flexShrink: 1,
  },
  rowValue: {
    color: FanColors.accent,
    fontSize: 14,
    textAlign: 'right',
    flexShrink: 1,
  },
  hint: {
    color: FanColors.muted,
    fontSize: 12,
    lineHeight: 20,
  },
  saveButton: {
    backgroundColor: FanColors.primary,
    paddingVertical: 17,
    borderRadius: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  disabled: {
    opacity: 0.6,
  },
  saveText: {
    color: FanColors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  message: {
    color: '#9DE6B4',
    textAlign: 'center',
    fontSize: 14,
  },
  footer: {
    color: FanColors.subtle,
    textAlign: 'center',
    fontSize: 11,
    marginTop: 20,
  },
});
