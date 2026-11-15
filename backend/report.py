"""Report of a commune: everything the platform knows about it, in one structure.

Used by the « Rapport » page, its Markdown export and the assistant (as the factual context of the LLM).
Sources: published scores (WP25 pipeline), commune domains (food score, walking, cycling, sport, GPs),
department health data (prevention, screening, poverty), Assurance Maladie pathologies, team evidence base.
"""

from __future__ import annotations

import statistics
from typing import Any

from sqlalchemy.orm import Session

import commune_domains
import determinants
import diseases
import ml_tree
from config import Principal, departements
from pipeline.catalog import DIMENSIONS
from routers.analytics import build_overview, parse_weights

BAND_LABEL = {"best": "Best", "middle": "Middle", "bad": "Bad"}
STATUS_LABEL = {"favorable": "favorable", "defavorable": "défavorable", "moyen": "dans la moyenne", "nc": "non mesuré localement"}


class NotTracked(LookupError):
    pass


def _commune_row(code: str) -> dict[str, Any] | None:
    try:
        data = commune_domains.load()
    except ml_tree.DatasetMissing:
        return None
    cols = data["columns"]
    row = next((r for r in data["rows"] if r[cols.index("code")] == code), None)
    return dict(zip(cols, row, strict=True)) if row else None


MEAN_KEYS = {"land_green_pct", "zone30_share", "pedestrian_share"}
SIZE_LABEL = {"rural": "communes rurales", "2k-20k": "agglomérations de 2 000 à 20 000 hab.", "20k-100k": "agglomérations de 20 000 à 100 000 hab.",
              "100k+": "agglomérations de plus de 100 000 hab.", "paris": "agglomération parisienne"}


def _commune_medians(size_class: str | None = None) -> dict[str, float]:
    """Median of each indicator over the communes (of the same urban-area size when given: a fairer reference)."""
    try:
        data = commune_domains.load()
    except ml_tree.DatasetMissing:
        return {}
    cols = data["columns"]
    rows = data["rows"]
    if size_class:
        same = [r for r in rows if r[cols.index("size_class")] == size_class]
        rows = same if len(same) >= 20 else rows
    out = {}
    for k in ("food_score", "fresh_10k", "fastfood_10k", "sport_10k", "gp_10k", "bike_share", "walk_score", "zone30_share", "pedestrian_share",
              "land_built_pct", "land_green_pct", "land_natural_pct"):
        i = cols.index(k)
        vals = [r[i] for r in rows if isinstance(r[i], (int, float))]
        if vals:
            # Mean for the indicators at 0 in most communes (green spaces, 30 km/h and pedestrian zones), median otherwise.
            out[k] = round(statistics.mean(vals) if k in MEAN_KEYS else statistics.median(vals), 2)
    return out


def _dept_row(dept: str) -> dict[str, Any] | None:
    try:
        rows = ml_tree.load_departements()
    except ml_tree.DatasetMissing:
        return None
    r = next((x for x in rows if x["code"] == dept), None)
    if r is None:
        return None
    return {**r["features"], **r["extras"], "prev_diabete": r["targets"].get("diabete"), "prevention_type": r["prevention_type"]}


def _dept_means() -> dict[str, float]:
    try:
        rows = ml_tree.load_departements()
    except ml_tree.DatasetMissing:
        return {}
    out = {}
    for k in ("icp", "prev_sub_depistage", "prev_sub_vaccination", "depistage_sein", "depistage_colorectal", "depistage_col", "poverty_rate"):
        vals = [x["extras"].get(k, x["features"].get(k)) for x in rows]
        vals = [v for v in vals if v is not None]
        if vals:
            out[k] = round(statistics.mean(vals), 1)
    return out


