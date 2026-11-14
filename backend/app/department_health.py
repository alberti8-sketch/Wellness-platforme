"""Deterministic reader for CNAM Tableau 7 departmental workbooks."""
import io
import math
import re
import unicodedata
from pathlib import Path

import openpyxl
import xlrd


CITY_DEPARTMENTS = {"74", "35", "44", "29", "25", "93", "06", "13"}


def _text(value):
    return str(value).strip() if value is not None else ""


def _condition_id(label):
    normalized = unicodedata.normalize("NFKD", label).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", normalized.casefold()).strip("-")


def _count(value, location):
    if value is None or value == "":
        return None
    if _text(value).replace(" ", "") == "<10":
        return "<10"
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if math.isfinite(value) and value >= 0 and value == int(value):
            return int(value)
    raise ValueError(f"{location}: expected a non-negative count, blank, or <10")


def parse_department_health(contents: bytes, filename: str) -> dict:
    """Keep counts distinct by department, condition, sex, and age cohort.

    The 65+ column includes both sexes and overlaps the men/women columns.
    No prevalence, city counts, or combined cohort totals are inferred.
    """
    suffix = Path(filename).suffix.lower()
    if suffix == ".xls":
        book = xlrd.open_workbook(file_contents=contents)
        try:
            sheets = [(sheet.name, [sheet.row_values(i) for i in range(sheet.nrows)])
                      for sheet in book.sheets()]
        finally:
            book.release_resources()
    elif suffix == ".xlsx":
        book = openpyxl.load_workbook(io.BytesIO(contents), read_only=True, data_only=True)
        try:
            sheets = [(sheet.title, list(sheet.iter_rows(values_only=True))) for sheet in book]
        finally:
            book.close()
    else:
        raise ValueError("Only .xls and .xlsx CNAM workbooks are supported")
    return _parse_sheets(sheets, Path(filename).name)


def _parse_sheets(sheets, filename):
    years = set()
    conditions = {}
    departments = {}
    recognized_sheets = []
    for sheet_name, rows in sheets:
        if len(rows) < 5 or len(rows[3]) < 3 or _text(rows[3][1]) != "top":
            continue
        recognized_sheets.append(sheet_name)
        sheet_years = {
            int(match)
            for value in rows[0]
            for match in re.findall(r"\ben\s+(20\d{2})\b", _text(value))
        }
        if len(sheet_years) != 1:
            raise ValueError(f"{sheet_name}: expected a single reporting year in the title")
        years.update(sheet_years)
        for column in range(2, len(rows[1]), 3):
            department = _text(rows[1][column]).rstrip("*")
            if not department:
                continue
            if not re.fullmatch(r"\d{2,3}|2[AB]", department):
                raise ValueError(f"{sheet_name}: invalid department {department}")
            headers = [_text(value) for value in rows[2][column:column + 3]]
            if headers not in (["Hommes", "Femmes", "≥ 65 ans"], ["Hommes", "Femmes", ">= 65 ans"]):
                raise ValueError(f"{sheet_name}: invalid cohort columns for department {department}")
            if department in departments:
                raise ValueError(f"Duplicate department {department}; counts will not be added together")
            values = {}
            for index, row in enumerate(rows[4:], 5):
                label = _text(row[0])
                if not label:
                    continue
                condition_id = _condition_id(label)
                if not condition_id or condition_id in values:
                    raise ValueError(f"{sheet_name} row {index}: duplicate or invalid condition")
                condition = {
                    "id": condition_id, "label": label,
                    "is_total": label.casefold() == "total",
                }
                if condition_id in conditions and conditions[condition_id] != condition:
                    raise ValueError(f"Inconsistent condition {label} across sheets")
                conditions[condition_id] = condition
                counts = row[column:column + 3]
                if len(counts) != 3:
                    raise ValueError(f"{sheet_name} row {index}: incomplete cohort columns")
                values[condition_id] = {
                    cohort: _count(value, f"{sheet_name} row {index}, {department}, {cohort}")
                    for cohort, value in zip(("men", "women", "age65plus"), counts)
                }
            if not values:
                raise ValueError(f"{sheet_name}: no conditions for department {department}")
            departments[department] = values
    if len(years) != 1 or not departments:
        raise ValueError("Expected CNAM Tableau 7 sheets with one reporting year and department/cohort headers")
    return {
        "year": years.pop(),
        "source_name": filename,
        "source_level": "department",
        "sheets": recognized_sheets,
        "conditions": list(conditions.values()),
        "departments": {code: values for code, values in departments.items() if code in CITY_DEPARTMENTS},
    }
