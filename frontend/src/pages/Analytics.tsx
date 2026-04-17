import { useState, useRef, useEffect } from "react";
import { Card } from "../components/Card";
import { InputText } from "../components/InputText";
import { SvgIcon } from "../components/SvgIcon";
import { Table } from "../components/Table";
import { Button } from "../components/Button";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as PieTooltip,
} from "recharts";

// --- mock data ---

const experiments = [
  { id: 1, name: "Exp 1 - ResNet MNIST", date: "2026-03-12" },
  { id: 2, name: "Exp 2 - VGG CIFAR", date: "2026-03-10" },
  { id: 3, name: "Exp 3 - UNet CIFAR", date: "2026-03-08" },
  { id: 4, name: "Exp 4 - ResNet CIFAR", date: "2026-03-06" },
];

// macro: resumen por entrenamiento (filas de la tabla)
const trainingsByExp: Record<number, any[]> = {
  1: [
    {
      id: "1a",
      date: "Mar 12",
      batch: 32,
      iou: 0.74,
      dice: 0.83,
      recall: 0.8,
      f1: 0.81,
      loss: 0.29,
      duration: "6m 32s",
      status: "Done",
    },
    {
      id: "1b",
      date: "Mar 10",
      batch: 64,
      iou: 0.68,
      dice: 0.77,
      recall: 0.73,
      f1: 0.75,
      loss: 0.38,
      duration: "5m 14s",
      status: "Done",
    },
  ],
  2: [
    {
      id: "2a",
      date: "Mar 10",
      batch: 64,
      iou: 0.63,
      dice: 0.74,
      recall: 0.7,
      f1: 0.72,
      loss: 0.43,
      duration: "5m 58s",
      status: "Done",
    },
    {
      id: "2b",
      date: "Mar 8",
      batch: 32,
      iou: 0.55,
      dice: 0.66,
      recall: 0.61,
      f1: 0.63,
      loss: 0.51,
      duration: "4m 02s",
      status: "Failed",
    },
  ],
  3: [
    {
      id: "3a",
      date: "Mar 8",
      batch: 16,
      iou: 0.8,
      dice: 0.88,
      recall: 0.85,
      f1: 0.86,
      loss: 0.24,
      duration: "15m 15s",
      status: "Done",
    },
  ],
  4: [
    {
      id: "4a",
      date: "Mar 6",
      batch: 128,
      iou: 0.5,
      dice: 0.62,
      recall: 0.57,
      f1: 0.59,
      loss: 0.58,
      duration: "1m 45s",
      status: "Failed",
    },
  ],
};

// micro: detalle época por época por training id
const epochsByTraining: Record<string, any[]> = {
  "1a": [
    { epoch: 1, dice: 0.72, f1: 0.7, iou: 0.61, precision: 0.73, recall: 0.68 },
    { epoch: 2, dice: 0.79, f1: 0.76, iou: 0.69, precision: 0.8, recall: 0.74 },
    { epoch: 3, dice: 0.83, f1: 0.81, iou: 0.74, precision: 0.85, recall: 0.8 },
  ],
  "1b": [
    {
      epoch: 1,
      dice: 0.65,
      f1: 0.63,
      iou: 0.55,
      precision: 0.67,
      recall: 0.61,
    },
    { epoch: 2, dice: 0.72, f1: 0.7, iou: 0.62, precision: 0.74, recall: 0.68 },
    {
      epoch: 3,
      dice: 0.77,
      f1: 0.75,
      iou: 0.68,
      precision: 0.79,
      recall: 0.73,
    },
  ],
  "2a": [
    { epoch: 1, dice: 0.6, f1: 0.58, iou: 0.5, precision: 0.62, recall: 0.56 },
    { epoch: 2, dice: 0.68, f1: 0.66, iou: 0.58, precision: 0.7, recall: 0.64 },
    { epoch: 3, dice: 0.74, f1: 0.72, iou: 0.63, precision: 0.76, recall: 0.7 },
  ],
  "2b": [
    { epoch: 1, dice: 0.55, f1: 0.52, iou: 0.44, precision: 0.57, recall: 0.5 },
    { epoch: 2, dice: 0.62, f1: 0.6, iou: 0.52, precision: 0.64, recall: 0.58 },
  ],
  "3a": [
    {
      epoch: 1,
      dice: 0.69,
      f1: 0.67,
      iou: 0.58,
      precision: 0.71,
      recall: 0.65,
    },
    {
      epoch: 2,
      dice: 0.77,
      f1: 0.75,
      iou: 0.67,
      precision: 0.79,
      recall: 0.73,
    },
    {
      epoch: 3,
      dice: 0.84,
      f1: 0.82,
      iou: 0.75,
      precision: 0.86,
      recall: 0.81,
    },
    { epoch: 4, dice: 0.88, f1: 0.86, iou: 0.8, precision: 0.9, recall: 0.85 },
  ],
  "4a": [
    { epoch: 1, dice: 0.62, f1: 0.59, iou: 0.5, precision: 0.64, recall: 0.57 },
  ],
};

