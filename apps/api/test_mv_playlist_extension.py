"""Offline safety tests for extending official MV playlists."""

import unittest

import mv_catalog as catalog


class PlaylistExtensionTests(unittest.TestCase):

    def test_existing_playlist_ids_remain_configured(self):
        required = {
            "PLaxauk3chSWgwI1W0yo5Bv9GAn1O1cwKB",
            "PLaxauk3chSWjJUBirUlCQH9fOgvfiNjcc",
            "PLaxauk3chSWj6Lg0HZtQ8mhTeGRyopOl5",
            "PLaxauk3chSWizBh8KxPj83Ue03qy0A_Xv",
            "PLaxauk3chSWjVFK0vMo9TGiOzyYZOXt9j",
        }
        self.assertTrue(required.issubset(catalog.SOURCES))

    def test_existing_categories_remain_valid(self):
        categories = {
            category
            for _, category in catalog.SOURCES.values()
            if category is not None
        }
        self.assertTrue(
            {"original", "cover", "live", "other"}.issubset(categories)
        )

    def test_guest_playlist_remains_review_only(self):
        guest = "PLaxauk3chSWjVFK0vMo9TGiOzyYZOXt9j"
        self.assertIsNone(catalog.SOURCES[guest][1])

    def test_review_only_playlist_does_not_replace_category(self):
        original = "PLaxauk3chSWgwI1W0yo5Bv9GAn1O1cwKB"
        guest = "PLaxauk3chSWjVFK0vMo9TGiOzyYZOXt9j"

        memberships = [original, guest]

        categories = list(dict.fromkeys(
            catalog.SOURCES[pid][1]
            for pid in memberships
            if catalog.SOURCES[pid][1]
        ))

        self.assertEqual(categories, ["original"])

    def test_review_only_playlist_remains_unclassified(self):
        guest = "PLaxauk3chSWjVFK0vMo9TGiOzyYZOXt9j"

        categories = [
            catalog.SOURCES[guest][1]
        ] if catalog.SOURCES[guest][1] else ["unclassified"]

        self.assertEqual(categories, ["unclassified"])


if __name__ == "__main__":
    unittest.main()
