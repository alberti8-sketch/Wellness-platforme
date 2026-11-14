import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
import openpyxl
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import get_db
from app.department_health import parse_department_health
from app.models import Base
from app.routers.department_health import router


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


class DepartmentUploadTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.database_url = f"sqlite:///{Path(self.temp.name) / 'health.db'}"
        self.engine = create_engine(self.database_url, connect_args={"check_same_thread": False})
        self.addCleanup(self.engine.dispose)
        Base.metadata.create_all(self.engine)
        self.sessions = sessionmaker(bind=self.engine)
        app = FastAPI()
        app.include_router(router)

        def db_override():
            with self.sessions() as session:
                yield session

        app.dependency_overrides[get_db] = db_override
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def upload(self, tenant="tenant-a", contents=None, filename="future.xlsx"):
        return self.client.post(
            "/api/department-health/upload", data={"tenant_id": tenant},
            files={"file": (filename, contents if contents is not None else small_workbook())},
        )

    def test_upload_reload_and_tenant_scoped_reads(self):
        upload = self.upload(contents=SOURCE.read_bytes(), filename=SOURCE.name)
        self.assertEqual(upload.status_code, 201, upload.text)
        dataset_id = upload.json()["dataset_id"]
        response = self.client.get(f"/api/department-health/{dataset_id}", params={"tenant_id": "tenant-a"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["departments"]["74"]["diabete"]["women"], 16970)
        self.assertEqual(self.client.get(
            f"/api/department-health/{dataset_id}", params={"tenant_id": "tenant-b"}
        ).status_code, 404)
        self.assertEqual(self.client.get(
            "/api/department-health", params={"tenant_id": "tenant-b"}
        ).json(), {"datasets": []})
        # A fresh engine/session must still see the stored snapshot.
        self.engine.dispose()
        self.assertEqual(self.client.get(
            "/api/department-health", params={"tenant_id": "tenant-a"}
        ).json()["datasets"][0]["dataset_id"], dataset_id)

    def test_repeated_uploads_are_separate_snapshots_not_added_counts(self):
        first, second = self.upload(), self.upload()
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)
        self.assertNotEqual(first.json()["dataset_id"], second.json()["dataset_id"])
        response = self.client.get(
            f"/api/department-health/{second.json()['dataset_id']}", params={"tenant_id": "tenant-a"}
        )
        self.assertEqual(response.json()["departments"]["35"]["diabete"]["men"], 12)

    def test_invalid_uploads_do_not_persist(self):
        self.assertEqual(self.upload(contents=b"bad", filename="bad.xls").status_code, 422)
        self.assertEqual(self.upload(filename="bad.csv").status_code, 400)
        self.assertEqual(self.upload(tenant="   ").status_code, 422)
        self.assertEqual(self.upload(contents=small_workbook(department="75")).status_code, 422)
        with patch("app.routers.department_health.settings.max_upload_size", 10):
            self.assertEqual(self.upload().status_code, 413)
        self.assertEqual(self.client.get(
            "/api/department-health", params={"tenant_id": "tenant-a"}
        ).json(), {"datasets": []})


if __name__ == "__main__":
    unittest.main()
