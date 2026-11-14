"""Step 1 — ingestion: Excel parsing, strict Pydantic schema validation, tenant scoping.

Only deterministic rules live here. The output is a `ValidationReport` that is
shown to the user *before* submission (preview) and re-computed by the
pipeline on submission (never trusted from the client).
"""

from __future__ import annotations

import io
import math
from datetime import date, datetime
from typing import Annotated, Any, Literal

import pandas as pd
from pydantic import AfterValidator, BaseModel, BeforeValidator, ConfigDict, Field, ValidationError, create_model

from config import MAX_ROWS, Tenant, departements

from .catalog import ID_COLUMNS, INDICATORS

MISSING_TOKENS = {"", "na", "n/a", "nan", "nd", "n.d.", "-", "--", "null", "none", "?"}


class IngestError(Exception):
    """The file itself is unreadable (not a row-level problem)."""


# --------------------------------------------------------------------------- #
# Coercion helpers (deterministic, locale-tolerant)                           #
# --------------------------------------------------------------------------- #
def coerce_number(v: Any) -> float | None:
    if v is None:
        return None
    if isinstance(v, bool):
        raise ValueError("booléen non autorisé")
    if isinstance(v, (int, float)):
        return None if math.isnan(float(v)) else float(v)
    if isinstance(v, str):
        s = v.strip().replace(" ", "").replace(" ", "").rstrip("%")
        if s.lower() in MISSING_TOKENS:
            return None
        try:
            return float(s.replace(",", "."))
        except ValueError:
            raise ValueError(f"valeur non numérique « {v} »") from None
    raise ValueError(f"type non supporté ({type(v).__name__})")


def coerce_code(v: Any) -> str:
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    if isinstance(v, int):
        v = str(v)
    if not isinstance(v, str):
        raise ValueError("code territoire manquant")
    s = v.strip().upper()
    if s.isdigit() and len(s) == 1:
        s = s.zfill(2)  # Excel turns "01" into 1
    return s


def check_departement(code: str) -> str:
    if code not in departements():
        raise ValueError(f"code département inconnu « {code} »")
    return code


def coerce_period(v: Any) -> int:
    if isinstance(v, float) and v.is_integer():
        return int(v)
    if isinstance(v, str) and v.strip().isdigit():
        return int(v.strip())
    if isinstance(v, int) and not isinstance(v, bool):
        return v
    raise ValueError("période attendue au format AAAA")


Number = Annotated[float | None, BeforeValidator(coerce_number)]


class _RowBase(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    territory_code: Annotated[str, BeforeValidator(coerce_code), AfterValidator(check_departement)]
    territory_name: Annotated[str, Field(min_length=1, max_length=255)]
    period: Annotated[int, BeforeValidator(coerce_period), Field(ge=2000, le=2100)]


# Strict row schema generated from the catalog: one optional, bounded float per indicator.
TerritoryRow = create_model(
    "TerritoryRow",
    __base__=_RowBase,
    **{
        code: (Number, Field(default=None, ge=ind.hard_min, le=ind.hard_max, description=ind.label))
        for code, ind in INDICATORS.items()
    },
)


# --------------------------------------------------------------------------- #
# Report models (API contract)                                                #
# --------------------------------------------------------------------------- #
class Issue(BaseModel):
    row: int | None = None  # spreadsheet row number (header = row 1)
    column: str | None = None
    severity: Literal["error", "warning"]
    code: str
    message: str


class ParsedRow(BaseModel):
    row: int
    territory_code: str
    territory_name: str
    period: int
    values: dict[str, float | None]


class ValidationReport(BaseModel):
    columns: list[str]
    indicator_columns: list[str]
    unknown_columns: list[str]
    missing_indicator_columns: list[str]
    raw_rows: list[dict[str, Any]]
    rows: list[ParsedRow]
    issues: list[Issue]
    error_count: int
    warning_count: int

    @property
    def is_valid(self) -> bool:
        return self.error_count == 0


# --------------------------------------------------------------------------- #
# Parsing                                                                     #
# --------------------------------------------------------------------------- #
def _jsonable(v: Any) -> Any:
    if v is None:
        return None
    if hasattr(v, "item") and not isinstance(v, (str, bytes)):  # numpy scalar
        v = v.item()
    if isinstance(v, float) and math.isnan(v):
        return None
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, (int, float, str, bool)):
        return v
    return str(v)


