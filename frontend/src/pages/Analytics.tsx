import { useState, useRef, useEffect, useCallback } from "react";
import { Card } from "../components/Card";
import { InputText } from "../components/InputText";
import { SvgIcon } from "../components/SvgIcon";
import { Table } from "../components/Table";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
  PieChart, Pie, Cell, Tooltip as PieTooltip,
} from "recharts";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem("auth_token") ?? ""}` };
}

// ── Types ──────────────────────────────────────────────────────────────────
interface EpochData   { epoch: number; dice?: number; f1?: number; iou?: number; precision?: number; recall?: number; loss?: number; }
interface TrainingRun { id: string; date: string; batch: number; iou: number; dice: number; recall: number; f1: number; loss: number; duration: string; status: string; epochs?: EpochData[]; confusion?: number[][]; label_dist?: { name: string; value: number }[]; }
interface Experiment  { id: string; name: string; model_id: string; dataset_id: string; status: string; results?: { trainings?: TrainingRun[] } | null; created_at: string; updated_at: string; }

// ── Constants ─────────────────────────────────────────────────────────────
const PIE_COLORS = ["#0f92f7", "#a855f7"];
const METRIC_COLORS: Record<string, string> = { dice: "#00c896", f1: "#0f92f7", iou: "#ce9200", precision: "#a855f7", recall: "#f43f5e" };
const METRICS = ["dice", "f1", "iou", "precision", "recall"];
const statusStyles: Record<string, { bg: string; color: string }> = {
  done:      { bg: "var(--bg-green)",  color: "var(--cl-green)"  },
  completed: { bg: "var(--bg-green)",  color: "var(--cl-green)"  },
  failed:    { bg: "var(--bg-red)",    color: "var(--cl-red)"    },
  running:   { bg: "var(--bg-blue)",   color: "var(--cl-blue)"   },
  pending:   { bg: "var(--bg-yellow)", color: "var(--cl-yellow)" },
  paused:    { bg: "var(--bg-yellow)", color: "var(--cl-yellow)" },
};

const textRender = (v: unknown) => <span className="font-medium">{String(v ?? "-")}</span>;

function calcStats(data: EpochData[], key: string) {
  const values = data.map(d => (d as Record<string,number>)[key] ?? 0);
  const mean = values.reduce((a, b) => a + b, 0) / (values.length || 1);
  const std  = Math.sqrt(values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (values.length || 1));
  return { mean, std };
}

// ── Sub-components ─────────────────────────────────────────────────────────
function MetricDetailChart({ data, metric }: { data: EpochData[]; metric: string }) {
  const { mean, std } = calcStats(data, metric);
  const color = METRIC_COLORS[metric];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-row items-center justify-between">
        <p className="text-sm font-semibold capitalize" style={{ color: "var(--cl-font-primary)" }}>{metric}</p>
        <div className="flex flex-row gap-4">
          {[["Mean", mean], ["Std Dev", std]].map(([label, val]) => (
            <div key={String(label)} className="flex flex-col items-end">
              <p className="text-xs" style={{ color: "var(--cl-font-secondary)" }}>{String(label)}</p>
              <p className="text-sm font-bold" style={{ color }}>{(val as number).toFixed(3)}</p>
            </div>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--cl-border)" />
          <XAxis dataKey="epoch" tick={{ fontSize: 10, fill: "var(--cl-font-secondary)" }} />
          <YAxis domain={[0, 1]} tick={{ fontSize: 10, fill: "var(--cl-font-secondary)" }} />
          <Tooltip contentStyle={{ background: "var(--bg-frame)", border: "1px solid var(--cl-border)", borderRadius: 8, fontSize: 11 }} />
          <ReferenceLine y={mean} stroke={color} strokeDasharray="4 4" strokeOpacity={0.8} label={{ value: "μ", fill: color, fontSize: 10 }} />
          <ReferenceLine y={mean + std} stroke={color} strokeDasharray="2 4" strokeOpacity={0.4} label={{ value: "+σ", fill: color, fontSize: 10 }} />
          <ReferenceLine y={mean - std} stroke={color} strokeDasharray="2 4" strokeOpacity={0.4} label={{ value: "-σ", fill: color, fontSize: 10 }} />
          <Line type="monotone" dataKey={metric} stroke={color} strokeWidth={2} dot={{ fill: color, r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ConfusionMatrix({ matrix }: { matrix: number[][] }) {
  const labels = ["Positive", "Negative"];
  const max = Math.max(...matrix.flat(), 1);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-row gap-1 ml-20">
        {labels.map(l => <div key={l} className="flex-1 text-center text-xs font-semibold" style={{ color: "var(--cl-font-secondary)" }}>{l}</div>)}
      </div>
      {matrix.map((row, i) => (
        <div key={i} className="flex flex-row items-center gap-1">
          <div className="w-20 text-xs font-semibold text-right pr-2" style={{ color: "var(--cl-font-secondary)" }}>{labels[i]}</div>
          {row.map((val, j) => {
            const intensity = val / max;
            const isCorrect = i === j;
            return (
              <div key={j} className="flex-1 h-20 flex flex-col items-center justify-center rounded-lg gap-1"
                style={{ background: isCorrect ? `rgba(15,146,247,${0.2 + intensity * 0.6})` : "rgba(15,146,247,0.05)", border: isCorrect ? "1px solid var(--cl-blue)" : "1px solid var(--cl-border)" }}>
                <span className="text-lg font-bold" style={{ color: "var(--cl-font-primary)" }}>{val}</span>
                <span className="text-xs" style={{ color: "var(--cl-font-secondary)" }}>
                  {((val / (row.reduce((a, b) => a + b, 0) || 1)) * 100).toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function LabelPieChart({ data }: { data: { name: string; value: number }[] }) {
  const total = data.reduce((a, b) => a + b.value, 0);
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <p className="text-xs font-semibold mb-2" style={{ color: "var(--cl-font-secondary)" }}>Label Distribution</p>
      <div className="relative">
        <ResponsiveContainer width={160} height={160}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value" strokeWidth={0}>
              {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
            </Pie>
            <PieTooltip contentStyle={{ background: "var(--bg-frame)", border: "1px solid var(--cl-border)", borderRadius: 8, fontSize: 12 }}
              formatter={(value, name) => {
                const v = typeof value === "number" ? value : Number(value ?? 0);
                return [`${total > 0 ? ((v / total) * 100).toFixed(1) : 0}%`, String(name ?? "")];
              }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-lg font-bold" style={{ color: "var(--cl-font-primary)" }}>{total}</span>
          <span className="text-xs" style={{ color: "var(--cl-font-secondary)" }}>samples</span>
        </div>
      </div>
      <div className="flex flex-row gap-3 mt-2">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ background: PIE_COLORS[i] }} />
            <span className="text-xs" style={{ color: "var(--cl-font-secondary)" }}>{d.name} {total > 0 ? ((d.value / total) * 100).toFixed(1) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────
export default function Analytics() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedExp, setSelectedExp] = useState<Experiment | null>(null);
  const [selectedTrainingId, setSelectedTrainingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [dropOpen, setDropOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const loadExperiments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/experiments`, { headers: authHeaders() });
      const data = await res.json();
      if (res.ok) {
        const exps: Experiment[] = data.experiments ?? [];
        setExperiments(exps);
        if (!selectedExp && exps.length > 0) {
          const latest = exps.reduce((a, b) => a.updated_at > b.updated_at ? a : b);
          setSelectedExp(latest);
          setQuery(latest.name);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadExperiments(); }, [loadExperiments]);

  useEffect(() => { setSelectedTrainingId(null); }, [selectedExp]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setDropOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const trainings: TrainingRun[] = selectedExp?.results?.trainings ?? [];
  const activeTraining = trainings.find(t => t.id === selectedTrainingId) ?? trainings[0] ?? null;
  const epochData: EpochData[] = activeTraining?.epochs ?? [];
  const confMatrix = activeTraining?.confusion ?? [[0, 0], [0, 0]];
  const labelDist  = activeTraining?.label_dist ?? [];

  const filtered = experiments.filter(e => e.name.toLowerCase().includes(query.toLowerCase()));

  const historyColumns = [
    { key: "date",     label: "Date",     render: textRender },
    { key: "batch",    label: "Batch",    render: textRender },
    { key: "iou",      label: "IoU",      render: textRender },
    { key: "dice",     label: "Dice",     render: textRender },
    { key: "recall",   label: "Recall",   render: textRender },
    { key: "f1",       label: "F1",       render: textRender },
    { key: "loss",     label: "Loss",     render: textRender },
    { key: "duration", label: "Duration", render: textRender },
    {
      key: "status", label: "Status",
      render: (v: unknown) => {
        const style = statusStyles[String(v).toLowerCase()] ?? { bg: "var(--bg-white)", color: "var(--cl-white)" };
        return <div className="px-2 py-1 rounded-md text-xs w-fit font-bold" style={{ background: style.bg, color: style.color, border: `1px solid ${style.color}` }}>{String(v)}</div>;
      },
    },
    {
      key: "id", label: "",
      render: (_: unknown, row: Record<string, unknown>) => (
        <Button variant="transparent" ico={<SvgIcon name="chart-spline" />}
          onClick={() => setSelectedTrainingId(String(row.id))} />
      ),
    },
  ];

  return (
    <main className="flex-1 overflow-y-auto p-6 bg-[var(--bg-page-user)]">
      <div className="flex flex-col mb-6">
        <h1 className="text-2xl text-[var(--cl-font-primary)] font-semibold">Analytics</h1>
        <p className="text-sm text-[var(--cl-font-secondary)]">Explore training history and model performance</p>
      </div>

      <div ref={searchRef} className="relative mb-6">
        <InputText placeholder="Search experiment..." ico={<SvgIcon name="search" />}
          value={query}
          onChange={e => { setQuery(e.target.value); setDropOpen(true); }} />
        {dropOpen && filtered.length > 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-lg overflow-hidden border"
            style={{ background: "var(--bg-list)", borderColor: "var(--cl-border)" }}>
            {filtered.map(exp => (
              <button key={exp.id} onClick={() => { setSelectedExp(exp); setQuery(exp.name); setDropOpen(false); }}
                className="w-full text-left px-4 py-2 text-sm transition-colors duration-200"
                style={{ color: "var(--cl-font-primary)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-input-hover)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                <span>{exp.name}</span>
                <span className="ml-2 text-xs" style={{ color: "var(--cl-font-secondary)" }}>— {exp.status}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && <p className="text-xs mb-4" style={{ color: "var(--cl-font-secondary)" }}>Loading experiments…</p>}

      {!loading && experiments.length === 0 && (
        <p className="text-sm text-center py-12" style={{ color: "var(--cl-font-secondary)" }}>
          No experiments yet. Create one from the Experiments page.
        </p>
      )}

      {selectedExp && (
        <>
          <Card title="Training History" className="mb-4">
            <p className="text-xs mb-4 font-semibold" style={{ color: "var(--cl-font-secondary)" }}>
              Experiment: <span style={{ color: "var(--cl-blue)" }}>{selectedExp.name}</span>
              {activeTraining && <> &nbsp;·&nbsp; Training: <span style={{ color: "var(--cl-blue)" }}>{activeTraining.id}</span></>}
            </p>
            {trainings.length === 0
              ? <p className="text-xs" style={{ color: "var(--cl-font-secondary)" }}>No training runs recorded yet.</p>
              : <Table columns={historyColumns} data={trainings as unknown as Record<string, unknown>[]} />}
          </Card>

          <div className="grid grid-cols-2 gap-4">
            <Card title="Metrics vs Epoch">
              <div className="flex flex-row items-center justify-between mb-3">
                <p className="text-xs" style={{ color: "var(--cl-font-secondary)" }}>Overview</p>
                <Button label="Detail" ico={<SvgIcon name="expand" />} onClick={() => setDetailOpen(true)} />
              </div>
              {epochData.length === 0
                ? <p className="text-xs py-8 text-center" style={{ color: "var(--cl-font-secondary)" }}>No epoch data available.</p>
                : (
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={epochData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--cl-border)" />
                      <XAxis dataKey="epoch" tick={{ fontSize: 11, fill: "var(--cl-font-secondary)" }} label={{ value: "Epoch", position: "insideBottom", offset: -2, fill: "var(--cl-font-secondary)", fontSize: 11 }} />
                      <YAxis domain={[0, 1]} tick={{ fontSize: 11, fill: "var(--cl-font-secondary)" }} label={{ value: "Score", angle: -90, position: "insideLeft", fill: "var(--cl-font-secondary)", fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: "var(--bg-frame)", border: "1px solid var(--cl-border)", borderRadius: 8, fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {METRICS.map(m => <Line key={m} type="monotone" dataKey={m} stroke={METRIC_COLORS[m]} name={m.charAt(0).toUpperCase() + m.slice(1)} dot={false} strokeWidth={2} />)}
                    </LineChart>
                  </ResponsiveContainer>
                )}
            </Card>

            <Card title="Confusion Matrix">
              <div className="flex flex-row gap-4 items-center">
                <div className="flex-1"><ConfusionMatrix matrix={confMatrix} /></div>
                <div className="w-44 border-l pl-4" style={{ borderColor: "var(--cl-border)" }}>
                  <LabelPieChart data={labelDist} />
                </div>
              </div>
            </Card>
          </div>
        </>
      )}

      <Modal open={detailOpen} onClose={() => setDetailOpen(false)} title="Metrics Detail"
        description="Per-metric curves with mean and standard deviation" icon="chart-spline">
        <div className="flex flex-col gap-6">
          {epochData.length === 0
            ? <p className="text-sm text-center" style={{ color: "var(--cl-font-secondary)" }}>No data available</p>
            : METRICS.map(m => (
              <div key={m} style={{ borderBottom: "1px solid var(--cl-border)", paddingBottom: "1.5rem" }}>
                <MetricDetailChart data={epochData} metric={m} />
              </div>
            ))}
        </div>
      </Modal>
    </main>
  );
}
