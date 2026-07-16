from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageOps


CHARACTER_SIZE = (1672, 941)
AVATAR_CROP = (620, 0, 1250, 630)
AVATAR_SIZE = (512, 512)


def build_avatar(source: Path, output: Path) -> None:
    image = Image.open(source).convert("RGBA")
    if image.size != CHARACTER_SIZE:
        raise ValueError(f"unexpected character size: {image.size}")
    crop = image.crop(AVATAR_CROP)
    avatar = ImageOps.fit(crop, AVATAR_SIZE, Image.Resampling.LANCZOS)
    output.parent.mkdir(parents=True, exist_ok=True)
    avatar.save(output)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--avatar", type=Path, required=True)
    args = parser.parse_args()
    build_avatar(args.source, args.avatar)


if __name__ == "__main__":
    main()
