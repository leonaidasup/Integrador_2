import { useState } from "react";
import { Button } from "../components/Button";
import { SvgIcon } from "../components/SvgIcon";
import { InputText } from "../components/InputText";
import { Card } from "../components/Card";
import { SummaryCard } from "../components/SummaryCard";
import { SelectList } from "../components/SelectList";
import { Table } from "../components/Table";
import { Modal } from "../components/Modal";

const summaryExperiments = {
  Total: 6,
  Completed: 3,
  Running: 1,
  Failed: 1,
};

const statusStyles: Record<string, { bg: string; color: string }> = {
  running: { bg: "var(--bg-blue)", color: "var(--cl-blue)" },
  complete: { bg: "var(--bg-green)", color: "var(--cl-green)" },
  pause: { bg: "var(--bg-yellow)", color: "var(--cl-yellow)" },
  failed: { bg: "var(--bg-red)", color: "var(--cl-red)" },
};

const data = [
  {
    experiment: "Exp 1",
    dataset: "MNIST",
    model: "ResNet",
    optimizer: "Adam",
    metric: 0.94,
    loss: "CrossEntropy",
    progress: 72,
    status: "Running",
  },
  {
    experiment: "Exp A2",
    dataset: "CIFAR",
    model: "VGG",
    optimizer: "SGD",
    metric: 0.87,
    loss: "MSE",
    progress: 100,
    status: "Complete",
  },
  {
    experiment: "Exp 3",
    dataset: "CIFAR",
    model: "VGG",
    optimizer: "SGD",
    metric: 0.87,
    loss: "MSE",
    progress: 90,
    status: "Pause",
  },
  {
    experiment: "Exp 4",
    dataset: "CIFAR",
    model: "VGG",
    optimizer: "SGD",
    metric: 0.87,
    loss: "MSE",
    progress: 20,
    status: "Failed",
  },
];