def parse_excel(content: bytes) -> list[dict[str, Any]]:
    """Read the `data` sheet (or the first sheet) into JSON-safe raw rows."""
    if not content.startswith(b"PK"):
        raise IngestError("Le fichier n'est pas un classeur .xlsx valide.")
    try:
        book = pd.ExcelFile(io.BytesIO(content), engine="openpyxl")
        sheet = "data" if "data" in book.sheet_names else book.sheet_names[0]
        df = book.parse(sheet, dtype=object)
    except Exception as exc:  # noqa: BLE001 - surface any parser failure as a clean 400
        raise IngestError(f"Lecture du fichier impossible : {exc}") from exc

    df.columns = [str(c).strip().lower() for c in df.columns]
    df = df.dropna(how="all")
    if len(df) > MAX_ROWS:
        raise IngestError(f"Trop de lignes ({len(df)} > {MAX_ROWS}).")

    rows: list[dict[str, Any]] = []
    for idx, rec in zip(df.index, df.to_dict(orient="records"), strict=True):
        row = {k: _jsonable(v) for k, v in rec.items() if not k.startswith("unnamed:")}
        row["_row"] = int(idx) + 2  # header is row 1
        rows.append(row)
    return rows


# --------------------------------------------------------------------------- #
# Validation                                                                  #
# --------------------------------------------------------------------------- #
def validate_rows(raw_rows: list[dict[str, Any]], tenant: Tenant) -> ValidationReport:
    issues: list[Issue] = []
    columns = sorted({k for r in raw_rows for k in r if k != "_row"})

    known = set(ID_COLUMNS) | set(INDICATORS)
    indicator_columns = [c for c in INDICATORS if c in columns]
    unknown = [c for c in columns if c not in known]
    missing_ind = [c for c in INDICATORS if c not in columns]

    for col in ID_COLUMNS:
        if col not in columns:
            issues.append(Issue(severity="error", code="missing_column", column=col,
                                message=f"Colonne obligatoire absente : {col}"))
    if not indicator_columns:
        issues.append(Issue(severity="error", code="no_indicator",
                            message="Aucune colonne d'indicateur reconnue."))
    for col in unknown:
        issues.append(Issue(severity="warning", code="unknown_column", column=col,
                            message=f"Colonne inconnue ignorée : {col}"))
    for col in missing_ind:
        issues.append(Issue(severity="warning", code="missing_indicator_column", column=col,
                            message=f"Indicateur absent du fichier : {col}"))
    if not raw_rows:
        issues.append(Issue(severity="error", code="empty", message="Le fichier ne contient aucune ligne."))

    parsed: list[ParsedRow] = []
    seen: dict[tuple[str, int], int] = {}
    if not any(i.code == "missing_column" for i in issues):
        for raw in raw_rows:
            rownum = int(raw.get("_row", 0))
            payload = {k: raw.get(k) for k in known if k in raw}
            try:
                model = TerritoryRow.model_validate(payload)
            except ValidationError as exc:
                for err in exc.errors():
                    col = str(err["loc"][0]) if err["loc"] else None
                    issues.append(Issue(row=rownum, column=col, severity="error", code="invalid_value",
                                        message=_fr_error(err)))
                continue

            data = model.model_dump()
            code = data["territory_code"]

            # Tenant geographic scope: a tenant may never submit outside its territories.
            if tenant.allowed_territories is not None and code not in tenant.allowed_territories:
                issues.append(Issue(row=rownum, column="territory_code", severity="error",
                                    code="out_of_tenant_scope",
                                    message=f"Territoire {code} hors du périmètre autorisé pour ce compte."))
                continue

            key = (code, data["period"])
            if key in seen:
                issues.append(Issue(row=rownum, column="territory_code", severity="error", code="duplicate",
                                    message=f"Doublon {code}/{data['period']} (déjà ligne {seen[key]})."))
                continue
            seen[key] = rownum

            ref_name = departements()[code]
            if _norm(ref_name) != _norm(data["territory_name"]):
                issues.append(Issue(row=rownum, column="territory_name", severity="warning", code="name_mismatch",
                                    message=f"Nom « {data['territory_name']} » ≠ référentiel « {ref_name} » "
                                            f"(le nom du référentiel sera utilisé)."))
            parsed.append(ParsedRow(
                row=rownum,
                territory_code=code,
                territory_name=ref_name,
                period=data["period"],
                values={c: data[c] for c in INDICATORS},
            ))

    errors = sum(1 for i in issues if i.severity == "error")
    return ValidationReport(
        columns=columns,
        indicator_columns=indicator_columns,
        unknown_columns=unknown,
        missing_indicator_columns=missing_ind,
        raw_rows=raw_rows,
        rows=parsed,
        issues=issues,
        error_count=errors,
        warning_count=len(issues) - errors,
    )


def _norm(s: str) -> str:
    import unicodedata

    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return "".join(ch for ch in s.lower() if ch.isalnum())


def _fr_error(err: dict[str, Any]) -> str:
    t = err.get("type", "")
    ctx = err.get("ctx") or {}
    if t == "greater_than_equal":
        return f"Valeur inférieure au minimum autorisé ({ctx.get('ge')})."
    if t == "less_than_equal":
        return f"Valeur supérieure au maximum autorisé ({ctx.get('le')})."
    if t == "missing":
        return "Valeur obligatoire manquante."
    if t == "extra_forbidden":
        return "Champ non autorisé."
    msg = str(err.get("msg", "Valeur invalide"))
    return msg.removeprefix("Value error, ")
