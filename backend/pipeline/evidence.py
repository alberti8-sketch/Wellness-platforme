"""Scientific basis of each dimension weight.

Source: team workbook « Maladies_chroniques_habitudes_de_vie_prototype2-2.xlsx »
(Drive HACKATHON 13/11/26 / DATA SCORING), sheets « Liens maladies-habitudes » (relative
risks + level of evidence) and « Sources » (references).

Rule: a dimension is marked `evidence` only when the workbook documents a quantified
association for it. Otherwise it is marked `expert` (weight taken from PONDERATION 3,
still to be justified) — nothing is invented to fill the gap.

Mapping a sheet row to a URL is done only when the « Sources » sheet explicitly describes
that finding; other rows cite the sheet itself (`url=None`).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

WORKBOOK = "Maladies_chroniques_habitudes_de_vie_prototype2-2.xlsx — feuille « Liens maladies-habitudes »"

Level = Literal["Fort", "Moyen", "Modéré"]
Basis = Literal["evidence", "expert", "outcome"]


@dataclass(frozen=True)
class Source:
    title: str
    url: str
    documents: str


@dataclass(frozen=True)
class Evidence:
    disease: str
    factor: str
    effect: str
    level: Level
    source: Source | None = None  # None = documented in the workbook sheet without a dedicated reference


@dataclass(frozen=True)
class WeightBasis:
    basis: Basis
    rationale: str
    evidence: tuple[Evidence, ...] = ()
    references: tuple[Source, ...] = ()  # framing data / data sources (not effect sizes)


# --- References (sheet « Sources ») -------------------------------------------------------
S_CUMUL = Source("Springer — Dynamic Interplay of Healthy Lifestyle Behaviors (2022)",
                 "https://link.springer.com/article/10.1007/s11883-022-01068-w",
                 "Cumul d'habitudes saines : réduction ≈ 66 % de la mortalité toutes causes (1,09 M participants)")
S_SEDENTARY = Source("PMC — Sedentary behaviour and risk (méta-analyse dose-réponse)",
                     "https://pmc.ncbi.nlm.nih.gov/articles/PMC6133005/",
                     "Sédentarité : RR 1,04/h au-delà de 8 h/j (mortalité CV), ajusté sur l'AP")
S_INACTIVITY = Source("PMC — Effets de l'inactivité physique sur les facteurs de risque",
                      "https://pmc.ncbi.nlm.nih.gov/articles/PMC11385465/",
                      "PA : -6 % de PA par 600 MET-min/sem ; -14-28 % de risque diabète")
S_CKD = Source("PMC — Modifiable Lifestyle Factors for Primary Prevention of CKD",
               "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7894668/",
               "Maladie rénale chronique : légumes OR 0,79, potassium 0,78, AP 0,91, sel")
S_SPF_PA = Source("Santé publique France — Synthèse Activité physique et sédentarité 2024",
                  "https://www.santepubliquefrance.fr/content/download/661132/document_file/772669_spf00005577.pdf",
                  "Niveaux d'AP et sédentarité de la population française (données de cadrage)")
S_BEH_PA = Source("BEH — Activité physique et sédentarité dans la population française",
                  "https://beh.santepubliquefrance.fr/beh/2020/15/2020_15_1.html",
                  "Méthodes de recueil IPAQ / RPAQ utilisées en France")
S_ATMO = Source("Atmo France — indice ATMO", "https://www.atmo-france.org/article/france",
                "Indice quotidien de qualité de l'air par commune/EPCI (PM10, PM2,5, NO2, O3, SO2)")
S_FDEP = Source("Odisse Santé publique France — FDep communal",
                "https://odisse.santepubliquefrance.fr/explore/assets/indice-de-defavorisation-sociale-fdep-par-commune/",
                "Indice écologique de défavorisation sociale par commune (extension v3)")
S_MRMI = Source("PubMed — Constantinou et al., J Clin Epidemiol 2018", "https://pubmed.ncbi.nlm.nih.gov/30016643/",
                "Développement et validation des indices MRMI et ERMI (population, performance)")
S_BAROMETRE = Source("Baromètre Santé publique France 2024",
                     "https://www.santepubliquefrance.fr/sites/default/files/cadic_files/documents/spf00006379_0.pdf",
                     "Prévalences déclarées : HTA ≈ 22 % des adultes, diabète ≈ 6-10 % selon région")
S_HTA = Source("BEH — Panorama hypertension artérielle en France",
               "https://www.santepubliquefrance.fr/content/download/565984/document_file/623635_spf00004635.pdf",
               "HTA : maladie chronique la plus fréquente en France, facteur de risque CV, rénal et démence")
S_ESTEBAN = Source("Santé publique France — Esteban (étude nationale)",
                   "https://www.santepubliquefrance.fr/etudes-et-enquetes/esteban",
                   "Étude nationale nutrition, AP, sédentarité, prévalences maladies chroniques")

# --- Basis of each dimension weight --------------------------------------------------------
WEIGHT_BASIS: dict[str, WeightBasis] = {
    "SPORT": WeightBasis(
        "evidence",
        "Seule dimension documentée par des méta-analyses dans le classeur : l'activité physique réduit le risque "
        "de toutes les grandes maladies chroniques (niveau de preuve fort pour MCV, diabète T2, HTA, cancer "
        "colorectal) et la sédentarité l'augmente. Cohérent avec son poids élevé (30 %) et avec le poids x2 de "
        "l'activité physique dans le score individuel SMVR du même classeur.",
        evidence=(
            Evidence("Maladies cardiovasculaires (coronaropathie, AVC)", "Activité physique régulière",
                     "RR ≈ 0,70-0,75 (réduction du risque de 25-30 %) ; effet dose-réponse", "Fort"),
            Evidence("Diabète de type 2", "Activité physique régulière",
                     "Réduction du risque de 14-28 % chez les actifs vs inactifs", "Fort", S_INACTIVITY),
            Evidence("Hypertension artérielle", "Activité physique",
                     "Baisse de PA ≈ 6 % par tranche de 600 MET-min/sem ; ≈ 19 % (actifs vs sédentaires)", "Fort",
                     S_INACTIVITY),
            Evidence("Cancer colorectal", "Activité physique", "RR ≈ 0,80 (réduction ≈ 20 %)", "Fort"),
            Evidence("Maladies cardiovasculaires", "Sédentarité (> 8 h/j assis)",
                     "RR mortalité CV ≈ 1,04 par heure au-delà de 8 h/j, après ajustement sur l'AP", "Moyen",
                     S_SEDENTARY),
            Evidence("Dépression / anxiété", "Activité physique régulière",
                     "RR ≈ 0,78-0,83 (effet protecteur, cohérent dans les méta-analyses)", "Moyen"),
            Evidence("Déclin cognitif / démence", "Activité physique", "RR ≈ 0,80 (réduction ≈ 20 %)", "Moyen"),
            Evidence("Maladie rénale chronique", "Activité physique",
                     "RR ≈ 0,91 (les plus actifs vs les moins actifs)", "Modéré", S_CKD),
        ),
        references=(S_SPF_PA, S_BEH_PA),
    ),
    "ENV": WeightBasis(
        "expert",
        "Poids d'expert (PONDERATION 3, 25 %). Le classeur ne quantifie pas le lien pollution / environnement - "
        "maladies chroniques : il cite seulement l'indice ATMO comme source de données. À justifier par une "
        "méta-analyse (ex. PM2,5 et mortalité cardio-respiratoire).",
        references=(S_ATMO,),
    ),
    "HEALTH": WeightBasis(
        "expert",
        "Poids d'expert (PONDERATION 3, 30 %). Aucune association chiffrée dans le classeur. Les indices MRMI / "
        "ERMI (SNDS) cités servent à prioriser les publics selon la morbidité, pas à pondérer l'offre de soins.",
        references=(S_MRMI,),
    ),
    "SOCIAL": WeightBasis(
        "expert",
        "Poids d'expert (PONDERATION 3, 15 %). Le classeur ne chiffre pas l'effet de la précarité ; il propose "
        "l'indice de défavorisation FDep par commune comme extension v3.",
        references=(S_FDEP,),
    ),
    "CLIN": WeightBasis(
        "outcome",
        "Indicateur de résultat (poids 0) : sert à calibrer et valider les poids des autres dimensions, pas à "
        "les additionner. Les prévalences de référence françaises viennent des sources ci-dessous.",
        references=(S_BAROMETRE, S_HTA, S_ESTEBAN),
    ),
}

# Justification of the additive composite index itself.
COMPOSITE_BASIS = Evidence(
    "Mortalité toutes causes", "Cumul de 4-5 habitudes saines",
    "Réduction de la mortalité toutes causes ≈ 66 % vs 0 habitude saine (1,09 M participants)", "Fort", S_CUMUL,
)
