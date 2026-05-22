import { useState, useEffect, useCallback } from "react";
import { Button } from "../components/Button";
import { SvgIcon } from "../components/SvgIcon";
import { InputText } from "../components/InputText";
import { Card } from "../components/Card";
import { SummaryCard } from "../components/SummaryCard";
import { SelectList } from "../components/SelectList";
import { Table } from "../components/Table";
import { Modal } from "../components/Modal";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem("auth_token") ?? ""}` };
}

interface Experiment {
  id: string;
  name: string;
  model_id: string;
  dataset_id: string;
  description?: string | null;
  config?: Record<string, unknown> | null;
  status: string;
  results?: unknown;
  created_at: string;
  updated_at: string;
}

interface Model   { id: string; name: string; version: string; }
interface Dataset { id: string; name: string; }

const statusStyles: Record<string, { bg: string; color: string }> = {
  running:   { bg: "var(--bg-blue)",   color: "var(--cl-blue)"   },
  completed: { bg: "var(--bg-green)",  color: "var(--cl-green)"  },
  paused:    { bg: "var(--bg-yellow)", color: "var(--cl-yellow)" },
  failed:    { bg: "var(--bg-red)",    color: "var(--cl-red)"    },
  pending:   { bg: "var(--bg-yellow)", color: "var(--cl-yellow)" },
};

const batchOptions = ["4", "16", "32", "64", "128"].map(v => ({ label: v, value: v }));
const lossOptions  = ["CrossEntropy", "MSE", "BCE", "Focal"].map(v => ({ label: v, value: v.toLowerCase() }));
const sortOptions  = [
  { label: "All",    value: "all"    },
  { label: "Name",   value: "name"   },
  { label: "Status", value: "status" },
  { label: "Date",   value: "date"   },
];

export default function Experiments() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [models,   setModels]   = useState<Model[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [expName,    setExpName]    = useState("");
  const [expDesc,    setExpDesc]    = useState("");
  const [expModel,   setExpModel]   = useState("");
  const [expDataset, setExpDataset] = useState("");
  const [expBatch,   setExpBatch]   = useState("32");
  const [expLoss,    setExpLoss]    = useState("crossentropy");
  const [createError,  setCreateError]  = useState<string | null>(null);
  const [creating,     setCreating]     = useState(false);

  // edit modal
  const [editOpen, setEditOpen]   = useState(false);
  const [editExp,  setEditExp]    = useState<Experiment | null>(null);
  const [editStatus, setEditStatus] = useState("");

  const [search, setSearch] = useState("");
  const [sort,   setSort]   = useState("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Load data ──────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [expRes, modRes, dsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/experiments`,        { headers: authHeaders() }),
        fetch(`${API_BASE_URL}/registry/models`,    { headers: authHeaders() }),
        fetch(`${API_BASE_URL}/datasets`,           { headers: authHeaders() }),
      ]);
      const [expData, modData, dsData] = await Promise.all([expRes.json(), modRes.json(), dsRes.json()]);
      if (!expRes.ok) { setError(expData.detail ?? "Failed to load experiments."); return; }
      setExperiments(expData.experiments ?? []);
      setModels(modData.models ?? []);
      setDatasets(dsData.datasets ?? []);
    } catch {
      setError("Could not reach backend.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── Create ─────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!expName.trim()) { setCreateError("Name is required."); return; }
    if (!expModel)       { setCreateError("Select a model."); return; }
    if (!expDataset)     { setCreateError("Select a dataset."); return; }
    setCreating(true); setCreateError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/experiments`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          name: expName.trim(),
          description: expDesc.trim() || null,
          model_id: expModel,
          dataset_id: expDataset,
          config: { batch_size: parseInt(expBatch), loss: expLoss },
        }),
      });
      const data = await res.json();
      if (!res.ok) { setCreateError(data.detail ?? "Failed to create."); return; }
      await load();
      setCreateOpen(false);
      setExpName(""); setExpDesc(""); setExpModel(""); setExpDataset("");
    } catch {
      setCreateError("Could not reach backend.");
    } finally {
      setCreating(false);
    }
  };

  // ── Update status ──────────────────────────────────────────────────
  const handleUpdate = async () => {
    if (!editExp) return;
    try {
      await fetch(`${API_BASE_URL}/experiments/${editExp.id}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ status: editStatus }),
      });
      await load();
      setEditOpen(false);
    } catch { /* silent */ }
  };

  // ── Delete ─────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!confirm("Delete this experiment?")) return;
    setDeletingId(id);
    try {
      await fetch(`${API_BASE_URL}/experiments/${id}`, { method: "DELETE", headers: authHeaders() });
      await load();
    } finally { setDeletingId(null); }
  };

  // ── Helpers ────────────────────────────────────────────────────────
  const modelName   = (id: string) => models.find(m => m.id === id)?.name ?? id.slice(0, 8);
  const datasetName = (id: string) => datasets.find(d => d.id === id)?.name ?? id.slice(0, 8);

  const filtered = experiments
    .filter(e => {
      if (!search) return true;
      const q = search.toLowerCase();
      return e.name.toLowerCase().includes(q) || e.status.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (sort === "name")   return a.name.localeCompare(b.name);
      if (sort === "status") return a.status.localeCompare(b.status);
      if (sort === "date")   return b.updated_at.localeCompare(a.updated_at);
      return 0;
    });

  const counts = {
    total:     experiments.length,
    completed: experiments.filter(e => e.status === "completed").length,
    running:   experiments.filter(e => e.status === "running").length,
    failed:    experiments.filter(e => e.status === "failed").length,
  };

  const modelOptions   = models.map(m   => ({ label: `${m.name} v${m.version}`, value: m.id }));
  const datasetOptions = datasets.map(d => ({ label: d.name,                    value: d.id }));
  const statusOptions  = ["pending","running","completed","failed","paused"].map(s => ({ label: s, value: s }));

  const columns = [
    { key: "name",       label: "Experiment", render: (v: unknown) => <span className="font-medium">{String(v)}</span> },
    { key: "dataset_id", label: "Dataset",    render: (v: unknown) => <span className="font-medium">{datasetName(String(v))}</span> },
    { key: "model_id",   label: "Model",      render: (v: unknown) => <span className="font-medium">{modelName(String(v))}</span> },
    {
      key: "config", label: "Batch",
      render: (v: unknown) => {
        const cfg = v as Record<string, unknown> | null;
        return <span className="font-medium">{String(cfg?.batch_size ?? "-")}</span>;
      },
    },
    {
      key: "status", label: "Status",
      render: (v: unknown) => {
        const style = statusStyles[String(v)] ?? { bg: "var(--bg-white)", color: "var(--cl-white)" };
        return <div className="px-2 py-1 rounded-md text-xs w-fit font-bold"
          style={{ background: style.bg, color: style.color, border: `1px solid ${style.color}` }}>{String(v)}</div>;
      },
    },
    { key: "updated_at", label: "Updated", render: (v: unknown) => <span className="font-medium">{new Date(String(v)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span> },
    {
      key: "actions", label: "",
      render: (_: unknown, row: Record<string, unknown>) => {
        const exp = row as unknown as Experiment;
        return (
          <div className="flex flex-row gap-2 justify-end">
            <Button variant="secondary" label="Edit" onClick={() => { setEditExp(exp); setEditStatus(exp.status); setEditOpen(true); }} />
            <Button variant="transparent" ico={<SvgIcon name="trash-2" />}
              disabled={deletingId === exp.id} onClick={() => void handleDelete(exp.id)} />
          </div>
        );
      },
    },
  ];

  return (
    <main className="flex-1 overflow-y-auto p-6 bg-[var(--bg-page-user)]">
      <div className="flex flex-row items-center justify-between">
        <div className="flex flex-col mb-6">
          <h1 className="text-2xl text-[var(--cl-font-primary)] font-semibold">Experiments</h1>
          <p className="text-sm text-[var(--cl-font-secondary)]">Track and manage your training experiments</p>
        </div>
        <Button label="New Experiment" className="h-min" ico={<SvgIcon name="plus" />} onClick={() => setCreateOpen(true)} />
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card hoverable><SummaryCard label="Total"     value={counts.total}     icon="flask-conical"    classNameValue="text-[var(--cl-white)]"  /></Card>
        <Card hoverable><SummaryCard label="Completed" value={counts.completed} icon="circle-check-big" classNameValue="text-[var(--cl-green)]"  /></Card>
        <Card hoverable><SummaryCard label="Running"   value={counts.running}   icon="loader-circle"    classNameValue="text-[var(--cl-blue)]"   /></Card>
        <Card hoverable><SummaryCard label="Failed"    value={counts.failed}    icon="circle-x"         classNameValue="text-[var(--cl-red)]"    /></Card>
      </div>

      <div className="flex my-4 flex-row items-center gap-2">
        <InputText placeholder="Search experiments..." ico={<SvgIcon name="search" />}
          className="w-2/4" value={search} onChange={e => setSearch(e.target.value)} />
        <SvgIcon name="sliders-horizontal" className="text-[var(--cl-font-primary)]" size="w-5 h-5" />
        <SelectList options={sortOptions} value={sort} onChange={setSort} />
        <Button label={loading ? "Refreshing" : "Refresh"} variant="secondary" disabled={loading} onClick={() => void load()} />
      </div>

      {error && <p className="mb-3 text-xs" style={{ color: "var(--cl-red)" }}>{error}</p>}

      <Table columns={columns} data={filtered as unknown as Record<string, unknown>[]} />

      {/* ── Create Modal ── */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New Experiment"
        description="Configure and launch a training experiment" icon="flask-conical">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold" style={{ color: "var(--cl-font-secondary)" }}>Name</label>
            <InputText placeholder="e.g. UNet v2 run 1" value={expName} onChange={e => setExpName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold" style={{ color: "var(--cl-font-secondary)" }}>Description</label>
            <InputText placeholder="Optional notes..." value={expDesc} onChange={e => setExpDesc(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: "var(--cl-font-secondary)" }}>Model</label>
              <SelectList options={modelOptions} value={expModel} onChange={setExpModel} className="w-full" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: "var(--cl-font-secondary)" }}>Dataset</label>
              <SelectList options={datasetOptions} value={expDataset} onChange={setExpDataset} className="w-full" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: "var(--cl-font-secondary)" }}>Batch Size</label>
              <SelectList options={batchOptions} value={expBatch} onChange={setExpBatch} className="w-full" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: "var(--cl-font-secondary)" }}>Loss Function</label>
              <SelectList options={lossOptions} value={expLoss} onChange={setExpLoss} className="w-full" />
            </div>
          </div>
          {createError && <p className="text-xs" style={{ color: "var(--cl-red)" }}>{createError}</p>}
          <div className="flex flex-row justify-end gap-2 mt-2">
            <Button label="Cancel" variant="secondary" onClick={() => setCreateOpen(false)} />
            <Button label={creating ? "Creating…" : "Create Experiment"} ico={<SvgIcon name="flask-conical" />}
              disabled={creating} onClick={() => void handleCreate()} />
          </div>
        </div>
      </Modal>

      {/* ── Edit Modal ── */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Experiment"
        description={editExp?.name ?? ""} icon="pencil">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold" style={{ color: "var(--cl-font-secondary)" }}>Status</label>
            <SelectList options={statusOptions} value={editStatus} onChange={setEditStatus} className="w-full" />
          </div>
          <div className="flex flex-row justify-end gap-2 mt-2">
            <Button label="Cancel" variant="secondary" onClick={() => setEditOpen(false)} />
            <Button label="Save" ico={<SvgIcon name="save" />} onClick={() => void handleUpdate()} />
          </div>
        </div>
      </Modal>
    </main>
  );
}