def build_report(db: Session, principal: Principal, code: str) -> dict[str, Any]:
    ov = build_overview(db, principal, None, parse_weights(None))
    t = next((x for x in ov.territories if x.code == code), None)
    if t is None:
        raise NotTracked(code)
    ranked = sorted(ov.territories, key=lambda x: -(x.composite.score or -1))
    dept = code[:3] if code.startswith("97") else code[:2]
    dims = [d for d in DIMENSIONS.values() if not d.is_outcome]
    means = {d.code: _mean([x.dimensions[d.code].score for x in ov.territories if d.code in x.dimensions]) for d in dims}
    dim_rows = [
        {"code": d.code, "label": d.label, "weight": ov.weights.get(d.code), "score": t.dimensions[d.code].score if d.code in t.dimensions else None,
         "average": means[d.code]}
        for d in dims
    ]
    commune = _commune_row(code) or {}
    dep = _dept_row(dept) or {}
    pop = t.context.population
    dis = diseases.city_diseases(dept, pop)

    report: dict[str, Any] = {
        "code": code,
        "name": t.name,
        "departement": {"code": dept, "name": departements().get(dept)},
        "type": t.context.territory_type,
        "population": pop,
        "density_km2": t.context.density_km2,
        "period": t.period,
        "score": {"value": t.composite.score, "band": t.composite.band, "rank": ranked.index(t) + 1, "of": len(ranked),
                  "average": ov.average},
        "dimensions": dim_rows,
        "food": {k: commune.get(k) for k in ("food_score", "food_type", "food_balance", "fresh_10k", "fastfood_10k", "restaurant_10k", "food_reliable")},
        "mobility": {k: commune.get(k) for k in ("walk_class", "walk_score", "walk_safety", "walk_comfort", "walk_services", "bike_share", "bike_parking_1000",
                                              "zone30_share", "pedestrian_share")},
        "land": {k: commune.get(k) for k in ("land_built_pct", "land_green_pct", "land_natural_pct", "land_agri_pct", "land_water_pct",
                                          "osm_green_pct", "osm_green_m2_hab")},
        "sport": {"equipment_10k": commune.get("sport_10k"), "practice_rate_size": commune.get("sport_rate_size"),
                  "size_class": commune.get("size_class")},
        "care": {"gp_10k": commune.get("gp_10k")},
        "prevention": {k: dep.get(k) for k in ("icp", "prevention_type", "prev_sub_depistage", "prev_sub_vaccination", "depistage_sein",
                                                "depistage_colorectal", "depistage_col", "vacc_grippe65", "vacc_hpv", "vacc_ror")},
        "social": {"poverty_rate_departement": dep.get("poverty_rate"), "pct_65plus_departement": dep.get("pct_65plus")},
        "references": {"communes_median": _commune_medians(commune.get("size_class")), "departements_mean": _dept_means(),
                       "communes_scope": SIZE_LABEL.get(commune.get("size_class") or "", "communes de 2 000 hab. et plus")},
        "diseases": dis,
        "evidence_sources": diseases.evidence().get("sources", {}),
        "injep": diseases.evidence().get("injep", []),
    }
    # Determinants: commune indicators vs the median of the communes, department ones vs the mean of the departments.
    values = {**commune, "prev_sub_depistage": dep.get("prev_sub_depistage"), "poverty_rate": dep.get("poverty_rate")}
    refs = {**report["references"]["communes_median"], "prev_sub_depistage": 50.0,
            "poverty_rate": report["references"]["departements_mean"].get("poverty_rate")}
    dets = determinants.assess(values, refs)
    report["determinants"] = dets
    report["disease_links"] = determinants.cross(dis["items"], dets)
    report["comparison"] = _comparison(ov, t, code)
    report["findings"] = _findings(report)
    return report


