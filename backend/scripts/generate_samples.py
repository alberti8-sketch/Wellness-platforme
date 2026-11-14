"""Regenerate the blank Excel template and the WP25 demo file into ../data/.

Usage (from backend/):  python -m scripts.generate_samples
"""

from __future__ import annotations

import sys
from pathlib import Path

from pipeline.template import build_workbook
from scripts import import_wp25

OUT = Path(__file__).resolve().parents[2] / "data"


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "wellness_template.xlsx").write_bytes(build_workbook())
    print(f"Modèle vierge → {OUT / 'wellness_template.xlsx'}")
    import_wp25.main()


if __name__ == "__main__":
    main()
