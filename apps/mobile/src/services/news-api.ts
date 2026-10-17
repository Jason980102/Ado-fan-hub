export type NewsCategory = 'official' | 'concert' | 'merch' | 'media';

export type NewsItem = {
  id: string;
  title: string;
  summary: string;
  category: NewsCategory;
  source_name: string;
  source_url: string;
  published_at: string;
  language: string;
  image_url: string | null;
};

export type NewsListResponse = {
  items: NewsItem[];
  total: number;
};

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export async function getNews(
  limit = 10,
  signal?: AbortSignal,
  offset = 0
): Promise<NewsListResponse> {
  if (!API_URL) {
    throw new Error('EXPO_PUBLIC_API_URL is not configured');
  }

  const response = await fetch(
    `${API_URL}/api/news?limit=${limit}&offset=${offset}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal,
    }
  );

  if (!response.ok) {
    throw new Error(`News API returned HTTP ${response.status}`);
  }

  const data: NewsListResponse = await response.json();

  if (!Array.isArray(data.items) || !Number.isSafeInteger(data.total) || data.total < 0) {
    throw new Error('Invalid News API response');
  }

  return data;
}
