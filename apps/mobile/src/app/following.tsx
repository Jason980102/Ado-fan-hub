import { useTranslation } from 'react-i18next';

import PlaceholderScreen from '@/components/placeholder-screen';

export default function FollowingScreen() {
  const { t } = useTranslation();

  return (
    <PlaceholderScreen
      title={t('followingTitle')}
      subtitle={t('followingSubtitle')}
      features={[
        t('followingFeature1'),
        t('followingFeature2'),
        t('followingFeature3'),
        t('followingFeature4'),
      ]}
    />
  );
}
