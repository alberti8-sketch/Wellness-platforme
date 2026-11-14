import json
from pathlib import Path
import re
import unittest

import openpyxl


ROOT = Path(__file__).resolve().parents[2]


class TerritorySourceTests(unittest.TestCase):
    def test_exact_eight_city_records_and_source_scores(self):
        territories = json.loads(
            (ROOT / "frontend/data/wp25-territories.json").read_text()
        )
        source = ROOT / "context/WP25 .xlsx"
        if not source.exists():
            self.skipTest("Original WP25 workbook is no longer present in context")
        workbook = openpyxl.load_workbook(source, read_only=True, data_only=True)
        self.addCleanup(workbook.close)
        rows = list(workbook["CITY"].iter_rows(
            min_row=7, max_row=14, min_col=2, max_col=6, values_only=True
        ))
        self.assertEqual(len(territories), 8)
        self.assertEqual(len({city["id"] for city in territories}), 8)
        for territory, row in zip(territories, rows):
            with self.subTest(city=territory["city"]):
                self.assertEqual(territory["source_city"], row[0])
                postal_match = re.search(r"(\d[\d ]*)$", row[0])
                self.assertIsNotNone(postal_match)
                self.assertEqual(
                    territory["source_postal_code"],
                    postal_match.group(1).replace(" ", ""),
                )
                self.assertEqual(
                    [territory[key] for key in
                     ("sport", "environment", "health_care", "global_score")],
                    list(row[1:]),
                )
                self.assertTrue(43 <= territory["latitude"] <= 49)
                self.assertTrue(-5 <= territory["longitude"] <= 8)


if __name__ == "__main__":
    unittest.main()
