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
import { useTranslation } from 'react-i18next';

import SelectionModal, { type SelectionOption } from '@/components/selection-modal';
import {
  languageOptions,
  regionOptions,
  timeZoneOptions,
  getOptionLabel,
} from '@/constants/preference-options';
import { usePreferences } from '@/contexts/preferences-context';
import type { UserPreferences } from '@/services/preferences';


export default function OnboardingScreen() {
  const { t } = useTranslation();
  const { preferences, updatePreferences } = usePreferences();

  const [draft, setDraft] = useState<UserPreferences>(preferences);
  const [activeSelection, setActiveSelection] = useState<{
    field: 'language' | 'region' | 'timeZone';
    options: SelectionOption[];
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');



  function changeSetting(
    field: 'language' | 'region' | 'timeZone',
    options: SelectionOption[]
  ) {
    setActiveSelection({ field, options });
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
      setError(t('onboardingSaveError', { lng: draft.language }));

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
        <Text style={styles.title}>{t('welcome', { lng: draft.language })}</Text>
        <Text style={styles.subtitle}>{t('onboardingSubtitle', { lng: draft.language })}</Text>

        <View style={styles.card}>
          <SettingRow
            label={t('language', { lng: draft.language })}
            value={getOptionLabel(draft.language, languageOptions)}
            onPress={() => changeSetting('language', languageOptions)}
          />

          <SettingRow
            label={t('region', { lng: draft.language })}
            value={getOptionLabel(draft.region, regionOptions)}
            onPress={() => changeSetting('region', regionOptions)}
          />

          <SettingRow
            label={t('timeZone', { lng: draft.language })}
            value={getOptionLabel(draft.timeZone, timeZoneOptions)}
            onPress={() => changeSetting('timeZone', timeZoneOptions)}
          />
        </View>

        <Text style={styles.hint}>{t('onboardingHint', { lng: draft.language })}</Text>

        <Pressable
          style={[styles.button, saving && styles.disabled]}
          onPress={handleStart}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>{t('getStarted', { lng: draft.language })} →</Text>
          )}
        </Pressable>

        {error !== '' && (
          <Text style={styles.error}>{error}</Text>
        )}

        <Text style={styles.footer}>
          Unofficial fan project · No account required
        </Text>
        {activeSelection !== null && (
          <SelectionModal
            visible={true}
            title={t(activeSelection.field, { lng: draft.language })}
            options={activeSelection.options}
            selectedValue={draft[activeSelection.field]}
            onSelect={(value) => {
              setDraft((current) => ({
                ...current,
                [activeSelection.field]: value,
              }));
              setError('');
            }}
            onClose={() => setActiveSelection(null)}
          />
        )}
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



