import { useEffect, useRef, useState } from "react";
import { apiFetch, API_BASE_URL } from "../api";
import { Button } from "../components/Button";
import { SvgIcon } from "../components/SvgIcon";
import { InputText } from "../components/InputText";
import { Card } from "../components/Card";
import { SummaryCard } from "../components/SummaryCard";
import { SelectList } from "../components/SelectList";
import { Table } from "../components/Table";
import { Modal } from "../components/Modal";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Experiment {
  id: string;
  name: string;
  dataset_id: string;
  model_id: string;
  epochs: number;
  current_epoch: number;
  status: "queued" | "running" | "paused" | "completed" | "failed" | "cancelled";
  error: string | null;
}

interface Dataset {
  id: string;
  name: string;
  image_count: number;
}

interface RegistryModel {
  id: string;
  name: string;
  version: string;
  active: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const statusStyle: Record<string, { bg: string; color: string }> = {
  running:   { bg: "var(--bg-blue)",   color: "var(--cl-blue)"   },
  queued:    { bg: "var(--bg-yellow)", color: "var(--cl-yellow)" },
  paused:    { bg: "var(--bg-yellow)", color: "var(--cl-yellow)" },
  completed: { bg: "var(--bg-green)",  color: "var(--cl-green)"  },
  failed:    { bg: "var(--bg-red)",    color: "var(--cl-red)"    },
  cancelled: { bg: "var(--bg-red)",    color: "var(--cl-red)"    },
};

const sortOptions = [
  { label: "All",          value: "all"      },
  { label: "Name A-Z",     value: "name"     },
  { label: "Progress",     value: "progress" },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function Experiments() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [models, setModels] = useState<RegistryModel[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [expName, setExpName] = useState("");
  const [selectedDataset, setSelectedDataset] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [epochs, setEpochs] = useState("5");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [sort, setSort] = useState("all");
  const [search, setSearch] = useState("");

  // SSE refs: map of experiment_id -> EventSource
  const eventSources = useRef<Record<string, EventSource>>({});

  // ── Load data ───────────────────────────────────────────────────────────────

  const loadDatasets = async () => {
    try {
      const res = await apiFetch("/datasets");
      const payload = await res.json();
      setDatasets(payload.datasets ?? []);
    } catch { /* ignore */ }
  };

  const loadModels = async () => {
    try {
      const res = await apiFetch("/registry/models");
      const payload = await res.json();
      setModels(payload.models ?? []);
    } catch { /* ignore */ }
  };

  const loadExperiments = async () => {
    try {
      const res = await apiFetch("/experiments");
      const payload: Experiment[] = await res.json();
      setExperiments(payload);
      // Subscribe SSE for running/queued ones
      for (const exp of payload) {
        if (["running", "queued", "paused"].includes(exp.status)) {
          subscribeSSE(exp.id);
        }
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    void loadDatasets();
    void loadModels();
    void loadExperiments();
    return () => {
      // Cleanup SSE on unmount
      Object.values(eventSources.current).forEach((es) => es.close());
    };
  }, []);

  // ── SSE subscription ────────────────────────────────────────────────────────

  const subscribeSSE = (experimentId: string) => {
    if (eventSources.current[experimentId]) return; // already subscribed

    const token = localStorage.getItem("auth_token") ?? "";
    const url = `${API_BASE_URL}/experiments/${experimentId}/stream`;

    // SSE doesn't support custom headers natively; pass token as query param
    const es = new EventSource(`${url}?token=${token}`);

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as {
          experiment_id: string;
          epoch: number;
          total_epochs: number;
          progress: number;
          status: Experiment["status"];
          error: string | null;
        };

        setExperiments((prev) =>
          prev.map((exp) =>
            exp.id === data.experiment_id
              ? { ...exp, current_epoch: data.epoch, status: data.status, error: data.error }
              : exp
          )
        );

        const terminal = ["completed", "failed", "cancelled"];
        if (terminal.includes(data.status)) {
          es.close();
          delete eventSources.current[experimentId];
        }
      } catch { /* ignore malformed */ }
    };

    es.onerror = () => {
      es.close();
      delete eventSources.current[experimentId];
    };

    eventSources.current[experimentId] = es;
  };

  // ── Create experiment ───────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!expName.trim())       { setCreateError("Experiment name is required."); return; }
    if (!selectedDataset)      { setCreateError("Select a dataset."); return; }
    if (!selectedModel)        { setCreateError("Select a model."); return; }
    const epochsNum = parseInt(epochs);
    if (!epochsNum || epochsNum < 1) { setCreateError("Epochs must be at least 1."); return; }

    setCreating(true);
    setCreateError(null);
    try {
      const form = new FormData();
      form.append("name", expName.trim());
      form.append("dataset_id", selectedDataset);
      form.append("model_id", selectedModel);
      form.append("epochs", String(epochsNum));

      const res = await apiFetch("/experiments", { method: "POST", body: form });
      const payload = await res.json();
      if (!res.ok) { setCreateError(payload.detail ?? "Failed to create experiment."); return; }

      const newExp: Experiment = {
        id: payload.id,
        name: payload.name,
        dataset_id: payload.dataset_id,
        model_id: payload.model_id,
        epochs: payload.epochs,
        current_epoch: payload.current_epoch,
        status: payload.status,
        error: null,
      };

      setExperiments((prev) => [newExp, ...prev]);
      subscribeSSE(newExp.id);
      resetForm();
      setModalOpen(false);
    } catch {
      setCreateError("Could not reach backend.");
    } finally {
      setCreating(false);
    }
  };

