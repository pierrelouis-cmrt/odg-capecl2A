#!/usr/bin/env python3

from __future__ import annotations

import hashlib
import os
import re
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parent.parent
HASH_LENGTH = 10
HASH_PATTERN = re.compile(rf"\.[0-9a-f]{{{HASH_LENGTH}}}$")
HTML_FILES = sorted(ROOT.glob("*.html")) + sorted((ROOT / "pages").glob("*.html"))


def discover_source_assets() -> list[Path]:
    assets: list[Path] = []

    for directory, suffix in ((ROOT / "styles", ".css"), (ROOT / "scripts", ".js")):
        for file_path in sorted(directory.glob(f"*{suffix}")):
            if HASH_PATTERN.search(file_path.stem):
                continue
            assets.append(file_path)

    return assets


def short_hash(file_path: Path) -> str:
    return hashlib.sha256(file_path.read_bytes()).hexdigest()[:HASH_LENGTH]


def hashed_asset_path(source_path: Path, digest: str) -> Path:
    return source_path.with_name(f"{source_path.stem}.{digest}{source_path.suffix}")


def cleanup_old_hashed_assets(source_path: Path, keep_path: Path) -> None:
    hashed_name_pattern = re.compile(
        rf"^{re.escape(source_path.stem)}\.[0-9a-f]{{{HASH_LENGTH}}}{re.escape(source_path.suffix)}$"
    )

    for sibling in source_path.parent.iterdir():
        if sibling == keep_path:
            continue
        if hashed_name_pattern.match(sibling.name):
            sibling.unlink()


def write_hashed_asset(source_path: Path) -> tuple[Path, Path]:
    digest = short_hash(source_path)
    target_path = hashed_asset_path(source_path, digest)

    cleanup_old_hashed_assets(source_path, target_path)

    source_bytes = source_path.read_bytes()
    if not target_path.exists() or target_path.read_bytes() != source_bytes:
        target_path.write_bytes(source_bytes)

    return source_path, target_path


def build_reference_pattern(relative_source: str) -> re.Pattern[str]:
    path = Path(relative_source)
    directory = "" if path.parent == Path(".") else f"{path.parent.as_posix()}/"
    prefix = r"(?:\./)?" if not relative_source.startswith(("../", "./")) else ""

    return re.compile(
        rf"{prefix}{re.escape(directory)}{re.escape(path.stem)}(?:\.[0-9a-f]{{{HASH_LENGTH}}})?{re.escape(path.suffix)}"
    )


def replacement_path(matched_text: str, relative_target: str) -> str:
    if matched_text.startswith("./") and not relative_target.startswith(("./", "../")):
        return f"./{relative_target}"
    return relative_target


def rewrite_html_references(asset_map: Iterable[tuple[Path, Path]]) -> None:
    for html_path in HTML_FILES:
        updated_content = html_path.read_text(encoding="utf-8")
        original_content = updated_content

        for source_path, target_path in asset_map:
            source_ref = os.path.relpath(source_path, html_path.parent).replace(os.sep, "/")
            target_ref = os.path.relpath(target_path, html_path.parent).replace(os.sep, "/")

            pattern = build_reference_pattern(source_ref)
            updated_content = pattern.sub(
                lambda match: replacement_path(match.group(0), target_ref),
                updated_content,
            )

        if updated_content != original_content:
            html_path.write_text(updated_content, encoding="utf-8")


def main() -> None:
    asset_map = [write_hashed_asset(source_path) for source_path in discover_source_assets()]
    rewrite_html_references(asset_map)


if __name__ == "__main__":
    main()
