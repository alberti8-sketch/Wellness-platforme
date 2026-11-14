"use client";

import {
  AlertCircle,
  AlertTriangle,
  ArrowUpDown,
  Check,
  CheckCircle2,
  Circle,
  Inbox,
  Loader2,
  PenLine,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
  X,
  XCircle,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "@/components/session";
import { Button, Card, Empty, ErrorBox, Spinner, StatusBadge, cx, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { BAND_META, FLAG_LABEL, STATUS_LABEL, fmt } from "@/lib/bands";
import type { Cell, DatasetDetail, DatasetSummary, Indicator } from "@/lib/types";

const RUNNING = new Set(["RECEIVED", "VALIDATED", "CLEANED", "NORMALIZED", "AGGREGATED"]);

export default function ProcessingPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ProcessingHub />
    </Suspense>
  );
}

function ProcessingHub() {
  const { ready, apiKey } = useSession();
  const params = useSearchParams();
  const router = useRouter();
  const selected = params.get("dataset");
  const [list, setList] = useState<DatasetSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(() => {
    api
      .get<DatasetSummary[]>("/api/datasets")
      .then((l) => {
        setList(l);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!ready) return;
    loadList();
    const t = setInterval(loadList, 5000);
    return () => clearInterval(t);
  }, [ready, apiKey, loadList]);

  // Default to the most recent dataset; drop a selection that belongs to another tenant.
  useEffect(() => {
    if (!list) return;
    if (list.length && (!selected || !list.some((d) => d.id === selected))) router.replace(`/processing?dataset=${list[0].id}`);
  }, [list, selected, router]);

  if (!ready) return <Spinner />;

  return (
    <div className="space-y-4">
      <PageHeader title="Traitement" subtitle="Suivi du pipeline déterministe, inspection des valeurs, corrections et validation avant publication." />
      {error && <ErrorBox>{error}</ErrorBox>}
      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Card title="Jeux de données" actions={<Button variant="ghost" icon={RefreshCw} onClick={loadList} aria-label="Rafraîchir" />} className="h-fit">
          {!list ? (
            <Spinner />
          ) : list.length === 0 ? (
            <Empty icon={Inbox} title="Aucun dépôt">
              Déposez un fichier depuis la page Collecte.
            </Empty>
          ) : (
            <ul className="-mx-2 space-y-1">
              {list.map((d) => (
                <li key={d.id}>
                  <button
                    onClick={() => router.replace(`/processing?dataset=${d.id}`)}
                    className={cx("w-full rounded-lg px-2 py-2 text-left text-sm transition", d.id === selected ? "bg-brand-50 ring-1 ring-brand/30" : "hover:bg-plane")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium text-ink">{d.filename ?? "Saisie manuelle"}</span>
                      <StatusBadge status={d.status} />
                    </div>
                    <div className="mt-0.5 text-xs text-ink-2">
                      {new Date(d.created_at).toLocaleString("fr-FR")} · {d.row_count} ligne(s)
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {selected ? <DatasetPanel key={`${apiKey}:${selected}`} id={selected} onChanged={loadList} /> : null}
      </div>
    </div>
  );
}

function DatasetPanel({ id, onChanged }: { id: string; onChanged: () => void }) {
  const { catalog, isAdmin } = useSession();
  const [ds, setDs] = useState<DatasetDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"raw" | "score">("score");
  const [editing, setEditing] = useState<{ row: number; indicator: Indicator; cell: Cell; territory: string } | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  const load = useCallback(() => {
    api
      .get<DatasetDetail>(`/api/datasets/${id}`)
      .then(setDs)
      .catch((e: Error) => setError(e.message));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!ds || !RUNNING.has(ds.status)) return;
    const t = setInterval(load, 1500);
    return () => clearInterval(t);
  }, [ds, load]);

  async function decide(action: "approve" | "reject") {
    setBusy(action);
    setError(null);
    try {
      await api.post(`/api/datasets/${id}/${action}`, { comment: comment || null });
      setComment("");
      load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (error && !ds) return <ErrorBox>{error}</ErrorBox>;
  if (!ds || !catalog) return <Spinner />;

  const canEdit = isAdmin && ds.status === "PENDING_APPROVAL";
  const errors = ds.issues.filter((i) => i.severity === "error");
  const warnings = ds.issues.filter((i) => i.severity === "warning");

  return (
    <div className="min-w-0 space-y-4">
      {error && <ErrorBox>{error}</ErrorBox>}
      <Card
        title={
          <span className="flex flex-wrap items-center gap-2">
            {ds.filename ?? "Saisie manuelle"} <StatusBadge status={ds.status} />
          </span>
        }
      >
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <Meta label="Déposé par" value={`${ds.submitted_by} (${ds.organization})`} />
          <Meta label="Type d'acteur" value={ds.stakeholder_type} />
          <Meta label="Source" value={ds.source_type === "excel" ? "Fichier Excel" : "Saisie manuelle"} />
          <Meta label="Lignes" value={String(ds.row_count)} />
          {ds.description && <Meta label="Description" value={ds.description} className="sm:col-span-2 xl:col-span-4" />}
          {ds.reviewed_by && <Meta label="Revue" value={`${ds.reviewed_by}${ds.review_comment ? ` : « ${ds.review_comment} »` : ""}`} className="sm:col-span-2" />}
        </dl>
        <Stepper ds={ds} />
      </Card>

      {(errors.length > 0 || warnings.length > 0) && (
        <Card title={`Contrôles qualité · ${errors.length} erreur(s), ${warnings.length} avertissement(s)`}>
          <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
            {[...errors, ...warnings].map((i, n) => (
              <li key={n} className="flex items-start gap-2">
                {i.severity === "error" ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-band-bad" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#9A7420]" />}
                <span className="text-ink-2">
                  {i.row !== null && <span className="font-medium text-ink">Ligne {i.row} · </span>}
                  {i.message}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card
        title="Inspection des données"
        actions={
          <div className="flex rounded-lg border border-axis p-0.5 text-xs">
            {(
              [
                ["score", "Scores 1–10"],
                ["raw", "Valeurs brutes"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} onClick={() => setMode(k)} className={cx("rounded-md px-2.5 py-1", mode === k ? "bg-brand text-white" : "text-ink-2 hover:bg-plane")}>
                {l}
              </button>
            ))}
          </div>
        }
      >
        {ds.table.length === 0 ? (
          <Empty icon={Inbox} title="Aucune donnée traitée">
            {ds.status === "FAILED" ? "Le pipeline a échoué : voir les contrôles qualité ci-dessus." : "Le pipeline est en cours…"}
          </Empty>
        ) : (
          <>
            <FlagLegend canEdit={canEdit} />
            <InspectionTable ds={ds} mode={mode} canEdit={canEdit} onEdit={setEditing} />
          </>
        )}
      </Card>

      {isAdmin && ds.status === "PENDING_APPROVAL" && (
        <Card title="Validation administrateur">
          <p className="mb-3 text-sm text-ink-2">Une fois publié, ce jeu de données alimente le tableau de bord. Un rejet est définitif : il faudra déposer un nouveau fichier.</p>
          <textarea className="input mb-3 min-h-[60px]" placeholder="Commentaire de revue (optionnel)" value={comment} onChange={(e) => setComment(e.target.value)} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="danger" icon={ThumbsDown} loading={busy === "reject"} onClick={() => decide("reject")}>
              Rejeter
            </Button>
            <Button icon={ThumbsUp} loading={busy === "approve"} onClick={() => decide("approve")}>
              Approuver et publier
            </Button>
          </div>
        </Card>
      )}
      {!isAdmin && ds.status === "PENDING_APPROVAL" && <p className="text-sm text-ink-2">En attente de la validation d'un administrateur de votre organisation.</p>}

      <Card title="Journal d'audit">
        <ol className="space-y-2 text-sm">
          {ds.events
            .slice()
            .reverse()
            .map((e, n) => (
              <li key={n} className="flex flex-wrap gap-x-3 border-b border-hairline pb-2 last:border-0">
                <span className="tabular-nums text-ink-muted">{new Date(e.at).toLocaleString("fr-FR")}</span>
                <span className="font-medium text-ink">
                  {e.from_state ? `${STATUS_LABEL[e.from_state] ?? e.from_state} → ` : ""}
                  {STATUS_LABEL[e.to_state] ?? e.to_state}
                </span>
                <span className="text-ink-2">{e.actor}</span>
                {e.message && <span className="basis-full text-ink-2">{e.message}</span>}
              </li>
            ))}
        </ol>
      </Card>

      {editing && (
        <OverrideDialog
          datasetId={ds.id}
          target={editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            load();
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function Meta({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}

function Stepper({ ds }: { ds: DatasetDetail }) {
  // Only consider the latest run (an admin override restarts the pipeline from RECEIVED).
  const lastStart = ds.events.map((e) => e.to_state).lastIndexOf("RECEIVED");
  const run = ds.events.slice(Math.max(0, lastStart));
  const reached = new Map(run.map((e) => [e.to_state, e]));
  const terminal = ["PUBLISHED", "REJECTED", "FAILED"].find((s) => reached.has(s));
  const steps = [...ds.pipeline_states, terminal ?? "PUBLISHED"];

  return (
    <ol className="mt-5 grid gap-2 sm:grid-cols-4 xl:grid-cols-7">
      {steps.map((s) => {
        const ev = reached.get(s);
        const isCurrent = ds.status === s;
        const failed = s === "FAILED" || s === "REJECTED";
        const Icon = ev ? (failed ? XCircle : isCurrent && RUNNING.has(s) ? Loader2 : CheckCircle2) : Circle;
        return (
          <li
            key={s}
            title={ev?.message ?? undefined}
            className={cx(
              "rounded-lg border px-3 py-2 text-xs",
              ev ? (failed ? "border-[#F0C9BD] bg-[#FBE6DF]" : isCurrent ? "border-brand/40 bg-brand-50" : "border-hairline bg-white") : "border-dashed border-hairline text-ink-muted",
            )}
          >
            <div className="flex items-center gap-1.5 font-medium">
              <Icon className={cx("h-4 w-4", ev && !failed && "text-band-best", failed && ev && "text-band-bad", isCurrent && RUNNING.has(s) && "animate-spin text-brand")} />
              {STATUS_LABEL[s] ?? s}
            </div>
            {ev && (
              <div className="mt-1 text-ink-2">
                {new Date(ev.at).toLocaleTimeString("fr-FR")}
                {ev.duration_ms !== null && ` · ${fmt(ev.duration_ms, 0)} ms`}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function FlagLegend({ canEdit }: { canEdit: boolean }) {
  return (
    <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
      <span>
        <span className="italic text-ink-muted">—</span> {FLAG_LABEL.missing}
      </span>
      <span className="inline-flex items-center gap-1">
        <ArrowUpDown className="h-3 w-3" /> {FLAG_LABEL.out_of_reference}
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="h-3 w-3 rounded-sm ring-2 ring-[#D4A33A]" /> {FLAG_LABEL.outlier}
      </span>
      <span className="inline-flex items-center gap-1">
        <PenLine className="h-3 w-3 text-brand" /> {FLAG_LABEL.overridden}
      </span>
      {canEdit && <span className="text-brand">Cliquez sur une cellule pour la corriger.</span>}
    </div>
  );
}

function InspectionTable({
  ds,
  mode,
  canEdit,
  onEdit,
}: {
  ds: DatasetDetail;
  mode: "raw" | "score";
  canEdit: boolean;
  onEdit: (t: { row: number; indicator: Indicator; cell: Cell; territory: string }) => void;
}) {
  const { catalog } = useSession();
  const groups = useMemo(
    () => catalog!.dimensions.map((d) => ({ dim: d, inds: catalog!.indicators.filter((i) => i.dimension === d.code) })),
    [catalog],
  );

  return (
    <div className="overflow-x-auto rounded-lg border border-hairline">
      <table className="min-w-full text-xs">
        <thead className="bg-plane text-ink-2">
          <tr>
            <th rowSpan={2} className="sticky left-0 z-10 bg-plane px-3 py-2 text-left font-medium">
              Territoire
            </th>
            {groups.map(({ dim, inds }) => (
              <th key={dim.code} colSpan={inds.length + 1} className="border-l border-hairline px-2 py-1.5 text-center font-semibold text-ink">
                {dim.label}
              </th>
            ))}
          </tr>
          <tr>
            {groups.flatMap(({ dim, inds }) => [
              ...inds.map((i, n) => (
                <th key={i.code} title={`${i.label} (${i.unit})`} className={cx("max-w-[7rem] px-2 py-1.5 text-left font-normal", n === 0 && "border-l border-hairline")}>
                  <span className="line-clamp-2">{i.label}</span>
                </th>
              )),
              <th key={`${dim.code}-dim`} className="bg-brand-50 px-2 py-1.5 text-left font-semibold text-brand">
                Score {dim.code}
              </th>,
            ])}
          </tr>
        </thead>
        <tbody>
          {ds.table.map((row) => (
            <tr key={`${row.territory_code}-${row.period}`} className="border-t border-hairline">
              <td className="sticky left-0 z-10 whitespace-nowrap bg-surface px-3 py-2">
                <div className="font-medium text-ink">
                  {row.territory_code} · {row.territory_name}
                </div>
                <div className="text-ink-muted">
                  {row.period} · ligne {row.source_row}
                </div>
              </td>
              {groups.flatMap(({ dim, inds }) => [
                ...inds.map((ind, n) => {
                  const c = row.cells[ind.code];
                  return (
                    <td key={ind.code} className={cx("px-1 py-1", n === 0 && "border-l border-hairline")}>
                      <ValueCell
                        cell={c}
                        mode={mode}
                        indicator={ind}
                        canEdit={canEdit}
                        onClick={() => onEdit({ row: row.source_row, indicator: ind, cell: c, territory: `${row.territory_code} · ${row.territory_name}` })}
                      />
                    </td>
                  );
                }),
                <td key={`${dim.code}-dim`} className="bg-brand-50/50 px-2 py-1" title={`Couverture ${Math.round((row.dimensions[dim.code]?.coverage ?? 0) * 100)} %`}>
                  <ScorePill score={row.dimensions[dim.code]?.score ?? null} bold />
                </td>,
              ])}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScorePill({ score, bold }: { score: number | null; bold?: boolean }) {
  if (score === null) return <span className="italic text-ink-muted">—</span>;
  const b = score >= 7 ? "best" : score >= 4 ? "middle" : "bad";
  return (
    <span className={cx("inline-flex items-center gap-1 tabular-nums", bold && "font-semibold")}>
      <span className="h-2 w-2 rounded-full" style={{ background: BAND_META[b].color }} aria-label={BAND_META[b].label} />
      {fmt(score)}
    </span>
  );
}

function ValueCell({ cell, mode, indicator, canEdit, onClick }: { cell?: Cell; mode: "raw" | "score"; indicator: Indicator; canEdit: boolean; onClick: () => void }) {
  if (!cell) return null;
  const flags = new Set(cell.flags);
  const title = [
    `${indicator.label}`,
    `Brut : ${fmt(cell.raw_value, 2)} ${indicator.unit}`,
    `Score : ${fmt(cell.score)}`,
    ...cell.flags.map((f) => FLAG_LABEL[f] ?? f),
  ].join("\n");
  const content = flags.has("missing") ? (
    <span className="italic text-ink-muted">—</span>
  ) : mode === "raw" ? (
    <span className="tabular-nums">{fmt(cell.raw_value, 2)}</span>
  ) : (
    <ScorePill score={cell.score} />
  );
  return (
    <button
      type="button"
      title={title}
      disabled={!canEdit}
      onClick={onClick}
      className={cx(
        "flex w-full items-center gap-1 rounded px-1.5 py-1 text-left",
        flags.has("outlier") && "ring-2 ring-inset ring-[#D4A33A]",
        canEdit ? "cursor-pointer hover:bg-brand-50" : "cursor-default",
      )}
    >
      {content}
      {flags.has("out_of_reference") && <ArrowUpDown className="h-3 w-3 shrink-0 text-ink-muted" aria-label={FLAG_LABEL.out_of_reference} />}
      {flags.has("overridden") && <PenLine className="h-3 w-3 shrink-0 text-brand" aria-label={FLAG_LABEL.overridden} />}
    </button>
  );
}

function OverrideDialog({
  datasetId,
  target,
  onClose,
  onDone,
}: {
  datasetId: string;
  target: { row: number; indicator: Indicator; cell: Cell; territory: string };
  onClose: () => void;
  onDone: () => void;
}) {
  const [value, setValue] = useState(target.cell.raw_value === null ? "" : String(target.cell.raw_value));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { indicator } = target;

  async function save() {
    setBusy(true);
    setError(null);
    const parsed = value.trim() === "" ? null : Number(value.replace(",", "."));
    if (parsed !== null && Number.isNaN(parsed)) {
      setError("Valeur numérique attendue.");
      setBusy(false);
      return;
    }
    try {
      await api.post(`/api/datasets/${datasetId}/override`, { row: target.row, column: indicator.code, value: parsed, reason });
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-xl bg-surface p-5 shadow-xl">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-ink">Corriger une valeur</h3>
            <p className="text-sm text-ink-2">
              {target.territory} · {indicator.label}
            </p>
          </div>
          <Button variant="ghost" icon={X} onClick={onClose} aria-label="Fermer" />
        </div>
        <div className="space-y-3 text-sm">
          <label className="block space-y-1">
            <span className="font-medium">
              Nouvelle valeur ({indicator.unit}) — référence {indicator.ref_min} à {indicator.ref_max}
            </span>
            <input className="input" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Vide = valeur manquante" />
          </label>
          <label className="block space-y-1">
            <span className="font-medium">Motif (tracé dans le journal d'audit)</span>
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. : erreur de saisie confirmée par la source" />
          </label>
          {error && <ErrorBox>{error}</ErrorBox>}
          <p className="text-xs text-ink-muted">La correction relance l'intégralité du pipeline sur ce jeu de données.</p>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button icon={Check} onClick={save} loading={busy} disabled={reason.trim().length < 3}>
            Corriger et relancer
          </Button>
        </div>
      </div>
    </div>
  );
}
