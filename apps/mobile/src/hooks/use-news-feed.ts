import { useCallback, useEffect, useRef, useState } from 'react';
import { getNews, type NewsItem } from '@/services/news-api';

type Mode = 'initial' | 'refresh' | 'more';
const PAGE_SIZE = 10;

export function useNewsFeed() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const request = useRef<AbortController | null>(null);
  const nextOffset = useRef(0);
  const canLoadMore = useRef(false);
  const appendFailed = useRef(false);

  const load = useCallback(async (mode: Mode, retry = false) => {
    if (mode === 'more') {
      if (request.current || !canLoadMore.current || (appendFailed.current && !retry)) return;
    } else {
      request.current?.abort();
    }
    const controller = new AbortController();
    request.current = controller;
    const offset = mode === 'more' ? nextOffset.current : 0;
    const timeout = setTimeout(() => controller.abort(), 45000);
    setLoading(mode === 'initial');
    setRefreshing(mode === 'refresh');
    setLoadingMore(mode === 'more');
    if (mode === 'more') setMoreError(false);
    else setError(false);

    try {
      const result = await getNews(PAGE_SIZE, controller.signal, offset);
      if (request.current !== controller || controller.signal.aborted) return;
      const next = offset + result.items.length;
      nextOffset.current = next;
      canLoadMore.current = result.items.length > 0 && next < result.total;
      appendFailed.current = false;
      setHasMore(canLoadMore.current);
      setMoreError(false);
      setItems((previous) => {
        const merged = mode === 'more' ? [...previous, ...result.items] : result.items;
        return [...new Map(merged.map((item) => [item.id, item])).values()];
      });
      if (mode !== 'more') setFailedImages([]);
    } catch {
      if (request.current !== controller) return;
      if (mode === 'more') {
        appendFailed.current = true;
        setMoreError(true);
      } else setError(true);
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) {
        request.current = null;
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    void load('initial');
    return () => {
      const active = request.current;
      request.current = null;
      active?.abort();
    };
  }, [load]);

  const loadNews = useCallback((refresh = false) =>
    load(refresh ? 'refresh' : 'initial'), [load]);
  const loadMore = useCallback((retry = false) => load('more', retry), [load]);

  return { items, loading, refreshing, loadingMore, error, moreError,
    hasMore, failedImages, setFailedImages, loadNews, loadMore };
}