  const resetForm = () => {
    setExpName(""); setSelectedDataset(""); setSelectedModel("");
    setEpochs("5"); setCreateError(null);
  };

  // ── Pause / Resume / Cancel ─────────────────────────────────────────────────

  const handlePause = async (id: string) => {
    await apiFetch(`/experiments/${id}/pause`, { method: "POST" });
  };

  const handleResume = async (id: string) => {
    const res = await apiFetch(`/experiments/${id}/resume`, { method: "POST" });
    if (res.ok) subscribeSSE(id);
  };

  const handleCancel = async (id: string) => {
    await apiFetch(`/experiments/${id}/cancel`, { method: "POST" });
  };

  // ── Table ───────────────────────────────────────────────────────────────────

  const textRender = (v: unknown) => <span className="font-medium">{String(v ?? "-")}</span>;

  const filteredData = experiments
    .filter((row) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return row.name.toLowerCase().includes(q) || row.status.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "progress") return b.current_epoch - a.current_epoch;
      return 0;
    });

  const datasetName = (id: string) => datasets.find((d) => d.id === id)?.name ?? id.slice(0, 8);
  const modelName   = (id: string) => {
    const m = models.find((m) => m.id === id);
    return m ? `${m.name} ${m.version}` : id.slice(0, 8);
  };

  const columns = [
    { key: "name",       label: "Experiment", render: textRender },
    { key: "dataset_id", label: "Dataset",    render: (v: unknown) => textRender(datasetName(String(v))) },
    { key: "model_id",   label: "Model",      render: (v: unknown) => textRender(modelName(String(v)))   },
    {
      key: "progress",
      label: "Progress",
      render: (_: unknown, row: Record<string, unknown>) => {
        const exp = row as unknown as Experiment;
        const pct = exp.epochs > 0 ? Math.round((exp.current_epoch / exp.epochs) * 100) : 0;
        return (
          <div className="flex items-center gap-2 min-w-[140px]">
            <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-blue)" }}>
              <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, background: "var(--cl-blue)" }} />
            </div>
            <span className="text-xs w-16 text-right" style={{ color: "var(--cl-font-secondary)" }}>
              {exp.current_epoch}/{exp.epochs}
            </span>
          </div>
        );
      },
    },
    {
      key: "status",
      label: "Status",
      render: (v: unknown) => {
        const s = String(v);
        const st = statusStyle[s] ?? { bg: "var(--bg-white)", color: "var(--cl-white)" };
        return (
          <div className="px-2 py-1 rounded-md text-xs w-fit font-bold capitalize"
            style={{ background: st.bg, color: st.color, border: `1px solid ${st.color}` }}>
            {s}
          </div>
        );
      },
    },
    {
      key: "actions",
      label: "",
      render: (_: unknown, row: Record<string, unknown>) => {
        const exp = row as unknown as Experiment;
        return (
          <div className="flex items-center gap-1 justify-end">
            {exp.status === "running" && (
              <Button variant="secondary" ico={<SvgIcon name="pause" />} label="Pause"
                onClick={() => void handlePause(exp.id)} />
            )}
            {exp.status === "paused" && (
              <Button variant="secondary" ico={<SvgIcon name="play" />} label="Resume"
                onClick={() => void handleResume(exp.id)} />
            )}
            {["running", "paused", "queued"].includes(exp.status) && (
              <Button variant="transparent" ico={<SvgIcon name="x" />}
                onClick={() => void handleCancel(exp.id)} />
            )}
          </div>
        );
      },
    },
  ];

  // Summary counts
  const counts = {
    total:     experiments.length,
    completed: experiments.filter((e) => e.status === "completed").length,
    running:   experiments.filter((e) => e.status === "running").length,
    failed:    experiments.filter((e) => ["failed", "cancelled"].includes(e.status)).length,
  };

  const datasetOptions  = datasets.map((d) => ({ label: `${d.name} (${d.image_count} imgs)`, value: d.id }));
  const modelOptions    = models.map((m)   => ({ label: `${m.name} ${m.version}${m.active ? " ✓" : ""}`, value: m.id }));

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <main className="flex-1 overflow-y-auto p-6 bg-[var(--bg-page-user)]">
      <div className="flex flex-row items-center justify-between">
        <div className="flex flex-col justify-between mb-6">
          <h1 className="text-2xl text-[var(--cl-font-primary)] font-semibold">Experiments</h1>
          <p className="text-sm text-[var(--cl-font-secondary)]">Track and manage your segmentation experiments</p>
        </div>
        <Button label="New Experiment" className="h-min" ico={<SvgIcon name="plus" />} onClick={() => setModalOpen(true)} />
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card hoverable><SummaryCard label="Total"     value={counts.total}     icon="search"          classNameValue="text-[var(--cl-white)]"  /></Card>
        <Card hoverable><SummaryCard label="Completed" value={counts.completed} icon="circle-check-big" classNameValue="text-[var(--cl-green)]"  /></Card>
        <Card hoverable><SummaryCard label="Running"   value={counts.running}   icon="loader-circle"   classNameValue="text-[var(--cl-blue)]"   /></Card>
        <Card hoverable><SummaryCard label="Failed"    value={counts.failed}    icon="circle-x"        classNameValue="text-[var(--cl-red)]"    /></Card>
      </div>

      <div className="flex my-4 flex-row items-center gap-2">
        <InputText placeholder="Search experiments..." ico={<SvgIcon name="search" />} className="w-2/4"
          value={search} onChange={(e) => setSearch(e.target.value)} />
        <SvgIcon name="sliders-horizontal" className="text-[var(--cl-font-primary)]" size="w-5 h-5" />
        <SelectList options={sortOptions} value={sort} onChange={setSort} />
      </div>

      <Table columns={columns} data={filteredData as unknown as Record<string, unknown>[]} />

      {/* ── New Experiment Modal ── */}
      <Modal open={modalOpen} onClose={() => { setModalOpen(false); resetForm(); }}
        title="New Experiment" description="Configure and launch a new training experiment" icon="flask-conical">
        <div className="flex flex-col gap-4">

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold" style={{ color: "var(--cl-font-secondary)" }}>Experiment Name *</label>
            <InputText placeholder="e.g. GrapheneSeg run 1" value={expName} onChange={(e) => setExpName(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: "var(--cl-font-secondary)" }}>Dataset *</label>
              {datasetOptions.length === 0
                ? <p className="text-xs" style={{ color: "var(--cl-red)" }}>No datasets available. Upload one first.</p>
                : <SelectList options={datasetOptions} value={selectedDataset} onChange={setSelectedDataset} className="w-full" />
              }
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: "var(--cl-font-secondary)" }}>Model *</label>
              {modelOptions.length === 0
                ? <p className="text-xs" style={{ color: "var(--cl-red)" }}>No models registered. Upload one first.</p>
                : <SelectList options={modelOptions} value={selectedModel} onChange={setSelectedModel} className="w-full" />
              }
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold" style={{ color: "var(--cl-font-secondary)" }}>Epochs</label>
            <InputText placeholder="e.g. 5" value={epochs} onChange={(e) => setEpochs(e.target.value)} />
            <p className="text-xs" style={{ color: "var(--cl-font-secondary)" }}>
              Use a small number (2–5) for demos, larger for real training.
            </p>
          </div>

          {createError && <p className="text-xs" style={{ color: "var(--cl-red)" }}>{createError}</p>}

          <div className="flex flex-row justify-end gap-2 mt-2">
            <Button label="Cancel" variant="secondary" onClick={() => { setModalOpen(false); resetForm(); }} />
            <Button label={creating ? "Starting..." : "Start Experiment"} ico={<SvgIcon name="play" />}
              disabled={creating} onClick={() => void handleCreate()} />
          </div>
        </div>
      </Modal>
    </main>
  );
}
