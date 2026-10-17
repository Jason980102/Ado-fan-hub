import { Platform, useWindowDimensions, type ViewStyle } from 'react-native';

export function useWebLayout() {
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const gutter = width < 600 ? 16 : width < 1000 ? 24 : 32;

  const contentStyle: ViewStyle = isWeb ? {
    width: '100%',
    maxWidth: 1280,
    alignSelf: 'center',
    paddingHorizontal: gutter,
  } : {};

  return {
    isWeb,
    width,
    compact: isWeb && width < 600,
    wide: isWeb && width >= 1100,
    contentStyle,
  };
}
