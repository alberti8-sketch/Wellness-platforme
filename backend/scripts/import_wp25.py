"""Convert the team workbook WP25.xlsx (Drive « HACKATHON 13/11/26 / DATA SCORING ») into the
platform template.

Usage (from backend/):  python -m scripts.import_wp25 path/to/WP25.xlsx

The raw workbook is NOT versioned (it lives on the team Drive): download it, then pass its path
(or put it in data/sources/, which is git-ignored). The converted output data/wp25_communes.xlsx
IS versioned and is what the demo seed and the tests use.

Mapping
  sheet "CITY"          -> territory_type = urbain
  sheet "middle CiTY"   -> territory_type = semi-urbain
  sheet "COUNTRY SIDE"  -> territory_type = rural
  "Annecy 74000"        -> INSEE code resolved from name + département of the postal code
  SPORT / ENVIRONMENT / HEALTH CARE (/100)  -> sport_score / env_score / health_care_score
  Global score          -> source_global_score (context only: it is NOT derivable from the three
                           dimension scores, so the platform recomputes its own weighted index)
  Population            -> population   ("225 K / 370" = commune 225k / agglomeration 370k)
  Pop density           -> density_km2
  ZIP code Poverty quarter / population ("35238 21K") -> social_qpv_pct = QPV population / population
"""

from __future__ import annotations

import re
import sys
import unicodedata
from pathlib import Path
from typing import Any

from openpyxl import load_workbook

from geo import communes
from pipeline.template import build_workbook

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SOURCE = ROOT / "data" / "sources" / "WP25.xlsx"  # git-ignored local copy of the Drive file
CONVERTED = ROOT / "data" / "wp25_communes.xlsx"  # versioned output
OUT = ROOT / "data"
PERIOD = 2025  # « WP25 »

SHEETS = {"CITY": "urbain", "middle CiTY": "semi-urbain", "COUNTRY SIDE": "rural"}


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]", "", s)


def resolve_commune(label: str) -> tuple[str, str]:
    """'Annecy 74000' -> ('74010', 'Annecy'), using the official commune reference."""
    m = re.match(r"^\s*(.+?)\s+(\d{2})\s?(\d{3})\s*$", label)
    if not m:
        raise ValueError(f"Libellé ville/code postal illisible : {label!r}")
    name, dept = m.group(1), m.group(2)
    target = _norm(name)
    candidates = [(c, n) for c, n in communes().items() if c.startswith(dept) and _norm(n) == target]
    if not candidates:  # e.g. "Font romeu" -> "Font-Romeu-Odeillo-Via"
        candidates = [(c, n) for c, n in communes().items() if c.startswith(dept) and _norm(n).startswith(target)]
    if len(candidates) != 1:
        raise ValueError(f"Commune introuvable ou ambiguë pour {label!r} : {candidates[:5]}")
    return candidates[0]


def parse_population(raw: Any) -> float | None:
    """'130 k' -> 130000 ; '225 K / 370 ' -> 225000 ; '320 / 670' -> 320000 ; '1,2 k' -> 1200."""
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    first = str(raw).split("/")[0].strip().lower().replace(",", ".")
    m = re.match(r"^([\d.\s]+)\s*([km]?)", first)
    if not m:
        return None
    value = float(m.group(1).replace(" ", ""))
    unit = m.group(2)
    if unit == "m":
        return value * 1_000_000
    if unit == "k" or value < 10_000:  # the sheet expresses populations in thousands
        return value * 1_000
    return value


def parse_qpv(raw: Any) -> tuple[str | None, float | None]:
    """'35238   21K' -> ('35238', 21000) ; '06 088.  42K' -> ('06088', 42000)."""
    if raw is None:
        return None, None
    m = re.match(r"^\s*([\d\s]{5,6})\.?\s+([\d.,]+)\s*([kK]?)\s*$", str(raw))
    if not m:
        return None, None
    code = m.group(1).replace(" ", "")
    value = float(m.group(2).replace(",", ".")) * (1000 if m.group(3) else 1)
    return code, value


def convert(source: Path) -> tuple[list[dict[str, Any]], list[str]]:
    wb = load_workbook(source, data_only=True)
    rows: list[dict[str, Any]] = []
    notes: list[str] = []
    for sheet, ttype in SHEETS.items():
        ws = wb[sheet]
        header_row = next(r for r in range(1, 20) if str(ws.cell(r, 2).value or "").strip().lower().startswith("city"))
        for r in range(header_row + 1, ws.max_row + 1):
            label = ws.cell(r, 2).value
            sport = ws.cell(r, 3).value
            if not label or not isinstance(sport, (int, float)):
                if label:
                    break  # end of the table (e.g. "COMPARAISON RENNES / NANTES" block)
                continue
            code, name = resolve_commune(str(label))
            population = parse_population(ws.cell(r, 7).value)
            qpv_code, qpv_pop = parse_qpv(ws.cell(r, 9).value) if ws.max_column >= 9 else (None, None)
            if qpv_code and qpv_code != code:
                notes.append(f"{name}: code QPV {qpv_code} ≠ code INSEE {code}")
            qpv_pct = round(100 * qpv_pop / population, 1) if qpv_pop and population else None
            rows.append({
                "territory_code": code,
                "territory_name": name,
                "period": PERIOD,
                "territory_type": ttype,
                "population": population,
                "density_km2": ws.cell(r, 8).value,
                "source_global_score": ws.cell(r, 6).value,
                "sport_score": sport,
                "env_score": ws.cell(r, 4).value,
                "health_care_score": ws.cell(r, 5).value,
                "social_qpv_pct": qpv_pct,
            })

    # Data-quality notes for the team.
    seen: dict[tuple, str] = {}
    for row in rows:
        key = (row["sport_score"], row["env_score"], row["health_care_score"])
        if key in seen:
            notes.append(f"{row['territory_name']}: scores identiques à {seen[key]} (copier-coller ?)")
        seen.setdefault(key, row["territory_name"])
        if row["social_qpv_pct"] is None:
            notes.append(f"{row['territory_name']}: pas de donnée QPV → dimension Social non calculée")
    return rows, notes


def load_converted() -> list[dict[str, Any]]:
    """Rows of the versioned converted file (no dependency on the raw Drive workbook)."""
    from pipeline.validation import parse_excel

    return [{k: v for k, v in r.items() if k != "_row"} for r in parse_excel(CONVERTED.read_bytes())]


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SOURCE
    if not source.exists():
        raise SystemExit(f"Classeur WP25 introuvable : {source}. "
                         "Télécharge-le depuis le Drive (HACKATHON 13/11/26 / DATA SCORING) et passe son chemin.")
    rows, notes = convert(source)
    target = OUT / "wp25_communes.xlsx"
    target.write_bytes(build_workbook(rows))
    print(f"{len(rows)} communes converties → {target}")
    for n in notes:
        print("  ⚠", n)


if __name__ == "__main__":
    main()
