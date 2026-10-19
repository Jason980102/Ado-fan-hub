import { useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { FanColors } from '@/constants/fan-theme';

type Props = { children: ReactNode; contentContainerStyle?: StyleProp<ViewStyle> };

export default function HorizontalFilterRow({ children, contentContainerStyle }: Props) {
  const scroll = useRef<ScrollView>(null);
  const [viewport, setViewport] = useState(0);
  const [content, setContent] = useState(0);
  const [offset, setOffset] = useState(0);
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage || i18n.language;
  const labels = language.startsWith('zh') ? ['顯示前面的選項', '顯示後面的選項']
    : language.startsWith('ja') ? ['前の選択肢を表示', '次の選択肢を表示']
      : ['Show previous options', 'Show more options'];
  const left = offset > 2;
  const right = content - viewport - offset > 2;
  function move(direction: number) {
    scroll.current?.scrollTo({ x: Math.max(0, Math.min(content - viewport,
      offset + direction * viewport * 0.75)), animated: true });
  }
  return (
    <View style={styles.row}>
      <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false}
        style={styles.scroll} contentContainerStyle={[contentContainerStyle, styles.content]}
        keyboardShouldPersistTaps="handled" scrollEventThrottle={16}
        onLayout={event => setViewport(event.nativeEvent.layout.width)}
        onContentSizeChange={width => setContent(width)}
        onScroll={event => setOffset(event.nativeEvent.contentOffset.x)}>
        {children}
      </ScrollView>
      {left && <Pressable accessibilityRole="button" accessibilityLabel={labels[0]}
        onPress={() => move(-1)} style={[styles.arrow, styles.left]}>
        <Text style={styles.symbol}>‹</Text>
      </Pressable>}
      {right && <Pressable accessibilityRole="button" accessibilityLabel={labels[1]}
        onPress={() => move(1)} style={[styles.arrow, styles.right]}>
        <Text style={styles.symbol}>›</Text>
      </Pressable>}
    </View>
  );
}

const styles = StyleSheet.create({
  // Extend only the arrow hit area into the page gutter; the scroll viewport stays full width.
  row: { position: 'relative', minWidth: 0, marginHorizontal: -14, paddingHorizontal: 14,
    backgroundColor: 'transparent' },
  scroll: { width: '100%', backgroundColor: 'transparent' },
  content: { paddingHorizontal: 0 },
  arrow: { position: 'absolute', top: 0, bottom: 0, width: 12,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent', borderWidth: 0 },
  left: { left: 0 },
  right: { right: 0 },
  symbol: { color: FanColors.accent, fontSize: 24, lineHeight: 32 },
});
