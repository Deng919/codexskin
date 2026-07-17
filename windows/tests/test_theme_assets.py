import json
import unittest
from pathlib import Path

from PIL import Image


class ThemeAssetsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.theme_root = Path(__file__).resolve().parents[1] / "themes"
        cls.themes = {}
        for theme_id in ("xuanjia-chijin", "blue-night-red-eyes"):
            root = cls.theme_root / theme_id
            config = json.loads((root / "theme.json").read_text(encoding="utf-8"))
            cls.themes[theme_id] = (root, config)

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

        _, blue = self.themes["blue-night-red-eyes"]
        self.assertNotIn("character", blue)


if __name__ == "__main__":
    unittest.main()