const confusionByTraining: Record<string, number[][]> = {
  "1a": [
    [210, 18],
    [24, 198],
  ],
  "1b": [
    [195, 33],
    [41, 181],
  ],
  "2a": [
    [185, 43],
    [38, 184],
  ],
  "2b": [
    [160, 68],
    [72, 150],
  ],
  "3a": [
    [223, 11],
    [15, 201],
  ],
  "4a": [
    [180, 48],
    [62, 160],
  ],
};

const labelDistByTraining: Record<string, { name: string; value: number }[]> = {
  "1a": [
    { name: "Positive", value: 228 },
    { name: "Negative", value: 222 },
  ],
  "1b": [
    { name: "Positive", value: 236 },
    { name: "Negative", value: 214 },
  ],
  "2a": [
    { name: "Positive", value: 228 },
    { name: "Negative", value: 222 },
  ],
  "2b": [
    { name: "Positive", value: 228 },
    { name: "Negative", value: 222 },
  ],
  "3a": [
    { name: "Positive", value: 238 },
    { name: "Negative", value: 216 },
  ],
  "4a": [
    { name: "Positive", value: 242 },
    { name: "Negative", value: 208 },
  ],
};

const PIE_COLORS = ["#0f92f7", "#a855f7"]; // azul + púrpura;

// --- sub components ---

const statusStyles: Record<string, { bg: string; color: string }> = {
  done: { bg: "var(--bg-green)", color: "var(--cl-green)" },
  failed: { bg: "var(--bg-red)", color: "var(--cl-red)" },
};

const textRender = (value: any) => <span className="font-medium">{value}</span>;

