import { forwardRef, useState } from 'react';
import { Platform, ScrollView, type ScrollViewProps } from 'react-native';
import MobileRoseFrame from '@/components/mobile-rose-frame';

const RoseScrollView = forwardRef<ScrollView, ScrollViewProps>(
  function RoseScrollView({ children, contentContainerStyle, onLayout, ...props }, ref) {
    const [viewportHeight, setViewportHeight] = useState(0);
    return (
      <ScrollView {...props} ref={ref}
        onLayout={(event) => {
          if (Platform.OS !== 'web') {
            const height = event.nativeEvent.layout.height;
            setViewportHeight((previous) => previous === height ? previous : height);
          }
          onLayout?.(event);
        }}
        contentContainerStyle={[
          Platform.OS !== 'web' && { minHeight: viewportHeight },
          contentContainerStyle,
          { position: 'relative' },
        ]}>
        <MobileRoseFrame />
        {children}
      </ScrollView>
    );
  }
);
export default RoseScrollView;
