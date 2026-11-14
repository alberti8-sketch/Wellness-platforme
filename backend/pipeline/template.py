"""Excel template generation, driven by the catalog (single source of truth)."""

from __future__ import annotations

import io
from collections.abc import Sequence
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from .catalog import CONTEXT_COLUMNS, DIMENSIONS, ID_COLUMNS, INDICATORS

HEADER_FILL = PatternFill("solid", fgColor="1F3A5F")
DIM_FILLS = {"SPORT": "DCEBFA", "ENV": "EAF5E1", "HEALTH": "E8E4F8", "SOCIAL": "FCEFD9", "CLIN": "F8E1E1"}


def build_workbook(rows: Sequence[dict[str, Any]] = ()) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "data"
    headers = [*ID_COLUMNS, *CONTEXT_COLUMNS, *INDICATORS]
    ws.append(headers)
    for col, name in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = HEADER_FILL
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        ws.column_dimensions[get_column_letter(col)].width = max(14, len(name) + 2)
    for r in rows:
        ws.append([r.get(h) for h in headers])
    # Keep codes as text so "01" is not turned into 1.
    for row in ws.iter_rows(min_row=2, min_col=1, max_col=1):
        for cell in row:
            cell.number_format = "@"
    ws.freeze_panes = "D2"

    dico = wb.create_sheet("dictionnaire")
    dico.append(["colonne", "dimension", "libellé", "unité", "sens", "réf. min (score 1 ou 10)",
                 "réf. max", "borne min", "borne max", "source indicative"])
    for c in dico[1]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = HEADER_FILL
    dico.append(["territory_code", "", "Code INSEE : commune (5 car., ex. 35238) ou département (ex. 35, 2A)",
                 "", "", "", "", "", "", "INSEE — Code officiel géographique"])
    dico.append(["territory_name", "", "Nom du territoire", "", "", "", "", "", "", "INSEE"])
    dico.append(["period", "", "Année de référence (AAAA)", "", "", "", "", "", "", ""])
    for col, label in CONTEXT_COLUMNS.items():
        dico.append([col, "Contexte (non noté)", label, "", "", "", "", "", "", ""])
    for ind in INDICATORS.values():
        dico.append([ind.code, DIMENSIONS[ind.dimension].label, ind.label, ind.unit,
                     "↑ plus haut = mieux" if ind.direction == "higher_is_better" else "↓ plus bas = mieux",
                     ind.ref_min, ind.ref_max, ind.hard_min, ind.hard_max, ind.source_hint])
        dico.cell(row=dico.max_row, column=2).fill = PatternFill("solid", fgColor=DIM_FILLS[ind.dimension])
    for col, width in zip("ABCDEFGHIJ", (26, 20, 52, 12, 20, 12, 10, 10, 10, 48), strict=True):
        dico.column_dimensions[col].width = width

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