export default function Experiments() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<any>(null);
  const [sort, setSort] = useState("name");

  const [model, setModel] = useState("resnet");
  const [dataset, setDataset] = useState("mnist");
  const [metric, setMetric] = useState("accuracy");
  const [loss, setLoss] = useState("crossentropy");
  const [batch, setBatch] = useState("32");
  const [imbalanced, setImbalanced] = useState(false);

  const [search, setSearch] = useState("");
  const filteredData = data
    .filter((row) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        row.experiment.toLowerCase().includes(q) ||
        row.dataset.toLowerCase().includes(q) ||
        row.model.toLowerCase().includes(q) ||
        row.optimizer.toLowerCase().includes(q) ||
        row.loss.toLowerCase().includes(q) ||
        row.status.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      switch (sort) {
        case "name":
          return a.experiment.localeCompare(b.experiment);
        case "progress":
          return b.progress - a.progress;
        case "metric":
          return b.metric - a.metric;
        case "date":
          return a.experiment.localeCompare(b.experiment); // cambia por fecha real cuando tengas
        default:
          return 0;
      }
    });

  const modelOptions = [
    { label: "ResNet", value: "resnet" },
    { label: "VGG", value: "vgg" },
    { label: "U-Net", value: "unet" },
  ];
  const datasetOptions = [
    { label: "MNIST", value: "mnist" },
    { label: "CIFAR", value: "cifar" },
    { label: "ImageNet", value: "imagenet" },
  ];
  const metricOptions = [
    { label: "Accuracy", value: "accuracy" },
    { label: "F1 Score", value: "f1" },
    { label: "AUC", value: "auc" },
  ];
  const lossOptions = [
    { label: "CrossEntropy", value: "crossentropy" },
    { label: "MSE", value: "mse" },
    { label: "BCE", value: "bce" },
  ];
  const batchOptions = [
    { label: "16", value: "16" },
    { label: "32", value: "32" },
    { label: "64", value: "64" },
    { label: "128", value: "128" },
  ];

  const sortOptions = [
    { label: "All", value: "all" },
    { label: "Name A-Z", value: "name" },
    { label: "Date", value: "date" },
    { label: "Progress", value: "progress" },
    { label: "Metric Score", value: "metric" },
  ];

  const textRender = (value: any) => (
    <span className="font-medium">{value}</span>
  );

  const columns = [
    { key: "experiment", label: "Experiment", render: textRender },
    { key: "dataset", label: "Dataset", render: textRender },
    { key: "model", label: "Model", render: textRender },
    { key: "optimizer", label: "Optimization", render: textRender },
    { key: "metric", label: "Metric Score", render: textRender },
    { key: "loss", label: "Loss Function", render: textRender },
    {
      key: "progress",
      label: "Progress",
      render: (value: number) => (
        <div className="flex items-center gap-2">
          <div
            className="flex-1 h-2 rounded-full overflow-hidden"
            style={{ background: "var(--bg-blue)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${value}%`, background: "var(--cl-blue)" }}
            />
          </div>
          <span className="text-xs w-8 text-right">{value}%</span>
        </div>
      ),
    },
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
      key: "actions",
      label: "",
      render: (_: any, row: any) => (
        <Button
          variant="transparent"
          ico={<SvgIcon name="ellipsis" />}
          onClick={() => {
            setSelectedRow(row);
            setEditModalOpen(true);
          }}
        />
      ),
    },
  ];

  return (
    <main className="flex-1 overflow-y-auto p-6 bg-[var(--bg-page-user)]">
      <div className="flex flex-row items-center justify-between">
        <div className="flex flex-col justify-between mb-6">
          <h1 className="text-2xl text-[var(--cl-font-primary)] font-semibold">
            Experiments
          </h1>
          <p className="text-sm text-[var(--cl-font-secondary)]">
            Track and manage your segmentation experiments
          </p>
        </div>
        <Button
          label="New Experiment"
          className="h-min"
          ico={<SvgIcon name="plus" />}
          onClick={() => setModalOpen(true)}
        />
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card hoverable>
          <SummaryCard
            label="Total"
            value={summaryExperiments["Total"]}
            icon="search"
            classNameValue="text-[var(--cl-white)]"
          />
        </Card>
        <Card hoverable>
          <SummaryCard
            label="Completed"
            value={summaryExperiments["Completed"]}
            icon="circle-check-big"
            classNameValue="text-[var(--cl-green)]"
          />
        </Card>
        <Card hoverable>
          <SummaryCard
            label="Running"
            value={summaryExperiments["Running"]}
            icon="loader-circle"
            classNameValue="text-[var(--cl-blue)]"
          />
        </Card>
        <Card hoverable>
          <SummaryCard
            label="Failed"
            value={summaryExperiments["Failed"]}
            icon="circle-x"
            classNameValue="text-[var(--cl-red)]"
          />
        </Card>
      </div>

      <div className="flex my-4 flex-row items-center gap-2">
        <InputText
          placeholder="Search experiments"
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
        <SelectList options={sortOptions} value={sort} onChange={setSort} />
      </div>

      <Table columns={columns} data={filteredData} />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="New Experiment"
        description="Configure and launch a new ML experiment"
        icon="flask-conical"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label
              className="text-xs font-semibold"
              style={{ color: "var(--cl-font-secondary)" }}
            >
              Experiment Name
            </label>
            <InputText placeholder="Enter experiment name" />
          </div>

          <div className="flex flex-row gap-3">
            <div className="flex flex-col gap-1 flex-1">
              <label
                className="text-xs font-semibold"
                style={{ color: "var(--cl-font-secondary)" }}
              >
                Model
              </label>
              <SelectList
                options={modelOptions}
                value={model}
                onChange={setModel}
                className="w-full"
              />
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <label
                className="text-xs font-semibold"
                style={{ color: "var(--cl-font-secondary)" }}
              >
                Dataset
              </label>
              <SelectList
                options={datasetOptions}
                value={dataset}
                onChange={setDataset}
                className="w-full"
              />
            </div>
          </div>

          <div className="flex flex-row gap-3">
            <div className="flex flex-col gap-1 flex-1">
              <label
                className="text-xs font-semibold"
                style={{ color: "var(--cl-font-secondary)" }}
              >
                Optimization Metric
              </label>
              <SelectList
                options={metricOptions}
                value={metric}
                onChange={setMetric}
                className="w-full"
              />
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <label
                className="text-xs font-semibold"
                style={{ color: "var(--cl-font-secondary)" }}
              >
                Loss Function
              </label>
              <SelectList
                options={lossOptions}
                value={loss}
                onChange={setLoss}
                className="w-full"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label
              className="text-xs font-semibold"
              style={{ color: "var(--cl-font-secondary)" }}
            >
              Batch Size
            </label>
            <SelectList
              options={batchOptions}
              value={batch}
              onChange={setBatch}
              className="w-full"
            />
          </div>

          <div
            className="flex flex-row items-start gap-3 p-3 rounded-lg"
            style={{
              background: "var(--bg-tables-selector)",
              border: "1px solid var(--cl-border)",
            }}
          >
            <input
              type="checkbox"
              checked={imbalanced}
              onChange={(e) => setImbalanced(e.target.checked)}
              className="mt-0.5 cursor-pointer"
            />
            <div className="flex flex-col gap-1">
              <p
                className="text-xs font-semibold"
                style={{ color: "var(--cl-font-primary)" }}
              >
                Dataset is imbalanced
              </p>
              <p
                className="text-xs"
                style={{ color: "var(--cl-font-secondary)" }}
              >
                Enable if classes are not equally represented. This will apply
                class weighting and oversampling strategies.
              </p>
            </div>
          </div>

          <div className="flex flex-row justify-end gap-2 mt-2">
            <Button
              label="Cancel"
              variant="secondary"
              onClick={() => setModalOpen(false)}
            />
            <Button label="Create Experiment" ico={<SvgIcon name="plus" />} />
          </div>
        </div>
      </Modal>
      <Modal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Edit Experiment"
        description="Modify your experiment configuration"
        icon="flask-conical"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label
              className="text-xs font-semibold"
              style={{ color: "var(--cl-font-secondary)" }}
            >
              Experiment Name
            </label>
            <InputText
              placeholder="Enter experiment name"
              value={selectedRow?.experiment ?? ""}
              onChange={() => {}}
            />
          </div>

          <div className="flex flex-row gap-3">
            <div className="flex flex-col gap-1 flex-1">
              <label
                className="text-xs font-semibold"
                style={{ color: "var(--cl-font-secondary)" }}
              >
                Model
              </label>
              <SelectList
                options={modelOptions}
                value={selectedRow?.model?.toLowerCase() ?? "resnet"}
                onChange={() => {}}
                className="w-full"
              />
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <label
                className="text-xs font-semibold"
                style={{ color: "var(--cl-font-secondary)" }}
              >
                Dataset
              </label>
              <SelectList
                options={datasetOptions}
                value={selectedRow?.dataset?.toLowerCase() ?? "mnist"}
                onChange={() => {}}
                className="w-full"
              />
            </div>
          </div>

          <div className="flex flex-row gap-3">
            <div className="flex flex-col gap-1 flex-1">
              <label
                className="text-xs font-semibold"
                style={{ color: "var(--cl-font-secondary)" }}
              >
                Optimization Metric
              </label>
              <SelectList
                options={metricOptions}
                value="accuracy"
                onChange={() => {}}
                className="w-full"
              />
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <label
                className="text-xs font-semibold"
                style={{ color: "var(--cl-font-secondary)" }}
              >
                Loss Function
              </label>
              <SelectList
                options={lossOptions}
                value="crossentropy"
                onChange={() => {}}
                className="w-full"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label
              className="text-xs font-semibold"
              style={{ color: "var(--cl-font-secondary)" }}
            >
              Batch Size
            </label>
            <SelectList
              options={batchOptions}
              value="32"
              onChange={() => {}}
              className="w-full"
            />
          </div>

          <div
            className="flex flex-row items-start gap-3 p-3 rounded-lg"
            style={{
              background: "var(--bg-tables-selector)",
              border: "1px solid var(--cl-border)",
            }}
          >
            <input type="checkbox" className="mt-0.5 cursor-pointer" />
            <div className="flex flex-col gap-1">
              <p
                className="text-xs font-semibold"
                style={{ color: "var(--cl-font-primary)" }}
              >
                Dataset is imbalanced
              </p>
              <p
                className="text-xs"
                style={{ color: "var(--cl-font-secondary)" }}
              >
                Enable if classes are not equally represented. This will apply
                class weighting and oversampling strategies.
              </p>
            </div>
          </div>

          <div className="flex flex-row justify-between mt-2">
            <Button
              label="View Graphics"
              ico={<SvgIcon name="chart-spline" />}
            />
            <div className="flex flex-row gap-2">
              <Button
                label="Cancel"
                variant="secondary"
                onClick={() => setEditModalOpen(false)}
              />
              <Button label="Save Experiment" ico={<SvgIcon name="save" />} />
            </div>
          </div>
        </div>
      </Modal>
    </main>
  );
}
