import io
import json
from pathlib import Path
import unittest

import openpyxl

from app.department_health import parse_department_health
from tests.conftest import ADMIN_B2B, ADMIN_B2G, CONTRIB_B2G


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "context/2024_effectif-departemental-par-pathologie-sexe-age_serie-annuelle.xls"


def small_workbook(counts=(12, "<10", None), year=2025, department="35", cohorts=None):
    book = openpyxl.Workbook()
    sheet = book.active
    sheet.append(["", "", f"Effectifs en {year}"])
    sheet.append(["", "", department, "", ""])
    sheet.append(["", "", *(cohorts or ["Hommes", "Femmes", "≥ 65 ans"])])
    sheet.append(["", "top", "dpt0351", "dpt0352", "dpt0353"])
    sheet.append(["Diabète", "top_FDiabet_ind", *counts])
    data = io.BytesIO()
    book.save(data)
    book.close()
    return data.getvalue()


class DepartmentParserTests(unittest.TestCase):
    def test_real_workbook_matches_bundled_reference_and_both_sheets(self):
        parsed = parse_department_health(SOURCE.read_bytes(), SOURCE.name)
        bundled = json.loads((ROOT / "frontend/data/department-health-2024.json").read_text())
        self.assertEqual(parsed, bundled)
        self.assertEqual(set(parsed["departments"]), {"74", "35", "44", "29", "25", "93", "06", "13"})
        self.assertEqual(len(parsed["conditions"]), 64)
        self.assertEqual(len(parsed["sheets"]), 2)
        expected_diabetes = {
            "74": (21760, 16970, 24510), "35": (26290, 20320, 28580),
            "44": (40540, 30560, 45070), "29": (27540, 20200, 32020),
            "25": (18820, 15590, 22280), "93": (67800, 59320, 63450),
            "06": (40480, 32390, 48910), "13": (78840, 65740, 90710),
        }
        cities = json.loads((ROOT / "frontend/data/wp25-territories.json").read_text())
        self.assertEqual(len(cities), 8)
        for city in cities:
            code = city["department_code"]
            values = parsed["departments"][code]["diabete"]
            self.assertEqual(tuple(values[key] for key in ("men", "women", "age65plus")), expected_diabetes[code])
        self.assertIsNone(parsed["departments"]["35"]["cancer-du-sein-de-la-femme-actif"]["men"])

    def test_future_xlsx_preserves_missing_suppressed_and_zero(self):
        parsed = parse_department_health(small_workbook(), "future.xlsx")
        self.assertEqual(parsed["year"], 2025)
        self.assertEqual(parsed["departments"]["35"]["diabete"], {
            "men": 12, "women": "<10", "age65plus": None,
        })
        zero = parse_department_health(small_workbook(counts=(0, 0, 0)), "future.xlsx")
        self.assertEqual(zero["departments"]["35"]["diabete"]["men"], 0)
        self.assertNotIn("74", parsed["departments"])

    def test_rejects_bad_counts_and_cohort_headers(self):
        for counts in ((-1, 2, 3), (1.5, 2, 3), ("unknown", 2, 3)):
            with self.subTest(counts=counts), self.assertRaises(ValueError):
                parse_department_health(small_workbook(counts=counts), "future.xlsx")
        with self.assertRaisesRegex(ValueError, "cohort"):
            parse_department_health(
                small_workbook(cohorts=["Hommes", "Femmes", "Total"]), "future.xlsx"
            )

    def test_rejects_duplicate_departments_instead_of_double_counting(self):
        book = openpyxl.load_workbook(io.BytesIO(small_workbook()))
        book.copy_worksheet(book.active)
        stream = io.BytesIO()
        book.save(stream)
        book.close()
        with self.assertRaisesRegex(ValueError, "Duplicate department"):
            parse_department_health(stream.getvalue(), "duplicate.xlsx")


def upload(client, contents=None, filename="future.xlsx", headers=CONTRIB_B2G):
    return client.post(
        "/api/department-health/upload", headers=headers,
        files={"file": (filename, contents if contents is not None else small_workbook())},
    )


def test_upload_reload_and_authenticated_tenant_reads(client):
    response = upload(client, contents=SOURCE.read_bytes(), filename=SOURCE.name)
    assert response.status_code == 201, response.text
    dataset_id = response.json()["dataset_id"]
    response = client.get(f"/api/department-health/{dataset_id}", headers=ADMIN_B2G)
    assert response.status_code == 200
    assert response.json()["departments"]["74"]["diabete"]["women"] == 16970
    assert client.get(f"/api/department-health/{dataset_id}", headers=ADMIN_B2B).status_code == 404
    assert client.get("/api/department-health", headers=ADMIN_B2B).json() == {"datasets": []}
    # Caller-controlled tenant parameters cannot cross the authenticated boundary.
    assert client.get(
        f"/api/department-health/{dataset_id}", headers=ADMIN_B2B,
        params={"tenant_id": "b2g-sante-publique"},
    ).status_code == 404
    from db import engine

    engine.dispose()
    assert client.get("/api/department-health", headers=ADMIN_B2G).json()["datasets"][0]["dataset_id"] == dataset_id


def test_repeated_uploads_are_snapshots_not_added_counts(client):
    first, second = upload(client), upload(client)
    assert first.status_code == second.status_code == 201
    assert first.json()["dataset_id"] != second.json()["dataset_id"]
    response = client.get(f"/api/department-health/{second.json()['dataset_id']}", headers=ADMIN_B2G)
    assert response.json()["departments"]["35"]["diabete"]["men"] == 12


def test_invalid_department_uploads_do_not_persist(client, monkeypatch):
    assert upload(client, contents=b"bad", filename="bad.xls").status_code == 422
    assert upload(client, filename="bad.csv").status_code == 400
    assert upload(client, contents=small_workbook(department="75")).status_code == 422
    monkeypatch.setattr("app.routers.department_health.MAX_UPLOAD_BYTES", 10)
    assert upload(client).status_code == 413
    assert client.get("/api/department-health", headers=ADMIN_B2G).json() == {"datasets": []}


def test_department_upload_auth_role_and_geographic_scope(client, monkeypatch):
    assert upload(client, headers={}).status_code == 401
    assert client.get("/api/department-health").status_code == 401
    assert upload(client, headers=ADMIN_B2B).status_code == 403
    assert upload(client, headers=ADMIN_B2B, contents=small_workbook(department="13")).status_code == 201
    from config import Principal, Role, principals

    admin = principals()["demo-b2g-admin"]
    monkeypatch.setitem(principals(), "test-viewer", Principal("Viewer", Role.VIEWER, admin.tenant))
    assert upload(client, headers={"X-API-Key": "test-viewer"}).status_code == 403


if __name__ == "__main__":
    unittest.main()
