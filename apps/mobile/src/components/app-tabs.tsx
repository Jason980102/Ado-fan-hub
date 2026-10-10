import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useTranslation } from 'react-i18next';

export default function AppTabs() {
  const { t } = useTranslation();

  return (
    <NativeTabs
      backgroundColor="#111119"
      indicatorColor="#292439"
      labelStyle={{ selected: { color: '#C8B4FF' } }}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>
          {t('home')}
        </NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf="house.fill"
          md="home"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="news">
        <NativeTabs.Trigger.Label>
          {t('news')}
        </NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf="newspaper.fill"
          md="article"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="following">
        <NativeTabs.Trigger.Label>
          {t('following')}
        </NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf="heart.fill"
          md="favorite"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>
          {t('settings')}
        </NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf="gearshape.fill"
          md="settings"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}