"""Generate the Excel template and the 5-territory mock dataset into ../data/.

Usage (from backend/):  python -m scripts.generate_samples

The values are FICTITIOUS, chosen only to produce contrasted scores for the demo.
"""

from __future__ import annotations

import csv
from pathlib import Path

from pipeline.catalog import ID_COLUMNS, INDICATORS
from pipeline.template import build_workbook

OUT = Path(__file__).resolve().parents[2] / "data"

SAMPLE_ROWS = [
    {"territory_code": "75", "territory_name": "Paris", "period": 2024,
     "pa_active_adults_pct": 52, "pa_sport_licences_per100": 17, "pa_sedentary_hours": 7.8,
     "mob_active_commute_pct": 36, "mob_car_commute_pct": 11, "mob_daily_steps": 8900,
     "env_pm25_ugm3": 11.2, "env_no2_ugm3": 31, "env_green_space_pct": 9.5,
     "nut_fruit_veg_pct": 46, "nut_fastfood_per10k": 11.5,
     "clin_diabetes_pct": 4.6, "clin_cardio_pct": 6.1, "clin_obesity_pct": 10.4, "clin_respiratory_pct": 3.9},
    {"territory_code": "69", "territory_name": "Rhône", "period": 2024,
     "pa_active_adults_pct": 49, "pa_sport_licences_per100": 23, "pa_sedentary_hours": 6.9,
     "mob_active_commute_pct": 18, "mob_car_commute_pct": 52, "mob_daily_steps": 7400,
     "env_pm25_ugm3": 10.1, "env_no2_ugm3": 24, "env_green_space_pct": 21,
     "nut_fruit_veg_pct": 42, "nut_fastfood_per10k": 7.9,
     "clin_diabetes_pct": 5.3, "clin_cardio_pct": 7.4, "clin_obesity_pct": 13.2, "clin_respiratory_pct": 4.4},
    {"territory_code": "59", "territory_name": "Nord", "period": 2024,
     "pa_active_adults_pct": 34, "pa_sport_licences_per100": 19, "pa_sedentary_hours": 8.1,
     "mob_active_commute_pct": 9, "mob_car_commute_pct": 74, "mob_daily_steps": 5600,
     "env_pm25_ugm3": 11.9, "env_no2_ugm3": 22, "env_green_space_pct": 8,
     "nut_fruit_veg_pct": 29, "nut_fastfood_per10k": 9.8,
     "clin_diabetes_pct": 7.9, "clin_cardio_pct": 10.6, "clin_obesity_pct": 22.0, "clin_respiratory_pct": 6.8},
    {"territory_code": "13", "territory_name": "Bouches-du-Rhône", "period": 2024,
     "pa_active_adults_pct": 44, "pa_sport_licences_per100": 21, "pa_sedentary_hours": 7.0,
     "mob_active_commute_pct": 12, "mob_car_commute_pct": 66, "mob_daily_steps": 6800,
     "env_pm25_ugm3": 12.8, "env_no2_ugm3": 27, "env_green_space_pct": 24,
     "nut_fruit_veg_pct": 40, "nut_fastfood_per10k": 9.1,
     "clin_diabetes_pct": 6.2, "clin_cardio_pct": 8.3, "clin_obesity_pct": 15.6, "clin_respiratory_pct": 5.1},
    {"territory_code": "23", "territory_name": "Creuse", "period": 2024,
     "pa_active_adults_pct": 58, "pa_sport_licences_per100": 27, "pa_sedentary_hours": 5.2,
     "mob_active_commute_pct": 7, "mob_car_commute_pct": 84, "mob_daily_steps": 7900,
     "env_pm25_ugm3": 6.1, "env_no2_ugm3": 9, "env_green_space_pct": 37,
     "nut_fruit_veg_pct": 51, "nut_fastfood_per10k": 3.1,
     "clin_diabetes_pct": 6.9, "clin_cardio_pct": 11.4, "clin_obesity_pct": 17.8, "clin_respiratory_pct": 4.9},
]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "wellness_template.xlsx").write_bytes(build_workbook())
    # Sample with territory codes stored as text so "01"-style codes survive Excel.
    (OUT / "sample_5_territoires.xlsx").write_bytes(build_workbook(SAMPLE_ROWS))
    headers = [*ID_COLUMNS, *INDICATORS]
    with (OUT / "sample_5_territoires.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=headers, delimiter=";")
        w.writeheader()
        w.writerows(SAMPLE_ROWS)
    print(f"Fichiers générés dans {OUT}")


if __name__ == "__main__":
    main()
