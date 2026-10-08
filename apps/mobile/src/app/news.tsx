import PlaceholderScreen from '@/components/placeholder-screen';

export default function NewsScreen() {
  return (
    <PlaceholderScreen
      title="Latest News"
      subtitle="Stay updated with Ado's latest announcements."
      features={[
        'Official announcements',
        'Social media updates',
        'Concert and release news',
        'News filters and categories',
      ]}
    />
  );
}
