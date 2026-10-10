import { useTranslation } from 'react-i18next';

import PlaceholderScreen from '@/components/placeholder-screen';

export default function NewsScreen() {
  const { t } = useTranslation();

  return (
    <PlaceholderScreen
      title={t('newsTitle')}
      subtitle={t('newsSubtitle')}
      features={[
        t('newsFeature1'),
        t('newsFeature2'),
        t('newsFeature3'),
        t('newsFeature4'),
      ]}
    />
  );
}
