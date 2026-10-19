"""Offline regression tests: no quota usage, database writes or network."""
import unittest
from unittest.mock import patch
from urllib.error import URLError
import mv_catalog as catalog


class CatalogTests(unittest.TestCase):
    def setUp(self):
        feed_patch = patch.object(
            catalog, "_recent_feed_video_ids", return_value=[]
        )
        feed_patch.start()
        self.addCleanup(feed_patch.stop)

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
            if resource == 'channels':
                return {'items': []}
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
        self.assertEqual(len(result.videos[0].playlist_ids), len(catalog.SOURCES) - 1)
        self.assertEqual(result.unavailable_video_ids, ['unavailable'])
        self.assertNotIn('r-IIISSOhik', result.unavailable_video_ids)

    def test_owner_mismatch_rejects_all_sources(self):
        with patch.object(catalog, '_youtube', return_value={'items': []}), \
             patch.object(catalog, '_recent_feed_video_ids', side_effect=ValueError('feed unavailable')):
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


    def test_uploads_merge_music_and_filter_nonmusic(self):
        channel_id = 'UC' + 'a' * 22
        uploads_id = 'UU' + 'a' * 22
        music_id = 'abcdefghijk'
        notice_id = 'lmnopqrstuv'
        curated_id = 'zyxwvutsrqp'

        def video(vid, category):
            item = self.video(vid)
            item['snippet']['channelId'] = channel_id
            item['snippet']['categoryId'] = category
            item['contentDetails'] = {'duration': 'PT3M21S'}
            if vid == music_id:
                item['snippet']['title'] = '\u3010Ado\u3011Original song'
            return item

        def youtube(resource, params, key):
            if resource == 'channels':
                return {'items': [{
                    'id': channel_id,
                    'contentDetails': {
                        'relatedPlaylists': {'uploads': uploads_id}
                    },
                }]}
            if resource == 'playlistItems':
                return {'items': [
                    {'contentDetails': {'videoId': music_id}},
                    {'contentDetails': {'videoId': notice_id}},
                    {'contentDetails': {'videoId': curated_id}},
                ]}
            if resource == 'playlists':
                return {'items': [
                    {
                        'id': pid,
                        'snippet': {
                            'title': title,
                            'channelId': channel_id,
                        },
                    }
                    for pid, (title, _) in catalog.SOURCES.items()
                ]}
            if resource == 'videos':
                return {'items': [
                    video(music_id, '10'),
                    video(notice_id, '24'),
                    video(curated_id, '10'),
                ]}
            raise AssertionError(resource)

        first_playlist = next(iter(catalog.SOURCES))

        def playlist(key, pid):
            return [curated_id] if pid == first_playlist else []

        with (
            patch.object(catalog, '_youtube', side_effect=youtube),
            patch.object(
                catalog, '_playlist_video_ids', side_effect=playlist
            ),
        ):
            result = catalog._fetch_catalog('test-key', channel_id)

        by_id = {v.id: v for v in result.videos}
        self.assertEqual(set(by_id), {music_id, notice_id, curated_id})
        self.assertEqual(by_id[music_id].categories, ['unclassified'])
        self.assertEqual(by_id[curated_id].categories, ['original'])
        self.assertEqual(len(by_id[curated_id].playlist_ids), 2)
        self.assertNotIn(notice_id, result.unavailable_video_ids)
        self.assertFalse(result.partial)

    def test_upload_pagination_and_dedup(self):
        channel_id = 'UC' + 'a' * 22
        uploads_id = 'UU' + 'a' * 22

        def youtube(resource, params, key):
            if resource == 'channels':
                return {'items': [{
                    'id': channel_id,
                    'contentDetails': {
                        'relatedPlaylists': {'uploads': uploads_id}
                    },
                }]}
            if resource == 'playlistItems':
                if 'pageToken' not in params:
                    return {
                        'items': [{
                            'contentDetails': {'videoId': 'abcdefghijk'}
                        }],
                        'nextPageToken': 'next',
                    }
                return {'items': [
                    {'contentDetails': {'videoId': 'abcdefghijk'}},
                    {'contentDetails': {'videoId': 'lmnopqrstuv'}},
                ]}
            raise AssertionError(resource)

        with patch.object(catalog, '_youtube', side_effect=youtube):
            source_id, ids = catalog._uploads_video_ids(
                'test-key', channel_id
            )

        self.assertEqual(source_id, uploads_id)
        self.assertEqual(ids, ['abcdefghijk', 'lmnopqrstuv'])

    def test_upload_only_music_title_and_duration_policy(self):
        song = self.video()
        song['snippet']['title'] = '\u3010Ado\u3011New song'
        song['contentDetails'] = {'duration': 'PT3M25S'}
        self.assertTrue(catalog._is_upload_music(song))

        song['contentDetails'] = {'duration': 'PT25S'}
        self.assertFalse(catalog._is_upload_music(song))

        song['contentDetails'] = {'duration': 'PT3M25S'}
        song['snippet']['title'] = '\u3010Ado\u3011New song Teaser'
        self.assertFalse(catalog._is_upload_music(song))

        song['snippet']['title'] = '\u3010Ado\u3011Album Interview'
        self.assertFalse(catalog._is_upload_music(song))

        song['snippet']['title'] = 'Random tour announcement'
        self.assertFalse(catalog._is_upload_music(song))

        song['snippet']['title'] = '\u3010Ado\u3011New song (Official Audio)'
        self.assertTrue(catalog._is_upload_music(song))

        song['snippet']['title'] = 'Ado WORLD TOUR 2025 - Thank you'
        self.assertFalse(catalog._is_upload_music(song))

        song['snippet']['title'] = '\u3010Ado\u3011New song (instrumental)'
        self.assertTrue(catalog._is_upload_music(song))

    def test_recent_feed_recovers_missing_new_mv(self):
        channel_id = "UC" + "a" * 22
        uploads_id = "UU" + "a" * 22
        target_ids = ["7DBSMzbPQzc", "__qvPGatwus"]

        def youtube(resource, params, key):
            if resource == "playlists":
                return {"items": [
                    {
                        "id": pid,
                        "snippet": {
                            "title": title,
                            "channelId": channel_id,
                        },
                    }
                    for pid, (title, _) in catalog.SOURCES.items()
                ]}

            if resource == "channels":
                return {"items": [{
                    "id": channel_id,
                    "contentDetails": {
                        "relatedPlaylists": {"uploads": uploads_id}
                    },
                }]}

            if resource == "playlistItems":
                return {"items": []}

            if resource == "videos":
                items = []
                for vid in target_ids:
                    item = self.video(vid)
                    item["snippet"]["channelId"] = channel_id
                    item["snippet"]["categoryId"] = "22"
                    items.append(item)
                return {"items": items}

            raise AssertionError(resource)

        with (
            patch.object(catalog, "_youtube", side_effect=youtube),
            patch.object(
                catalog, "_playlist_video_ids", return_value=[]
            ),
            patch.object(
                catalog, "_recent_feed_video_ids",
                return_value=target_ids,
            ),
        ):
            result = catalog._fetch_catalog(
                "test-key", channel_id
            )

        found = {v.id: v for v in result.videos}

        self.assertEqual(set(found), set(target_ids))

        for vid in target_ids:
            self.assertEqual(
                found[vid].categories,
                ["unclassified"],
            )

    def test_explicit_short_tag_filter(self):
        item = self.video()
        item["snippet"]["title"] = "Example #Shorts"
        self.assertTrue(catalog._confirmed_short(item))

        item["snippet"]["title"] = "New official song"
        self.assertFalse(catalog._confirmed_short(item))

    def test_catalog_never_saves_analytics_snapshots(self):
        empty = catalog.CatalogResponse(
            fetched_at="2026-01-01T00:00:00Z",
            sources=[],
            videos=[],
            unavailable_video_ids=[],
        )

        with (
            patch(
                "services.mv_catalog_db.load_catalog_from_db",
                return_value=empty,
            ),
            patch("analytics.save_channel_snapshot") as save,
            patch.object(catalog, "_cache", None),
            patch.object(catalog, "_cache_until", 0.0),
        ):
            with self.assertRaises(catalog.HTTPException) as ctx:
                catalog.mv_catalog()

            self.assertEqual(ctx.exception.status_code, 503)
            save.assert_not_called()


if __name__ == '__main__':
    unittest.main()
