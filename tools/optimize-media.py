#!/usr/bin/env python3
"""
Generate the optimized media the site actually serves.

Run from the repo root:

    python3 tools/optimize-media.py            # images only (the default)
    python3 tools/optimize-media.py --videos   # ALSO re-encode videos (lossy)
    python3 tools/optimize-media.py --force    # re-encode even if up to date

Outputs are committed to the repo, so GitHub Pages keeps serving static files with
no build step. Nobody needs this script to deploy — only to add or replace media.

Images   -> assets/opt/<dir>/<name>-<width>.webp, referenced from index.html as a
            <source type="image/webp"> ahead of the original JPEG fallback.
Videos   -> re-encoded in place. The originals are in git history if you need them
            back (`git show HEAD:assets/videos/entry.mp4 > entry.mp4`).

Requires: Pillow (pip install Pillow) and ffmpeg on PATH.
"""

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required: pip install Pillow")

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
OPT = ASSETS / "opt"

# Widths per source directory. Anything wider than the source is skipped, so a
# 640px thumb never gets upscaled into a larger, heavier file.
WIDTHS = {
    "images/landscape": [640, 1280, 2200],
    "images/portrait": [640, 1080, 1400],
    "images/thumbs": [640],
    "posters": [720],
}

WEBP_QUALITY = 80

# OFF BY DEFAULT. The source clips already carry faststart and are already encoded
# efficiently, so re-encoding buys bytes at the cost of real picture quality and
# nothing else. Since the tour now loads clips on demand, no video is fetched on
# first paint anyway, which is where the bytes actually mattered. Only run
# --videos if you deliberately want smaller files and accept the quality loss.
VIDEO_CRF = "34"
VIDEO_PRESET = "veryslow"
VIDEO_X264_PARAMS = "ref=5:bframes=5:aq-mode=2"

# Open Graph / Twitter share card. Cropped from the hero, centred.
SHARE_SOURCE = ASSETS / "images/landscape/living-hero.jpg"
SHARE_OUT = ASSETS / "social/share.jpg"
SHARE_SIZE = (1200, 630)


def newer(src: Path, dst: Path) -> bool:
    """True if dst is missing or older than src."""
    return not dst.exists() or dst.stat().st_mtime < src.stat().st_mtime


def kb(path: Path) -> int:
    return path.stat().st_size // 1024


def build_images(force: bool) -> tuple[int, int]:
    saved_from = saved_to = 0

    for subdir, widths in WIDTHS.items():
        src_dir = ASSETS / subdir
        if not src_dir.is_dir():
            print(f"  skip {subdir} (missing)")
            continue

        out_dir = OPT / subdir
        out_dir.mkdir(parents=True, exist_ok=True)

        for src in sorted(src_dir.glob("*.jpg")):
            with Image.open(src) as im:
                im = im.convert("RGB")
                source_width = im.width

                for width in widths:
                    if width > source_width:
                        continue

                    dst = out_dir / f"{src.stem}-{width}.webp"
                    if not force and not newer(src, dst):
                        continue

                    height = round(im.height * width / source_width)
                    resized = im.resize((width, height), Image.LANCZOS)
                    resized.save(dst, "WEBP", quality=WEBP_QUALITY, method=6)
                    print(f"  {dst.relative_to(ROOT)}  {kb(dst)}K")

            # Compare the largest variant against the original for the summary.
            largest = out_dir / f"{src.stem}-{max(w for w in widths if w <= source_width)}.webp"
            if largest.exists():
                saved_from += src.stat().st_size
                saved_to += largest.stat().st_size

    return saved_from, saved_to


def build_share_card(force: bool) -> None:
    if not SHARE_SOURCE.exists():
        print("  skip share card (source missing)")
        return
    if not force and not newer(SHARE_SOURCE, SHARE_OUT):
        return

    SHARE_OUT.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(SHARE_SOURCE) as im:
        im = im.convert("RGB")
        target_ratio = SHARE_SIZE[0] / SHARE_SIZE[1]
        width, height = im.size

        if width / height > target_ratio:
            new_width = round(height * target_ratio)
            left = (width - new_width) // 2
            im = im.crop((left, 0, left + new_width, height))
        else:
            new_height = round(width / target_ratio)
            top = (height - new_height) // 2
            im = im.crop((0, top, width, top + new_height))

        im.resize(SHARE_SIZE, Image.LANCZOS).save(
            SHARE_OUT, "JPEG", quality=82, optimize=True, progressive=True
        )
    print(f"  {SHARE_OUT.relative_to(ROOT)}  {kb(SHARE_OUT)}K")


def build_videos(force: bool) -> tuple[int, int]:
    if not shutil.which("ffmpeg"):
        print("  ffmpeg not found on PATH - skipping videos")
        return 0, 0

    src_dir = ASSETS / "videos"
    stamp_dir = OPT / "videos"
    stamp_dir.mkdir(parents=True, exist_ok=True)

    before = after = 0

    for src in sorted(src_dir.glob("*.mp4")):
        # A stamp file records that this video has already been re-encoded, so
        # reruns do not recompress an already-compressed file into mush.
        stamp = stamp_dir / f"{src.stem}.done"
        if not force and stamp.exists() and stamp.stat().st_mtime >= src.stat().st_mtime:
            continue

        original_size = src.stat().st_size
        tmp = src.with_suffix(".tmp.mp4")

        result = subprocess.run(
            [
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-i", str(src),
                "-an",                          # sources are already silent
                "-c:v", "libx264",
                "-crf", VIDEO_CRF,
                "-preset", VIDEO_PRESET,
                "-profile:v", "main",           # broad mobile decode support
                "-pix_fmt", "yuv420p",          # required for Safari/iOS
                "-x264-params", VIDEO_X264_PARAMS,
                "-movflags", "+faststart",      # play before the file completes
                str(tmp),
            ],
            capture_output=True,
            text=True,
        )

        if result.returncode != 0 or not tmp.exists():
            tmp.unlink(missing_ok=True)
            print(f"  FAILED {src.name}: {result.stderr.strip()[:200]}")
            continue

        new_size = tmp.stat().st_size
        if new_size >= original_size:
            # Re-encoding made it bigger; keep the original.
            tmp.unlink()
            print(f"  {src.name}  kept original ({original_size // 1024}K)")
        else:
            tmp.replace(src)
            print(f"  {src.name}  {original_size // 1024}K -> {new_size // 1024}K")

        stamp.write_text("re-encoded by tools/optimize-media.py\n")
        stamp.touch()
        before += original_size
        after += min(new_size, original_size)

    return before, after


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--images", action="store_true", help="images only")
    parser.add_argument("--videos", action="store_true", help="videos only")
    parser.add_argument("--force", action="store_true", help="ignore timestamps")
    args = parser.parse_args()

    do_images = args.images or not args.videos
    # Videos are opt-in. The sources already have faststart, so re-encoding
    # only trades visible quality for bytes - see the note on VIDEO_CRF.
    do_videos = args.videos

    if do_images:
        print("Images -> WebP")
        src_bytes, out_bytes = build_images(args.force)
        print("Share card")
        build_share_card(args.force)
        if src_bytes:
            pct = 100 - (out_bytes * 100 // src_bytes)
            print(f"  full-size JPEG {src_bytes // 1024}K -> WebP {out_bytes // 1024}K ({pct}% smaller)")

    if do_videos:
        print("Videos -> H.264 CRF " + VIDEO_CRF)
        before, after = build_videos(args.force)
        if before:
            pct = 100 - (after * 100 // before)
            print(f"  {before // 1024}K -> {after // 1024}K ({pct}% smaller)")


if __name__ == "__main__":
    main()
