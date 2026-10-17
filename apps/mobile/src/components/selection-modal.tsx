import { FanColors } from '@/constants/fan-theme';
import { useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

export type SelectionOption = {
  value: string;
  label: string;
};

type SelectionModalProps = {
  visible: boolean;
  title: string;
  options: SelectionOption[];
  selectedValue: string;
  onSelect: (value: string) => void;
  onClose: () => void;
};

export default function SelectionModal({
  visible,
  title,
  options,
  selectedValue,
  onSelect,
  onClose,
}: SelectionModalProps) {
  const [query, setQuery] = useState('');

  const filtered = options.filter((option) =>
    `${option.label} ${option.value}`
      .toLowerCase()
      .includes(query.trim().toLowerCase())
  );

  function close() {
    setQuery('');
    onClose();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={close}
    >
      <SafeAreaView style={styles.overlay}>
        <View style={styles.panel}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={close} accessibilityLabel="Close">
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>

          <TextInput
            style={styles.input}
            placeholder="Search / 搜尋 / 検索"
            placeholderTextColor={FanColors.subtle}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
          />

          <FlatList
            data={filtered}
            keyExtractor={(item) => item.value}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text style={styles.empty}>No matching options</Text>
            }
            renderItem={({ item }) => (
              <Pressable
                style={[
                  styles.option,
                  item.value === selectedValue && styles.selected,
                ]}
                onPress={() => {
                  onSelect(item.value);
                  close();
                }}
              >
                <View style={styles.optionText}>
                  <Text style={styles.optionLabel}>{item.label}</Text>
                  <Text style={styles.optionDetail}>{item.value}</Text>
                </View>
                {item.value === selectedValue && (
                  <Text style={styles.check}>✓</Text>
                )}
              </Pressable>
            )}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    padding: 20,
  },
  panel: {
    backgroundColor: FanColors.surface,
    borderRadius: 22,
    padding: 20,
    height: '70%',
    maxHeight: 650,
    width: '100%',
    maxWidth: 550,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  title: {
    color: FanColors.text,
    fontSize: 21,
    fontWeight: '700',
    flexShrink: 1,
  },
  close: {
    color: FanColors.accent,
    fontSize: 24,
    paddingHorizontal: 8,
  },
  input: {
    backgroundColor: FanColors.surfaceAlt,
    borderRadius: 12,
    color: FanColors.text,
    fontSize: 15,
    padding: 14,
    marginBottom: 12,
  },
  option: {
    minHeight: 62,
    padding: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  selected: {
    backgroundColor: FanColors.selected,
  },
  optionText: {
    flexShrink: 1,
  },
  optionLabel: {
    color: FanColors.text,
    fontSize: 16,
  },
  optionDetail: {
    color: FanColors.muted,
    fontSize: 11,
    marginTop: 4,
  },
  check: {
    color: FanColors.accent,
    fontSize: 20,
    marginLeft: 10,
  },
  empty: {
    color: FanColors.muted,
    textAlign: 'center',
    padding: 24,
  },
});
