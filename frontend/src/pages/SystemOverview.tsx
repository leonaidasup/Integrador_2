import { useState } from "react";
import { Card } from "../components/Card";
import { Table } from "../components/Table";
import { SvgIcon } from "../components/SvgIcon";
import { InputText } from "../components/InputText";
import { SelectList } from "../components/SelectList";

const activityLog = [
  {
    timestamp: "Mar 14, 14:02",
    event: "Model Training",
    type: "Training",
    user: "john@app.com",
    description: "Started ResNet training on CIFAR",
    status: "Running",
  },
  {
    timestamp: "Mar 14, 13:45",
    event: "GPU Overflow",
    type: "Error",
    user: "system",
    description: "GPU memory overflow on node-02",
    status: "Failed",
  },
  {
    timestamp: "Mar 14, 13:21",
    event: "Dataset Upload",
    type: "Storage",
    user: "ana@app.com",
    description: "Uploaded Cell Microscopy v2 (4.2 GB)",
    status: "Done",
  },
  {
    timestamp: "Mar 14, 12:40",
    event: "Inference Timeout",
    type: "Error",
    user: "system",
    description: "Request timeout after 30s on model v3",
    status: "Failed",
  },
  {
    timestamp: "Mar 14, 12:10",
    event: "User Login",
    type: "Auth",
    user: "luis@app.com",
    description: "Successful login from 192.168.1.42",
    status: "Done",
  },
  {
    timestamp: "Mar 14, 11:42",
    event: "DB Pool Error",
    type: "Error",
    user: "system",
    description: "Connection pool exhausted (limit: 20)",
    status: "Failed",
  },
  {
    timestamp: "Mar 14, 11:05",
    event: "Model Deployed",
    type: "Deploy",
    user: "ana@app.com",
    description: "CellSegNet v2.3 deployed to production",
    status: "Done",
  },
  {
    timestamp: "Mar 14, 10:30",
    event: "Experiment Done",
    type: "Training",
    user: "john@app.com",
    description: "VGG experiment completed — F1: 0.87",
    status: "Done",
  },
];

const errors = [
  {
    label: "GPU Memory Overflow",
    count: 7,
    last: "Mar 14, 13:45",
    icon: "cpu",
  },
  {
    label: "Inference Timeout",
    count: 1,
    last: "Mar 14, 12:40",
    icon: "pause",
  },
  {
    label: "DB Connection Pool",
    count: 3,
    last: "Mar 14, 11:42",
    icon: "database",
  },
];

const statusStyles: Record<string, { bg: string; color: string }> = {
  running: { bg: "var(--bg-blue)", color: "var(--cl-blue)" },
  done: { bg: "var(--bg-green)", color: "var(--cl-green)" },
  failed: { bg: "var(--bg-red)", color: "var(--cl-red)" },
};

const typeStyles: Record<string, { bg: string; color: string }> = {
  training: { bg: "var(--bg-blue)", color: "var(--cl-blue)" },
  error: { bg: "var(--bg-red)", color: "var(--cl-red)" },
  storage: { bg: "var(--bg-yellow)", color: "var(--cl-yellow)" },
  auth: { bg: "var(--bg-green)", color: "var(--cl-green)" },
  deploy: { bg: "var(--bg-blue)", color: "var(--cl-blue)" },
};

const textRender = (value: any) => (
  <span className="font-medium text-sm">{value}</span>
);

