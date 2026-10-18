"""Offline regression tests: no quota usage, database writes or network."""
import unittest
from unittest.mock import patch
from urllib.error import URLError
import mv_catalog as catalog


class CatalogTests(unittest.TestCase):
    def video(self, vid='abcdefghijk', privacy='public'):
        return {'id': vid, 'snippet': {'title': 'Original title', 'channelId': 'UC' + 'a' * 22,
                'channelTitle': 'Publisher', 'publishedAt': '2026-01-01T00:00:00Z',
                'thumbnails': {'high': {'url': 'https://i.ytimg.com/vi/' + vid + '/hqdefault.jpg'}}},
                'status': {'privacyStatus': privacy, 'uploadStatus': 'processed'},
                'statistics': {'viewCount': '0'},
                'localizations': {'en': {'title': 'Verified alias'}, 'ja': {'title': 'Original title'}}}

    def test_aliases_categories_and_unclassified(self):
        ids = list(catalog.SOURCES)
        result = catalog._video(self.video(), [ids[0], ids[2]])
        self.assertEqual(result.categories, ['original', 'live'])
        self.assertIn('Verified alias', result.aliases)
        self.assertEqual(result.view_count, 0)
        self.assertIsNone(result.like_count)
        liked = self.video()
        liked['statistics']['likeCount'] = '12'
        self.assertEqual(catalog._video(liked, [ids[0]]).like_count, 12)
        self.assertEqual(catalog._video(self.video(), [ids[4]]).categories, ['unclassified'])
        self.assertEqual(catalog._video(self.video('x0zfQrIj_Ho'), [ids[4]]).categories, ['cover', 'collaboration'])
        self.assertIsNone(catalog._video(self.video(privacy='private'), [ids[0]]))

    def test_memberships_dedup_partial_and_missing(self):
        ids = list(catalog.SOURCES)
        def youtube(resource, params, key):
            if resource == 'playlists':
                return {'items': [{'id': pid, 'snippet': {'title': title, 'channelId': 'owner'}} for pid, (title, _) in catalog.SOURCES.items()]}
            if resource == 'videos':
                return {'items': [self.video()]}
            raise AssertionError(resource)
        def playlist(key, pid):
            if pid == ids[3]:
                raise URLError('source unavailable')
            return ['abcdefghijk', 'unavailable', 'r-IIISSOhik']
        with patch.object(catalog, '_youtube', side_effect=youtube), patch.object(catalog, '_playlist_video_ids', side_effect=playlist):
            result = catalog._fetch_catalog('test-key', 'owner')
        self.assertTrue(result.partial)
        self.assertEqual(len(result.videos), 1)
        self.assertEqual(len(result.videos[0].playlist_ids), 4)
        self.assertEqual(result.unavailable_video_ids, ['unavailable'])
        self.assertNotIn('r-IIISSOhik', result.unavailable_video_ids)

    def test_owner_mismatch_rejects_all_sources(self):
        with patch.object(catalog, '_youtube', return_value={'items': []}):
            with self.assertRaises(ValueError):
                catalog._fetch_catalog('test-key', 'unexpected-owner')

    def test_playlist_pagination_and_repeated_tokens(self):
        from analytics import _playlist_video_ids
        with patch('analytics._youtube', side_effect=[
            {'items': [{'contentDetails': {'videoId': 'abcdefghijk'}}], 'nextPageToken': 'page2'},
            {'items': [{'contentDetails': {'videoId': 'abcdefghijk'}}, {'contentDetails': {'videoId': 'lmnopqrstuv'}}]},
        ]):
            self.assertEqual(_playlist_video_ids('test-key', 'playlist'), ['abcdefghijk', 'lmnopqrstuv'])
        with patch('analytics._youtube', return_value={'items': [], 'nextPageToken': 'repeat'}):
            with self.assertRaises(ValueError):
                _playlist_video_ids('test-key', 'playlist')

    def test_catalog_never_saves_analytics_snapshots(self):
        with patch.object(catalog, '_configuration', return_value=('test-key', 'owner', [])), \
             patch.object(catalog, '_fetch_catalog', return_value=catalog.CatalogResponse(
                 fetched_at='2026-01-01T00:00:00Z', sources=[], videos=[], unavailable_video_ids=[])), \
             patch('analytics.save_channel_snapshot') as save:
            with patch.object(catalog, '_cache', None):
                catalog.mv_catalog()
            save.assert_not_called()


if __name__ == '__main__':
    unittest.main()
