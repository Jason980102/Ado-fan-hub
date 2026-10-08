import PlaceholderScreen from '@/components/placeholder-screen';

export default function SettingsScreen() {
  return (
    <PlaceholderScreen
      title="Settings"
      subtitle="Customize your Ado Fan Hub experience."
      features={[
        'Language preferences',
        'Region and time zone',
        'Notification preferences',
        'Support the developer',
      ]}
    />
  );
}
