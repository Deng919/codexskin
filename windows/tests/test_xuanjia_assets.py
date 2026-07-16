from pathlib import Path
from tempfile import TemporaryDirectory
import sys
import unittest

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from build_xuanjia_assets import build_avatar


class AvatarBuildTest(unittest.TestCase):
    def test_builds_512_rgba_avatar_with_transparent_corners(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "source.png"
            output = root / "avatar.png"
            image = Image.new("RGBA", (1672, 941), (0, 0, 0, 0))
            ImageDraw.Draw(image).rectangle((760, 100, 1110, 520), fill=(120, 30, 20, 255))
            image.save(source)

            build_avatar(source, output)

            avatar = Image.open(output)
            self.assertEqual(avatar.mode, "RGBA")
            self.assertEqual(avatar.size, (512, 512))
            self.assertEqual(avatar.getpixel((0, 0))[3], 0)
            self.assertEqual(avatar.getpixel((256, 256))[3], 255)

    def test_rejects_an_unexpected_character_source_size(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "source.png"
            output = root / "avatar.png"
            Image.new("RGBA", (1024, 1024), (0, 0, 0, 0)).save(source)

            with self.assertRaisesRegex(ValueError, "unexpected character size"):
                build_avatar(source, output)


if __name__ == "__main__":
    unittest.main()
