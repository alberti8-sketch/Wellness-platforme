"use client";

import { Download, FileSpreadsheet, Keyboard, Plus, Send, Trash2, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { useSession } from "@/components/session";
import { Button, Card, ErrorBox, Spinner, cx } from "@/components/ui";
import { ValidationPreview } from "@/components/validation-preview";
import { ApiError, api, download } from "@/lib/api";
import { useDepartements } from "@/lib/geo";
import type { DatasetSummary, ValidationReport } from "@/lib/types";

type Tab = "excel" | "manual";
type ManualRow = Record<string, string>;

interface Meta {
  submitted_by: string;
  organization: string;
  description: string;
  attested: boolean;
}

export default function CollectPage() {
  const { me, catalog, ready, apiKey } = useSession();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("excel");
  const [meta, setMeta] = useState<Meta>({ submitted_by: "", organization: "", description: "", attested: false });
  const [file, setFile] = useState<File | null>(null);
  const [manualRows, setManualRows] = useState<ManualRow[]>([]);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [validating, setValidating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset everything when switching account (tenant isolation also applies to the UI state).
  useEffect(() => {
    setFile(null);
    setManualRows([]);
    setReport(null);
    setError(null);
  }, [apiKey]);

  useEffect(() => {
    if (me) setMeta((m) => ({ ...m, organization: m.organization || me.tenant.name, submitted_by: m.submitted_by || me.name }));
  }, [me]);

  const previewFile = useCallback(async (f: File) => {
    setFile(f);
    setReport(null);
    setError(null);
    if (!f.name.toLowerCase().endsWith(".xlsx")) {
      setError("Seuls les fichiers .xlsx sont acceptés.");
      return;
    }
    setValidating(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      setReport(await api.post<ValidationReport>("/api/ingest/preview", fd));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setValidating(false);
    }
  }, []);

  const previewManual = useCallback(async (rows: ManualRow[]) => {
    if (rows.length === 0) {
      setReport(null);
      return;
    }
    setValidating(true);
    setError(null);
    try {
      setReport(await api.post<ValidationReport>("/api/ingest/preview-manual", { rows }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setValidating(false);
    }
  }, []);

  const metaValid = meta.submitted_by.trim().length >= 2 && meta.organization.trim().length >= 2 && meta.attested;
  const canSubmit = metaValid && !!report && report.error_count === 0 && report.rows.length > 0 && !validating;

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      let ds: DatasetSummary;
      if (tab === "excel" && file) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("submitted_by", meta.submitted_by);
        fd.append("organization", meta.organization);
        if (meta.description) fd.append("description", meta.description);
        ds = await api.post<DatasetSummary>("/api/ingest/upload", fd);
      } else {
        ds = await api.post<DatasetSummary>("/api/ingest/manual", {
          submitted_by: meta.submitted_by,
          organization: meta.organization,
          description: meta.description || null,
          rows: manualRows,
        });
      }
      router.push(`/processing?dataset=${ds.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 422 && e.detail && typeof e.detail === "object" && "report" in e.detail) {
        setReport((e.detail as { report: ValidationReport }).report);
      }
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready || !me || !catalog) return <Spinner />;
  const isB2G = me.tenant.stakeholder_type === "B2G";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Portail de collecte</h1>
        <p className="text-sm text-ink-2">
          Déposez des indicateurs <strong>agrégés par territoire</strong>. Les données sont validées avant envoi, puis traitées par le pipeline et soumises à validation d'un administrateur.
        </p>
      </div>

      {me.role === "viewer" && <ErrorBox>Votre rôle ne permet pas de déposer des données.</ErrorBox>}

      <Card title={`1. Informations sur le dépôt · ${isB2G ? "Acteur public (B2G)" : "Entreprise (B2B)"}`}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={isB2G ? "Agent déclarant" : "Responsable QVT / bien-être"}>
            <input className="input" value={meta.submitted_by} onChange={(e) => setMeta({ ...meta, submitted_by: e.target.value })} />
          </Field>
          <Field label={isB2G ? "Institution (collectivité, ARS, ORS…)" : "Entreprise / établissement"}>
            <input className="input" value={meta.organization} onChange={(e) => setMeta({ ...meta, organization: e.target.value })} />
          </Field>
          <Field label="Description / sources des données" className="md:col-span-2">
            <textarea
              className="input min-h-[70px]"
              placeholder={isB2G ? "Ex. : extraction Data pathologies 2024 + Geod'air" : "Ex. : agrégats anonymisés du programme bien-être 2024"}
              value={meta.description}
              onChange={(e) => setMeta({ ...meta, description: e.target.value })}
            />
          </Field>
          {me.tenant.allowed_territories && (
            <p className="text-xs text-ink-2 md:col-span-2">
              Périmètre autorisé pour ce compte : <strong>{me.tenant.allowed_territories.join(", ")}</strong>. Toute ligne hors périmètre est rejetée.
            </p>
          )}
          <label className="flex items-start gap-2 text-sm text-ink-2 md:col-span-2">
            <input type="checkbox" className="mt-1" checked={meta.attested} onChange={(e) => setMeta({ ...meta, attested: e.target.checked })} />
            Je certifie que ces données sont agrégées à l'échelle du territoire, ne contiennent aucune donnée individuelle ou identifiante, et que je suis habilité·e à les transmettre.
          </label>
        </div>
      </Card>

      <Card
        title="2. Données"
        actions={
          <div className="flex rounded-lg border border-axis p-0.5 text-sm">
            {(
              [
                ["excel", "Import Excel", FileSpreadsheet],
                ["manual", "Saisie manuelle", Keyboard],
              ] as const
            ).map(([k, l, Icon]) => (
              <button
                key={k}
                onClick={() => {
                  setTab(k);
                  setReport(null);
                  setError(null);
                }}
                className={cx("inline-flex items-center gap-1.5 rounded-md px-3 py-1", tab === k ? "bg-brand text-white" : "text-ink-2 hover:bg-plane")}
              >
                <Icon className="h-4 w-4" /> {l}
              </button>
            ))}
          </div>
        }
      >
        {tab === "excel" ? (
          <ExcelDrop file={file} onFile={previewFile} />
        ) : (
          <ManualEntry
            rows={manualRows}
            allowed={me.tenant.allowed_territories}
            onChange={(rows) => {
              setManualRows(rows);
              void previewManual(rows);
            }}
          />
        )}
      </Card>

      <Card title="3. Contrôle avant envoi">
        {error && <div className="mb-4"><ErrorBox>{error}</ErrorBox></div>}
        {validating ? (
          <Spinner label="Validation du schéma…" />
        ) : report ? (
          <ValidationPreview report={report} indicators={catalog.indicators} />
        ) : (
          <p className="text-sm text-ink-muted">Le contrôle s'affichera ici dès qu'un fichier ou une ligne sera ajouté.</p>
        )}
        <div className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-hairline pt-4">
          {!metaValid && <span className="text-xs text-ink-muted">Complétez l'étape 1 et cochez l'attestation.</span>}
          {report && report.error_count > 0 && <span className="text-xs text-[#a12626]">Corrigez les erreurs bloquantes avant l'envoi.</span>}
          <Button icon={Send} onClick={submit} disabled={!canSubmit || me.role === "viewer"} loading={submitting}>
            Soumettre au pipeline
          </Button>
        </div>
      </Card>

    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cx("block space-y-1 text-sm", className)}>
      <span className="font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}

function ExcelDrop({ file, onFile }: { file: File | null; onFile: (f: File) => void }) {
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };
  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        className={cx(
          "flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition",
          drag ? "border-brand bg-brand-50" : "border-axis hover:border-brand hover:bg-plane",
        )}
      >
        <UploadCloud className="h-9 w-9 text-brand" />
        <p className="text-sm font-medium text-ink">{file ? file.name : "Glissez-déposez votre fichier .xlsx ici"}</p>
        <p className="text-xs text-ink-2">ou cliquez pour parcourir · 5 Mo max · feuille « data », une ligne par territoire</p>
        <input
          ref={input}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
      </div>
      <Button variant="secondary" icon={Download} onClick={() => download("/api/ingest/template", "wellness_template.xlsx")}>
        Télécharger le modèle Excel
      </Button>
    </div>
  );
}

function ManualEntry({ rows, allowed, onChange }: { rows: ManualRow[]; allowed: string[] | null; onChange: (rows: ManualRow[]) => void }) {
  const { catalog } = useSession();
  const { list } = useDepartements();
  const depts = allowed ? list.filter((d) => allowed.includes(d.code)) : list;
  const [draft, setDraft] = useState<ManualRow>({ period: String(new Date().getFullYear() - 1) });
  if (!catalog) return null;

  const setCode = (code: string) =>
    setDraft({ ...draft, territory_code: code, territory_name: depts.find((d) => d.code === code)?.nom ?? draft.territory_name ?? "" });
  const add = () => {
    onChange([...rows, Object.fromEntries(Object.entries(draft).filter(([, v]) => v !== ""))]);
    setDraft({ period: draft.period });
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-4">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Code INSEE</span>
          <input
            className="input"
            list="territory-codes"
            placeholder="ex. 35238 ou 35"
            value={draft.territory_code ?? ""}
            onChange={(e) => setCode(e.target.value.trim().toUpperCase())}
          />
          <datalist id="territory-codes">
            {depts.map((d) => (
              <option key={d.code} value={d.code}>
                {d.nom}
              </option>
            ))}
          </datalist>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Nom</span>
          <input className="input" placeholder="ex. Rennes" value={draft.territory_name ?? ""} onChange={(e) => setDraft({ ...draft, territory_name: e.target.value })} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Typologie</span>
          <select className="input" value={draft.territory_type ?? ""} onChange={(e) => setDraft({ ...draft, territory_type: e.target.value })}>
            <option value="">—</option>
            {catalog.territory_types.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Année</span>
          <input className="input" inputMode="numeric" value={draft.period ?? ""} onChange={(e) => setDraft({ ...draft, period: e.target.value })} />
        </label>
      </div>

      <fieldset className="rounded-lg border border-hairline p-3">
        <legend className="px-1 text-sm font-medium text-ink">
          Contexte <span className="text-xs font-normal text-ink-muted">(affiché, non noté)</span>
        </legend>
        <div className="grid gap-3 md:grid-cols-3">
          {(["population", "density_km2", "source_global_score"] as const).map((k) => (
            <label key={k} className="space-y-1 text-xs">
              <span className="block text-ink-2">{catalog.context_columns[k]}</span>
              <input className="input" inputMode="decimal" value={draft[k] ?? ""} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
            </label>
          ))}
        </div>
      </fieldset>

      {catalog.dimensions.map((dim) => (
        <fieldset key={dim.code} className="rounded-lg border border-hairline p-3">
          <legend className="px-1 text-sm font-medium text-ink">
            {dim.label} <span className="text-xs font-normal text-ink-muted">({dim.code})</span>
          </legend>
          <div className="grid gap-3 md:grid-cols-3">
            {catalog.indicators
              .filter((i) => i.dimension === dim.code)
              .map((i) => (
                <label key={i.code} className="space-y-1 text-xs">
                  <span className="block text-ink-2">
                    {i.label} <span className="text-ink-muted">({i.unit}, {i.direction === "higher_is_better" ? "↑ mieux" : "↓ mieux"})</span>
                  </span>
                  <input
                    className="input"
                    inputMode="decimal"
                    placeholder={`${i.ref_min} – ${i.ref_max}`}
                    value={draft[i.code] ?? ""}
                    onChange={(e) => setDraft({ ...draft, [i.code]: e.target.value })}
                  />
                </label>
              ))}
          </div>
        </fieldset>
      ))}

      <div className="flex justify-end">
        <Button icon={Plus} variant="secondary" onClick={add} disabled={!draft.territory_code}>
          Ajouter la ligne
        </Button>
      </div>

      {rows.length > 0 && (
        <ul className="divide-y divide-hairline rounded-lg border border-hairline text-sm">
          {rows.map((r, i) => (
            <li key={i} className="flex items-center justify-between px-3 py-2">
              <span>
                <strong>{r.territory_code}</strong> {r.territory_name} · {r.period} ·{" "}
                <span className="text-ink-2">{Object.keys(r).filter((k) => catalog.indicators.some((x) => x.code === k)).length} indicateur(s)</span>
              </span>
              <Button variant="ghost" icon={Trash2} aria-label="Supprimer" onClick={() => onChange(rows.filter((_, j) => j !== i))} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
