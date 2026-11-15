"""Extract the evidence base used by the report and the assistant into data/evidence/preuves.json (versioned).

Sources (raw files in data/sources/, not versioned):
  * Maladies_chroniques_habitudes_de_vie_prototype2.xlsx, sheet « Liens maladies-habitudes » (team synthesis of
    meta-analyses: disease, habit, association, level of evidence);
  * INJEP / CRÉDOC, Baromètre national des pratiques sportives 2023 (key figures, typed from the report).
Run from backend/:  python -m scripts.build_evidence
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
WORKBOOK = ROOT / "data" / "sources" / "Maladies_chroniques_habitudes_de_vie_prototype2.xlsx"
OUT = ROOT / "data" / "evidence" / "preuves.json"

INJEP = [
    "Taux de pratique sportive en 2023 selon la taille d'agglomération : communes rurales 65 %, 2 000 à 20 000 hab. 66 %, "
    "20 000 à 100 000 hab. 70 %, plus de 100 000 hab. 72 %, agglomération parisienne 79 % (INJEP / CRÉDOC, p. 33).",
    "Entre 2022 et 2023, la pratique sportive se tasse partout en France sauf dans l'agglomération parisienne (INJEP 2023).",
]


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    df = pd.read_excel(WORKBOOK, sheet_name="Liens maladies-habitudes", header=None)
    links = []
    for row in df.iloc[4:].itertuples(index=False):
        disease, habit, association, level = row[1], row[2], row[3], row[4]
        if not isinstance(disease, str) or not isinstance(habit, str):
            continue
        links.append({"maladie": disease.strip(), "habitude": habit.strip(), "association": str(association).strip(),
                      "niveau": str(level).strip()})
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "sources": {
            "liens": "Classeur d'équipe « Maladies chroniques et habitudes de vie » (prototype 2), feuille Liens maladies-habitudes : "
                     "synthèse de méta-analyses de cohortes prospectives",
            "injep": "INJEP / CRÉDOC, Baromètre national des pratiques sportives 2023",
        },
        "liens": links,
        "injep": INJEP,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(links)} liens maladies-habitudes → {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