function ConfusionMatrix({ matrix }: { matrix: number[][] }) {
  const labels = ["Positive", "Negative"];
  const max = Math.max(...matrix.flat());

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-row gap-1 ml-20">
        {labels.map((l) => (
          <div
            key={l}
            className="flex-1 text-center text-xs font-semibold"
            style={{ color: "var(--cl-font-secondary)" }}
          >
            {l}
          </div>
        ))}
      </div>
      {matrix.map((row, i) => (
        <div key={i} className="flex flex-row items-center gap-1">
          <div
            className="w-20 text-xs font-semibold text-right pr-2"
            style={{ color: "var(--cl-font-secondary)" }}
          >
            {labels[i]}
          </div>
          {row.map((val, j) => {
            const intensity = val / max;
            const isCorrect = i === j;
            return (
              <div
                key={j}
                className="flex-1 h-20 flex flex-col items-center justify-center rounded-lg gap-1"
                style={{
                  background: isCorrect
                    ? `rgba(15, 146, 247, ${0.2 + intensity * 0.6})`
                    : `rgba(15, 146, 247, ${0.05})`,
                  border: isCorrect
                    ? "1px solid var(--cl-blue)"
                    : "1px solid var(--cl-border)",
                }}
              >
                <span
                  className="text-lg font-bold"
                  style={{ color: "var(--cl-font-primary)" }}
                >
                  {val}
                </span>
                <span
                  className="text-xs"
                  style={{ color: "var(--cl-font-secondary)" }}
                >
                  {((val / row.reduce((a, b) => a + b, 0)) * 100).toFixed(1)}%
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
      <p
        className="text-xs font-semibold mb-2"
        style={{ color: "var(--cl-font-secondary)" }}
      >
        Label Distribution
      </p>
      <div className="relative">
        <ResponsiveContainer width={160} height={160}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={75}
              dataKey="value"
              strokeWidth={0}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
            <PieTooltip
              contentStyle={{
                background: "var(--bg-frame)",
                border: "1px solid var(--cl-border)",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value: number, name: string) => [
                `${((value / total) * 100).toFixed(1)}%`,
                name,
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span
            className="text-lg font-bold"
            style={{ color: "var(--cl-font-primary)" }}
          >
            {total}
          </span>
          <span
            className="text-xs"
            style={{ color: "var(--cl-font-secondary)" }}
          >
            samples
          </span>
        </div>
      </div>
      <div className="flex flex-row gap-3 mt-2">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center gap-1">
            <div
              className="w-2 h-2 rounded-full"
              style={{ background: PIE_COLORS[i] }}
            />
            <span
              className="text-xs"
              style={{ color: "var(--cl-font-secondary)" }}
            >
              {d.name} {((d.value / total) * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- main page ---

export default function Analytics() {
  const mostRecent = experiments.reduce((a, b) => (a.date > b.date ? a : b));
  const [selectedExp, setSelectedExp] = useState(mostRecent);
  const [selectedTraining, setSelectedTraining] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [dropOpen, setDropOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const trainings = trainingsByExp[selectedExp.id] ?? [];
  const activeId = selectedTraining ?? trainings[0]?.id ?? null;
  const epochData = activeId ? epochsByTraining[activeId] ?? [] : [];
  const confMatrix = activeId
    ? confusionByTraining[activeId] ?? [
        [0, 0],
        [0, 0],
      ]
    : [
        [0, 0],
        [0, 0],
      ];
  const labelDist = activeId ? labelDistByTraining[activeId] ?? [] : [];

  const filtered = experiments.filter((e) =>
    e.name.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    setSelectedTraining(null);
  }, [selectedExp]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setDropOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const historyColumns = [
    { key: "date", label: "Date", render: textRender },
    { key: "batch", label: "Batch", render: textRender },
    { key: "iou", label: "IoU", render: textRender },
    { key: "dice", label: "Dice", render: textRender },
    { key: "recall", label: "Recall", render: textRender },
    { key: "f1", label: "F1", render: textRender },
    { key: "loss", label: "Loss", render: textRender },
    { key: "duration", label: "Duration", render: textRender },
    {
      key: "status",
      label: "Status",
      render: (value: string) => {
        const style = statusStyles[value.toLowerCase()] ?? {
          bg: "var(--bg-white)",
          color: "var(--cl-white)",
        };
        return (
          <div
            className="px-2 py-1 rounded-md text-xs w-fit font-bold"
            style={{
              background: style.bg,
              color: style.color,
              border: `1px solid ${style.color}`,
            }}
          >
            {value}
          </div>
        );
      },
    },
    {
      key: "id",
      label: "",
      render: (_: any, row: any) => (
        <Button
          variant="transparent"
          ico={<SvgIcon name="chart-spline" />}
          onClick={() => setSelectedTraining(row.id)}
        />
      ),
    },
  ];

  return (
    <main className="flex-1 overflow-y-auto p-6 bg-[var(--bg-page-user)]">
      {/* header */}
      <div className="flex flex-col mb-6">
        <h1 className="text-2xl text-[var(--cl-font-primary)] font-semibold">
          Analytics
        </h1>
        <p className="text-sm text-[var(--cl-font-secondary)]">
          Explore training history and model performance
        </p>
      </div>

      {/* search */}
      <div ref={searchRef} className="relative mb-6">
        <InputText
          placeholder="Search experiment..."
          ico={<SvgIcon name="search" />}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setDropOpen(true);
          }}
        />
        {dropOpen && filtered.length > 0 && (
          <div
            className="absolute z-10 mt-1 w-full rounded-lg overflow-hidden border"
            style={{
              background: "var(--bg-list)",
              borderColor: "var(--cl-border)",
            }}
          >
            {filtered.map((exp) => (
              <button
                key={exp.id}
                onClick={() => {
                  setSelectedExp(exp);
                  setQuery(exp.name);
                  setDropOpen(false);
                }}
                className="w-full text-left px-4 py-2 text-sm transition-colors duration-200"
                style={{ color: "var(--cl-font-primary)" }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "var(--bg-input-hover)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                {exp.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* macro table */}
      <Card title="Training History" className="mb-4">
        <p
          className="text-xs mb-4 font-semibold"
          style={{ color: "var(--cl-font-secondary)" }}
        >
          Experiment:{" "}
          <span style={{ color: "var(--cl-blue)" }}>{selectedExp.name}</span>
          {activeId && (
            <>
              {" "}
              &nbsp;·&nbsp; Training:{" "}
              <span style={{ color: "var(--cl-blue)" }}>{activeId}</span>
            </>
          )}
        </p>
        <Table columns={historyColumns} data={trainings} />
      </Card>

      {/* micro charts */}
      <div className="grid grid-cols-2 gap-4">
        <Card title="Metrics vs Epoch">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={epochData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--cl-border)" />
              <XAxis
                dataKey="epoch"
                tick={{ fontSize: 11, fill: "var(--cl-font-secondary)" }}
                label={{
                  value: "Epoch",
                  position: "insideBottom",
                  offset: -2,
                  fill: "var(--cl-font-secondary)",
                  fontSize: 11,
                }}
              />
              <YAxis
                domain={[0, 1]}
                tick={{ fontSize: 11, fill: "var(--cl-font-secondary)" }}
                label={{
                  value: "Score",
                  angle: -90,
                  position: "insideLeft",
                  fill: "var(--cl-font-secondary)",
                  fontSize: 11,
                }}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--bg-frame)",
                  border: "1px solid var(--cl-border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="dice"
                stroke="pink"
                name="Dice"
                dot={false}
                strokeWidth={2}
              />{" "}
              {/* --cl-blue   */}
              <Line
                type="monotone"
                dataKey="f1"
                stroke="#0f92f7"
                name="F1"
                dot={false}
                strokeWidth={2}
              />{" "}
              {/* --cl-green  */}
              <Line
                type="monotone"
                dataKey="iou"
                stroke="#ce9200"
                name="IoU"
                dot={false}
                strokeWidth={2}
              />{" "}
              {/* --cl-yellow */}
              <Line
                type="monotone"
                dataKey="precision"
                stroke="purple"
                name="Precision"
                dot={false}
                strokeWidth={2}
              />{" "}
              {/* --cl-red    */}
              <Line
                type="monotone"
                dataKey="recall"
                stroke="#008d00"
                name="Recall"
                dot={false}
                strokeWidth={2}
              />{" "}
              {/* --cl-white  */}
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Confusion Matrix">
          <div className="flex flex-row gap-4 items-center">
            <div className="flex-1">
              <ConfusionMatrix matrix={confMatrix} />
            </div>
            <div
              className="w-44 border-l pl-4"
              style={{ borderColor: "var(--cl-border)" }}
            >
              <LabelPieChart data={labelDist} />
            </div>
          </div>
        </Card>
      </div>
    </main>
  );
}
