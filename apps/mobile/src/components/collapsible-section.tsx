import { useEffect, useState, type ReactNode } from 'react';
import {
    AccessibilityInfo,
    Animated,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';

type Props = {
    title: string;
    children: ReactNode;
    active?: boolean;
};

export default function CollapsibleSection({
    title,
    children,
    active = true,
}: Props) {
    const [expanded, setExpanded] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [contentHeight, setContentHeight] = useState(0);
    const [progress] = useState(() => new Animated.Value(0));

    useEffect(() => {
        if (!active || !mounted || contentHeight <= 0) return;

        let running = true;
        const target = expanded ? 1 : 0;
        const animation = Animated.timing(progress, {
            toValue: target,
            duration: 1000,
            useNativeDriver: false,
        });

        function complete() {
            if (running && !expanded) setMounted(false);
        }

        void AccessibilityInfo.isReduceMotionEnabled()
            .then((reduceMotion) => {
                if (!running) return;

                if (reduceMotion) {
                    progress.setValue(target);
                    complete();
                } else {
                    animation.start(({ finished }) => {
                        if (finished) complete();
                    });
                }
            })
            .catch(() => {
                if (!running) return;
                progress.setValue(target);
                complete();
            });

        return () => {
            running = false;
            animation.stop();
        };
    }, [active, mounted, expanded, contentHeight, progress]);

    function toggle() {
        if (!expanded) setMounted(true);
        setExpanded((current) => !current);
    }

    return (
        <View style={styles.section}>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={title}
                accessibilityState={{ expanded }}
                onPress={toggle}
                style={({ pressed }) => [
                    styles.button,
                    pressed && styles.pressed,
                ]}
            >
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.arrow} accessible={false}>
                    {expanded ? '−' : '+'}
                </Text>
            </Pressable>

            {mounted && active && (
                <Animated.View
                    pointerEvents={expanded ? 'auto' : 'none'}
                    accessibilityElementsHidden={!expanded}
                    importantForAccessibility={
                        expanded ? 'auto' : 'no-hide-descendants'
                    }
                    style={{
                        overflow: 'hidden',
                        height: progress.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, contentHeight],
                        }),
                    }}
                >
                    <View
                        style={[
                            styles.content,
                            { position: 'absolute', top: 0, left: 0, right: 0 },
                        ]}
                        onLayout={(event) => {
                            const height = event.nativeEvent.layout.height;
                            if (height > 0) setContentHeight(height);
                        }}
                    >
                        {children}
                    </View>
                </Animated.View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    section: { gap: 12 },
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: 20,
        backgroundColor: '#242033',
        borderRadius: 16,
        minHeight: 56,
    },
    title: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: '700',
        flex: 1,
    },
    arrow: { color: '#C8B4FF', fontSize: 26 },
    content: { gap: 16 },
    pressed: { opacity: 0.75 },
});