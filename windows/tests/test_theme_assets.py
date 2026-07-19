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

    def test_every_finished_theme_has_a_real_foreground(self):
        required_layout = {
            "characterSize",
            "characterPosition",
            "characterSizeNarrow",
            "characterPositionNarrow",
        }
        for theme_id, (root, config) in self.themes.items():
            with self.subTest(theme=theme_id):
                self.assertIn("character", config)
                self.assertTrue(required_layout.issubset(config["layout"]))
                foreground_path = root / config["character"]
                self.assertLess(foreground_path.stat().st_size, 16 * 1024 * 1024)
                with Image.open(foreground_path) as foreground:
                    self.assertEqual(foreground.mode, "RGBA")
                    alpha = foreground.getchannel("A")
                    self.assertIsNotNone(alpha.getbbox())
                    corners = [
                        alpha.getpixel((0, 0)),
                        alpha.getpixel((foreground.width - 1, 0)),
                        alpha.getpixel((0, foreground.height - 1)),
                        alpha.getpixel((foreground.width - 1, foreground.height - 1)),
                    ]
                    self.assertEqual(corners, [0, 0, 0, 0])


if __name__ == "__main__":
    unittest.main()