const columns = [
  { key: "timestamp", label: "Timestamp", render: textRender },
  { key: "event", label: "Event", render: textRender },
  {
    key: "type",
    label: "Type",
    render: (value: string) => {
      const style = typeStyles[value.toLowerCase()] ?? {
        bg: "var(--bg-tables-selector)",
        color: "var(--cl-font-secondary)",
      };
      return (
        <div
          className="px-2 py-0.5 rounded-md text-xs w-fit font-bold"
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
  { key: "user", label: "User", render: textRender },
  { key: "description", label: "Description", render: textRender },
  {
    key: "status",
    label: "Status",
    render: (value: string) => {
      const style = statusStyles[value.toLowerCase()] ?? {
        bg: "var(--bg-tables-selector)",
        color: "var(--cl-font-secondary)",
      };
      return (
        <div
          className="px-2 py-0.5 rounded-md text-xs w-fit font-bold"
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
];

function Gauge({
  label,
  value,
  max,
  unit,
  color,
}: {
  label: string;
  value: number;
  max: number;
  unit: string;
  color: string;
}) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-row items-center justify-between">
        <p
          className="text-sm font-semibold"
          style={{ color: "var(--cl-font-primary)" }}
        >
          {label}
        </p>
        <p className="text-sm font-bold" style={{ color }}>
          {value}
          {unit} / {max}
          {unit}
        </p>
      </div>
      <div
        className="h-3 rounded-full overflow-hidden"
        style={{ background: "var(--cl-border)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <p className="text-xs" style={{ color: "var(--cl-font-secondary)" }}>
        {pct.toFixed(1)}% used
      </p>
    </div>
  );
}

// --- main page ---
export default function SystemOverview() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const filterOptions = [
    { label: "All", value: "all" },
    { label: "Training", value: "training" },
    { label: "Error", value: "error" },
    { label: "Storage", value: "storage" },
    { label: "Auth", value: "auth" },
    { label: "Deploy", value: "deploy" },
  ];

  const filteredLog = activityLog.filter((row) => {
    const matchesFilter = filter === "all" || row.type.toLowerCase() === filter;
    const q = search.toLowerCase();
    const matchesSearch =
      !search ||
      row.event.toLowerCase().includes(q) ||
      row.user.toLowerCase().includes(q) ||
      row.description.toLowerCase().includes(q) ||
      row.status.toLowerCase().includes(q);
    return matchesFilter && matchesSearch;
  });

  return (
    <main className="flex-1 overflow-y-auto p-6 bg-[var(--bg-page-user)]">
      {/* header */}
      <div className="flex flex-col mb-6">
        <h1 className="text-2xl text-[var(--cl-font-primary)] font-semibold">
          System Overview
        </h1>
        <p className="text-sm text-[var(--cl-font-secondary)]">
          Monitor infrastructure and platform activity
        </p>
      </div>

      {/* resource cards */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <Card title="CPU & GPU Usage">
          <div className="flex flex-col gap-4">
            <Gauge
              label="CPU Usage"
              value={62}
              max={100}
              unit="%"
              color="var(--cl-blue)"
            />
            <Gauge
              label="GPU Memory"
              value={10.4}
              max={16}
              unit="GB"
              color="var(--cl-yellow)"
            />
            <Gauge
              label="RAM"
              value={28}
              max={64}
              unit="GB"
              color="var(--cl-green)"
            />
          </div>
        </Card>

        <Card title="Database Storage">
          <div className="flex flex-col gap-4">
            <Gauge
              label="Datasets"
              value={842}
              max={2000}
              unit="GB"
              color="var(--cl-blue)"
            />
            <Gauge
              label="Models"
              value={124}
              max={500}
              unit="GB"
              color="var(--cl-yellow)"
            />
            <Gauge
              label="Logs & Cache"
              value={18}
              max={100}
              unit="GB"
              color="var(--cl-green)"
            />
          </div>
        </Card>
      </div>

      {/* errors last 7 days */}
      <Card title="Errors — Last 7 Days" className="mb-4">
        <div className="flex flex-col gap-2">
          {errors.map((err) => (
            <div
              key={err.label}
              className="flex flex-row items-center justify-between px-4 py-3 rounded-lg"
              style={{
                border: "1px solid var(--cl-border)",
              }}
            >
              <div className="flex flex-row items-center gap-3">
                <div
                  className="w-8 h-8 rounded-md flex items-center justify-center"
                  style={{
                    background: "var(--bg-red)",
                    border: "1px solid var(--cl-red)",
                  }}
                >
                  <SvgIcon
                    name={err.icon}
                    className="text-[var(--cl-red)]"
                    size="w-4 h-4"
                  />
                </div>
                <p
                  className="text-sm font-semibold"
                  style={{ color: "var(--cl-font-primary)" }}
                >
                  {err.label}
                </p>
              </div>
              <div className="flex flex-row items-center gap-6">
                <div
                  className="px-2 py-0.5 rounded-md text-xs font-bold"
                  style={{
                    background: "var(--bg-red)",
                    color: "var(--cl-red)",
                    border: "1px solid var(--cl-red)",
                  }}
                >
                  {err.count}
                </div>
                <p
                  className="text-xs"
                  style={{ color: "var(--cl-font-secondary)" }}
                >
                  Last: {err.last}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* activity log */}
      <Card title="Activity Log">
        <div className="flex flex-row items-center gap-2 mb-4">
          <InputText
            placeholder="Search by event, user, description..."
            ico={<SvgIcon name="search" />}
            className="w-2/4"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <SvgIcon
            name="sliders-horizontal"
            className="text-[var(--cl-font-primary)]"
            size="w-5 h-5"
          />
          <SelectList
            options={filterOptions}
            value={filter}
            onChange={setFilter}
          />
        </div>
        <Table columns={columns} data={filteredLog} />
      </Card>
    </main>
  );
}
