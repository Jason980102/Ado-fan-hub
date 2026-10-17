import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import i18n from '@/localization/i18n';
import {
  getDefaultPreferences,
  loadPreferences,
  savePreferences,
  type UserPreferences,
} from '@/services/preferences';

type PreferencesContextValue = {
  preferences: UserPreferences;
  loading: boolean;
  updatePreferences: (next: UserPreferences) => Promise<void>;
};

const PreferencesContext =
  createContext<PreferencesContextValue | undefined>(undefined);

export function PreferencesProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [preferences, setPreferences] = useState<UserPreferences>(
    getDefaultPreferences
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function initialize() {
      try {
        const saved = await loadPreferences();

        if (!active) return;

        await i18n.changeLanguage(saved.language);

        if (active) {
          setPreferences(saved);
        }
      } catch (error) {
        console.error('Unable to initialize preferences:', error);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void initialize();

    return () => {
      active = false;
    };
  }, []);

  const updatePreferences = useCallback(
    async (next: UserPreferences) => {
      await savePreferences(next);
      await i18n.changeLanguage(next.language);
      setPreferences(next);
    },
    []
  );

  const value = useMemo(
    () => ({
      preferences,
      loading,
      updatePreferences,
    }),
    [preferences, loading, updatePreferences]
  );

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const context = useContext(PreferencesContext);

  if (!context) {
    throw new Error(
      'usePreferences must be used inside PreferencesProvider'
    );
  }

  return context;
}