def _comparison(ov: Any, t: Any, code: str) -> dict[str, Any]:
    """The commune and the 3 most similar tracked cities, on key determinants and diseases (department level)."""
    contexts = {x.code: {"type": x.context.territory_type, "population": x.context.population, "density": x.context.density_km2}
                for x in ov.territories}
    codes = [code, *determinants.similar(code, contexts)]
    by_code = {x.code: x for x in ov.territories}
    cities = []
    for c in codes:
        x = by_code[c]
        row = _commune_row(c) or {}
        dept = c[:3] if c.startswith("97") else c[:2]
        dep = _dept_row(dept) or {}
        cities.append({
            "code": c, "name": x.name, "type": x.context.territory_type, "population": x.context.population, "self": c == code,
            "score": x.composite.score,
            # Every measured determinant indicator: commune data, or the department's for department-level ones.
            "values": {k: (row if scope == "commune" else dep).get(k)
                       for d in determinants.DETERMINANTS.values() for k, _l, _u, _d, scope in d["indicators"]},
            "diseases": {k: v for k, v in determinants.disease_prevalences(dept).items() if k in determinants.COMPARE_DISEASES},
        })
    return {
        "cities": cities,
        # Grouped by theme (= determinant) for the theme filter of the page.
        "indicators": [{"key": k, "label": label, "unit": unit, "direction": direction, "scope": scope, "theme": key, "theme_label": d["label"]}
                       for key, d in determinants.DETERMINANTS.items() for k, label, unit, direction, scope in d["indicators"]],
        "diseases": [{"key": k, "label": diseases.DISEASES[k][1]} for k in determinants.COMPARE_DISEASES],
        "method": "Villes suivies de même type, à population et densité les plus proches.",
    }


def _mean(vals: list[float | None]) -> float | None:
    v = [x for x in vals if x is not None]
    return round(statistics.mean(v), 2) if v else None


def _findings(r: dict[str, Any]) -> dict[str, list[str]]:
    """Plain-language strengths and weaknesses, computed from the report (no LLM)."""
    strong, weak = [], []
    for d in r["dimensions"]:
        if d["score"] is None or d["average"] is None:
            continue
        gap = d["score"] - d["average"]
        if gap >= 1:
            strong.append(f"{d['label']} : {_fmt(d['score'])}/10, au-dessus de la moyenne des villes ({_fmt(d['average'])})")
        elif gap <= -1:
            weak.append(f"{d['label']} : {_fmt(d['score'])}/10, sous la moyenne des villes ({_fmt(d['average'])})")
    med = r["references"]["communes_median"]
    f = r["food"]
    if f.get("food_score") is not None and med.get("food_score") is not None:
        txt = f"Alimentation : score {f['food_score']:.0f}/100 ({f.get('food_type') or 'n.c.'}), médiane des communes {med['food_score']:.0f}"
        (strong if f["food_score"] >= med["food_score"] + 10 else weak if f["food_score"] <= med["food_score"] - 5 else []).append(txt)
    p = r["prevention"]
    if p.get("prev_sub_depistage") is not None:
        txt = f"Dépistage des cancers : {p['prev_sub_depistage']:.0f}/100 (rang du département)"
        (strong if p["prev_sub_depistage"] >= 60 else weak if p["prev_sub_depistage"] <= 40 else []).append(txt)
    for d in r["diseases"]["items"]:
        if d["ratio_france"] and d["ratio_france"] >= 1.05:
            weak.append(f"{d['label']} : {_fmt(d['prev'], 2)} % dans le département, au-dessus de la France ({_fmt(d['prev_france'], 2)} %)")
        if d["trend_pts"] >= 0.5:
            weak.append(f"{d['label']} : +{_fmt(d['trend_pts'], 2)} pt depuis {d['trend_from_year']} dans le département")
    return {"strengths": strong, "weaknesses": weak}


def _fmt(v: Any, digits: int = 1, unit: str = "") -> str:
    if v is None:
        return "n.c."
    if isinstance(v, float):
        v = f"{v:.{digits}f}".replace(".", ",")
    return f"{v}{unit}"


