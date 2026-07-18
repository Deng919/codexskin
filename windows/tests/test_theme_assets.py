import json
import unittest
from pathlib import Path

from PIL import Image


class ThemeAssetsTest(unittest.TestCase):
    expected_theme_ids = {
        "xuanjia-chijin",
        "blue-night-red-eyes",
        "neon-sakura-city",
        "frostbyte-game-room",
        "celestial-tide",
    }

    @classmethod
    def setUpClass(cls):
        cls.theme_root = Path(__file__).resolve().parents[1] / "themes"
        cls.themes = {}
        for theme_id in sorted(cls.expected_theme_ids):
            root = cls.theme_root / theme_id
            config = json.loads((root / "theme.json").read_text(encoding="utf-8"))
            cls.themes[theme_id] = (root, config)

    def test_all_finished_themes_are_present(self):
        discovered = {path.name for path in self.theme_root.iterdir() if (path / "theme.json").is_file()}
        self.assertEqual(discovered, self.expected_theme_ids)

    def test_scenes_are_16_by_9_and_fit_the_loader_limit(self):
        for theme_id, (root, config) in self.themes.items():
            scene_path = root / config["hero"]
            with self.subTest(theme=theme_id), Image.open(scene_path) as scene:
                self.assertAlmostEqual(scene.width / scene.height, 16 / 9, delta=0.002)
                self.assertIn(scene.mode, ("RGB", "RGBA"))
                self.assertLess(scene_path.stat().st_size, 16 * 1024 * 1024)

    def test_themes_do_not_carry_obsolete_avatar_assets(self):
        for theme_id, (root, config) in self.themes.items():
            with self.subTest(theme=theme_id):
                self.assertNotIn("avatar", config)

    def test_foregrounds_match_each_theme_composition(self):
        xuanjia_root, xuanjia = self.themes["xuanjia-chijin"]
        with Image.open(xuanjia_root / xuanjia["character"]) as foreground:
            self.assertEqual(foreground.mode, "RGBA")
            self.assertIsNotNone(foreground.getchannel("A").getbbox())

        for theme_id in self.expected_theme_ids - {"xuanjia-chijin"}:
            with self.subTest(theme=theme_id):
                _, config = self.themes[theme_id]
                self.assertNotIn("character", config)


if __name__ == "__main__":
    unittest.main()
