import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCalendars, getLocales } from 'expo-localization';

import type { AppLanguage } from '../localization/i18n';

const STORAGE_KEY = '@ado-fan-hub/preferences/v1';

export type MvDisplayMode = 'grid' | 'list';

export type UserPreferences = {
    mvDisplayMode: MvDisplayMode;
    language: AppLanguage;
    region: string;
    timeZone: string;
    onboardingCompleted: boolean;
};

function detectLanguage(languageTag: string): AppLanguage {
    const normalized = languageTag.toLowerCase();

    if (normalized.startsWith('ja')) {
        return 'ja';
    }

    if (
        normalized.startsWith('zh-hant') ||
        normalized.startsWith('zh-tw') ||
        normalized.startsWith('zh-hk') ||
        normalized.startsWith('zh-mo')
    ) {
        return 'zh-TW';
    }

    return 'en';
}

export function getDefaultPreferences(): UserPreferences {
    const locale = getLocales()[0];
    const calendar = getCalendars()[0];

    return {
        language: detectLanguage(locale?.languageTag ?? 'en'),
        region: locale?.regionCode ?? 'US',
        timeZone: calendar?.timeZone ?? 'UTC',
        onboardingCompleted: false,
        mvDisplayMode: 'grid',
    };
}

export async function loadPreferences(): Promise<UserPreferences> {
    const defaults = getDefaultPreferences();

    try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);

        if (!stored) {
            return defaults;
        }

        const parsed = JSON.parse(stored) as Partial<UserPreferences>;

        return {
            language:
                parsed.language === 'en' ||
                    parsed.language === 'ja' ||
                    parsed.language === 'zh-TW'
                    ? parsed.language
                    : defaults.language,
            region:
                typeof parsed.region === 'string' && parsed.region.length > 0
                    ? parsed.region
                    : defaults.region,
            timeZone:
                typeof parsed.timeZone === 'string' && parsed.timeZone.length > 0
                    ? parsed.timeZone
                    : defaults.timeZone,
            onboardingCompleted: parsed.onboardingCompleted === true,
            mvDisplayMode: parsed.mvDisplayMode === 'list' ? 'list' : 'grid',
        };
    } catch (error) {
        console.warn('Unable to load user preferences:', error);
        return defaults;
    }
}

export async function savePreferences(
    preferences: UserPreferences
): Promise<void> {
    await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(preferences)
    );
}