def to_markdown(r: dict[str, Any]) -> str:
    """Readable export of the report (also the context given to the assistant)."""
    s, f, m, p = r["score"], r["food"], r["mobility"], r["prevention"]
    med, dmean = r["references"]["communes_median"], r["references"]["departements_mean"]
    lines = [
        f"# Rapport santé — {r['name']}",
        "",
        f"Département : {r['departement']['name']} ({r['departement']['code']}) · type : {r['type'] or 'n.c.'} · "
        f"population : {_fmt(r['population'], 0)} hab. · données {r['period']}",
        "",
        "## Score global",
        f"- Score : {_fmt(s['value'])}/10 (niveau {BAND_LABEL.get(s['band'] or '', 'n.c.')}), rang {s['rank']} sur {s['of']} villes suivies, "
        f"moyenne des villes {_fmt(s['average'])}",
    ]
    for d in r["dimensions"]:
        lines.append(f"- {d['label']} (poids {_fmt(d['weight'], 0)}) : {_fmt(d['score'])}/10 · moyenne des villes {_fmt(d['average'])}")
    lines += ["", "## Constats", "Points forts :"]
    lines += [f"- {x}" for x in r["findings"]["strengths"]] or ["- aucun point nettement au-dessus de la moyenne"]
    lines += ["Points à améliorer :"]
    lines += [f"- {x}" for x in r["findings"]["weaknesses"]] or ["- aucun point nettement sous la moyenne"]
    lines += ["", f"## Maladies chroniques (département, {r['diseases']['source']})"]
    for d in r["diseases"]["items"]:
        lines.append(
            f"- {d['label']} : {_fmt(d['prev'], 2)} % en {d['year']} (France {_fmt(d['prev_france'], 2)} %), "
            f"{'+' if d['trend_pts'] >= 0 else ''}{_fmt(d['trend_pts'], 2)} pt depuis {d['trend_from_year']}, "
            f"environ {_fmt(d['people_commune_est'], 0)} personnes dans la commune (estimation)"
        )
    lines += [
        "", "## Alimentation (commune)",
        f"- Score alimentation : {_fmt(f['food_score'], 0)}/100 ({f['food_type'] or 'n.c.'}) · médiane des communes {_fmt(med.get('food_score'), 0)}",
        f"- Commerces favorables : {_fmt(f['food_balance'])} % des commerces alimentaires · produits frais : {_fmt(f['fresh_10k'])} / 10 000 hab. "
        f"(médiane {_fmt(med.get('fresh_10k'))}) · fast-foods : {_fmt(f['fastfood_10k'])} / 10 000 hab. (médiane {_fmt(med.get('fastfood_10k'))})",
        "", "## Activité physique, marche et vélo (commune)",
        f"- Équipements sportifs : {_fmt(r['sport']['equipment_10k'])} / 10 000 hab. (médiane {_fmt(med.get('sport_10k'))}) · "
        f"pratique sportive des agglomérations de même taille : {_fmt(r['sport']['practice_rate_size'], 0, ' %')} (INJEP 2023)",
        f"- Marchabilité : {('classe ' + m['walk_class'] + ', ' + _fmt(m['walk_score']) + '/20') if m.get('walk_class') else 'non évaluée'}"
        f" · voirie cyclable : {_fmt(m['bike_share'], 1, ' %')} (médiane {_fmt(med.get('bike_share'), 1, ' %')}) · "
        f"stationnement vélo : {_fmt(m['bike_parking_1000'])} / 1 000 hab.",
        f"- Voirie en zone 30 : {_fmt(m.get('zone30_share'), 1, ' %')} (médiane {_fmt(med.get('zone30_share'), 1, ' %')}) · "
        f"voirie en zone piétonne : {_fmt(m.get('pedestrian_share'), 1, ' %')} (médiane {_fmt(med.get('pedestrian_share'), 1, ' %')})",
        "", "## Cadre de vie : occupation du sol (commune, Corine Land Cover 2018)",
        f"- Sols artificialisés (bâti, zones d'activité, routes) : {_fmt(r['land']['land_built_pct'], 1, ' %')} de la surface "
        f"(médiane des {r['references']['communes_scope']} {_fmt(med.get('land_built_pct'), 1, ' %')})",
        f"- Espaces verts urbains (parcs, terrains de sport et de loisirs) : {_fmt(r['land']['land_green_pct'], 1, ' %')} "
        f"(médiane {_fmt(med.get('land_green_pct'), 1, ' %')}) · forêts et milieux naturels : {_fmt(r['land']['land_natural_pct'], 1, ' %')} · "
        f"terres agricoles : {_fmt(r['land']['land_agri_pct'], 1, ' %')} · eau et zones humides : {_fmt(r['land']['land_water_pct'], 1, ' %')}",
        *([f"- Espaces verts et naturels selon OpenStreetMap (parcs, jardins publics, bois, prairies, jardins familiaux, y compris petits) : "
           f"{_fmt(r['land']['osm_green_pct'], 1, ' %')} de la surface, soit {_fmt(r['land']['osm_green_m2_hab'], 0)} m² par habitant"]
          if r["land"].get("osm_green_pct") is not None else []),
        "- Corine Land Cover ne cartographie que les zones de 25 ha ou plus : petits parcs et jardins non comptés.",
        "", "## Prévention et accès aux soins",
        f"- Indice de comportement préventif du département : {_fmt(p['icp'], 0)}/100 ({p['prevention_type'] or 'n.c.'})",
        f"- Dépistage des cancers : {_fmt(p['prev_sub_depistage'], 0)}/100 · sein {_fmt(p['depistage_sein'], 1, ' %')} (moyenne {_fmt(dmean.get('depistage_sein'), 1, ' %')}), "
        f"colorectal {_fmt(p['depistage_colorectal'], 1, ' %')} (moyenne {_fmt(dmean.get('depistage_colorectal'), 1, ' %')}), "
        f"col de l'utérus {_fmt(p['depistage_col'], 1, ' %')} (moyenne {_fmt(dmean.get('depistage_col'), 1, ' %')})",
        f"- Vaccination : {_fmt(p['prev_sub_vaccination'], 0)}/100 · grippe 65 ans + {_fmt(p['vacc_grippe65'], 1, ' %')}, HPV {_fmt(p['vacc_hpv'], 1, ' %')}, ROR {_fmt(p['vacc_ror'], 1, ' %')}",
        f"- Cabinets de médecine générale : {_fmt(r['care']['gp_10k'])} / 10 000 hab. (médiane {_fmt(med.get('gp_10k'))})",
        f"- Contexte : taux de pauvreté du département {_fmt(r['social']['poverty_rate_departement'], 1, ' %')}, "
        f"65 ans et plus {_fmt(r['social']['pct_65plus_departement'], 1, ' %')}",
        "", f"## Déterminants de santé (commune face à la médiane des {r['references']['communes_scope']})",
        *[f"- {d['label']} : {STATUS_LABEL[d['status']]}"
          + (" (" + " ; ".join(f"{i['label']} {_fmt(i['value'])}{(' ' + i['unit']) if i['unit'] else ''} vs {_fmt(i['reference'])}"
                                 for i in d["indicators"] if i["value"] is not None) + ")" if d["indicators"] else "")
          for d in r["determinants"]],
        "", "## Maladies et déterminants liés (base de preuves de l'équipe)",
        *[f"- {x['label']} : " + (" ; ".join(f"{lk['label']} (preuve {lk['level']}, {STATUS_LABEL[lk['status']]})" for lk in x["links"]) or "aucun lien dans la base")
          for x in r["disease_links"]],
        "", f"## Comparaison avec des villes semblables ({r['comparison']['method']})",
        *[f"- {c['name']}{' (la commune)' if c['self'] else ''} : score {_fmt(c['score'])}/10 · "
          + " · ".join(f"{i['label']} {_fmt(c['values'].get(i['key']))}{(' ' + i['unit']) if i['unit'] else ''}" for i in r["comparison"]["indicators"])
          + (" · " + " · ".join(f"{dz['label']} {_fmt(c['diseases'].get(dz['key']), 2)} %" for dz in r["comparison"]["diseases"] if c['diseases'].get(dz['key']) is not None)
             if c["diseases"] else "")
          for c in r["comparison"]["cities"]],
        "", "## Sources",
        "Scores WP25 (pipeline de la plateforme), Assurance Maladie (data.ameli.fr), Santé publique France (Odissé), INSEE, "
        "SIRENE et BPE 2025 (score alimentation), Vélo & Territoires 2024, Baromètre des villes marchables 2023, "
        "Recensement des équipements sportifs, INJEP 2023, Corine Land Cover 2018 (SDES).",
    ]
    return "\n".join(lines)
