import type { CatalogVideo, MvCategory } from '@/services/mv-api';
export type MvSort = 'newest' | 'oldest' | 'popular';

export function normalizeMvSearch(value: string) {
  return value.normalize('NFKC').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').normalize('NFC')
    .replace(/[\u30a1-\u30f6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

export function indexMvVideos(videos: CatalogVideo[]) {
  const unique = new Map<string, CatalogVideo>();
  for (const video of videos) {
    const previous = unique.get(video.id);
    unique.set(video.id, previous ? {
      ...previous,
      categories: [...new Set([...previous.categories, ...video.categories])],
      playlist_ids: [...new Set([...previous.playlist_ids, ...video.playlist_ids])],
      aliases: [...new Set([...previous.aliases, video.title, ...video.aliases])],
    } : video);
  }
  return [...unique.values()].map(video => ({ video,
    search: normalizeMvSearch([video.title, ...video.aliases].join(' ')),
  }));
}

export function searchMvVideos(index: ReturnType<typeof indexMvVideos>, query: string, category: MvCategory | 'all', order: MvSort) {
  const words = normalizeMvSearch(query).split(' ').filter(Boolean);
  return index.filter(({ video, search }) => (category === 'all' || video.categories.includes(category))
    && words.every(word => search.includes(word))).map(({ video }) => video).sort((a, b) => {
    if (order === 'popular') {
      if (a.view_count === null && b.view_count !== null) return 1;
      if (b.view_count === null && a.view_count !== null) return -1;
      const difference = (b.view_count ?? 0) - (a.view_count ?? 0);
      if (difference !== 0) return difference;
    }
    const dateDifference = Date.parse(b.published_at) - Date.parse(a.published_at);
    return (order === 'oldest' ? -dateDifference : dateDifference) || a.id.localeCompare(b.id);
  });
}
