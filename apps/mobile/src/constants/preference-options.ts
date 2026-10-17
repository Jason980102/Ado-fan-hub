import type { SelectionOption } from '@/components/selection-modal';

export const languageOptions: SelectionOption[] = [
  { value: 'en', label: 'English' },
  { value: 'zh-TW', label: '繁體中文' },
  { value: 'ja', label: '日本語' },
];

export const regionOptions: SelectionOption[] = [
  { value: 'US', label: 'United States' },
  { value: 'TW', label: 'Taiwan' },
  { value: 'JP', label: 'Japan' },
  { value: 'KR', label: 'South Korea' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'CA', label: 'Canada' },
  { value: 'AU', label: 'Australia' },
];

export const timeZoneOptions: SelectionOption[] = [
  { value: 'America/New_York', label: 'New York' },
  { value: 'America/Los_Angeles', label: 'Los Angeles' },
  { value: 'America/Toronto', label: 'Toronto' },
  { value: 'Asia/Taipei', label: 'Taipei' },
  { value: 'Asia/Tokyo', label: 'Tokyo' },
  { value: 'Asia/Seoul', label: 'Seoul' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Australia/Sydney', label: 'Sydney' },
];

export function getOptionLabel(
  value: string,
  options: SelectionOption[]
): string {
  return options.find((option) => option.value === value)?.label ?? value;
}
