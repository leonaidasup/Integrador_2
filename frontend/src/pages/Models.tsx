import { useRef, useState } from "react";
import { Button } from "../components/Button";
import { SvgIcon } from "../components/SvgIcon";
import { InputText } from "../components/InputText";
import { Card } from "../components/Card";
import { SummaryCard } from "../components/SummaryCard";
import { SelectList } from "../components/SelectList";
import { Table } from "../components/Table";
import { Modal } from "../components/Modal";

const summaryModels = {
  "Total Models": 6,
  Available: 3,
  Training: 1,
  "Avg Accuracy": "92.8%",
};

const data = [
  {
    model: "Modelo UNet",
    version: "v3.2.1",
    architecture: "U-Net",
    size: "1.5 GB",
    description: "Descripcion del modelo…",
  },
  {
    model: "Modelo UNet2",
    version: "v3.2.1",
    architecture: "U-Net",
    size: "1.5 GB",
    description: "Descripcion del modelo…",
  },
  {
    model: "Modelo 3UNet",
    version: "v3.2.1",
    architecture: "U-Net",
    size: "1.5 GB",
    description: "Descripcion del modelo…",
  },
  {
    model: "Modelo asdaUNet",
    version: "v3.2.1",
    architecture: "U-Net",
    size: "1.5 GB",
    description: "Descripcion del modelo…",
  },
  {
    model: "Modelo UNet",
    version: "v3.2.1",
    architecture: "U-Net",
    size: "1.5 GB",
    description: "Descripcion del modelo…",
  },
];

const architectureOptions = [
  { label: "U-Net", value: "unet" },
  { label: "ResNet", value: "resnet" },
  { label: "VGG", value: "vgg" },
  { label: "EfficientNet", value: "efficientnet" },
];

const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

const textRender = (value: any) => <span className="font-medium">{value}</span>;

export default function Models() {
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<any>(null);
  const [sort, setSort] = useState("all");
  const [architecture, setArchitecture] = useState("unet");
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [search, setSearch] = useState("");
  const filteredData = data
    .filter((row) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        row.model.toLowerCase().includes(q) ||
        row.version.toLowerCase().includes(q) ||
        row.architecture.toLowerCase().includes(q) ||
        row.size.toLowerCase().includes(q) ||
        row.description.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      switch (sort) {
        case "architecture":
          return a.architecture.localeCompare(b.architecture);
        case "size":
          return a.size.localeCompare(b.size);
        default:
          return 0;
      }
    });

  const sortOptions = [
    { label: "All Status", value: "all" },
    { label: "Available", value: "available" },
    { label: "Training", value: "training" },
    { label: "Architecture", value: "architecture" },
    { label: "Size", value: "size" },
  ];

  const handleModelUpload = async () => {
    if (!modelFile) {
      setUploadError("Please select a model file before uploading.");
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadStatus(null);

    try {
      const formData = new FormData();
      formData.append("file", modelFile);

      const response = await fetch(`${API_BASE_URL}/load_model`, {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as {
        status?: string;
        framework?: string;
        detail?: string;
      };

      if (!response.ok) {
        setUploadError(payload.detail ?? "Model upload failed.");
        return;
      }

      setUploadStatus(
        `Loaded (${payload.framework ?? "unknown"}) - model is ready for use.`,
      );
    } catch (error) {
      setUploadError("Could not reach backend. Check that the API is running.");
    } finally {
      setUploading(false);
    }
  };

  const columns = [
    { key: "model", label: "Model", render: textRender },
    { key: "version", label: "Version", render: textRender },
    { key: "architecture", label: "Architecture", render: textRender },
    { key: "size", label: "Size", render: textRender },
    { key: "description", label: "Description", render: textRender },
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
      {/* header */}
      <div className="flex flex-row items-center justify-between">
        <div className="flex flex-col justify-between mb-6">
          <h1 className="text-2xl text-[var(--cl-font-primary)] font-semibold">
            Models
          </h1>
          <p className="text-sm text-[var(--cl-font-secondary)]">
            Manage your AI segmentation models and versions
          </p>
        </div>
        <Button
          label="Upload Model"
          className="h-min"
          ico={<SvgIcon name="upload" />}
          onClick={() => setUploadModalOpen(true)}
        />
      </div>

      {/* summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card hoverable>
          <SummaryCard
            label="Total Models"
            value={summaryModels["Total Models"]}
            icon="box"
            classNameValue="text-[var(--cl-white)]"
          />
        </Card>
        <Card hoverable>
          <SummaryCard
            label="Available"
            value={summaryModels["Available"]}
            icon="circle-check-big"
            classNameValue="text-[var(--cl-green)]"
          />
        </Card>
        <Card hoverable>
          <SummaryCard
            label="Training"
            value={summaryModels["Training"]}
            icon="loader-circle"
            classNameValue="text-[var(--cl-blue)]"
          />
        </Card>
        <Card hoverable>
          <SummaryCard
            label="Avg Accuracy"
            value={summaryModels["Avg Accuracy"]}
            icon="crosshair"
            classNameValue="text-[var(--cl-yellow)]"
          />
        </Card>
      </div>

      {/* best model card */}
      <Card className="my-4">
        <div className="flex flex-row items-center justify-between">
          <div className="flex flex-col gap-1">
            <p
              className="text-xs font-semibold"
              style={{ color: "var(--cl-font-secondary)" }}
            >
              Best Model
            </p>
            <p
              className="text-lg font-bold"
              style={{ color: "var(--cl-font-primary)" }}
            >
              CellSegmenter Pro
            </p>
            <p
              className="text-sm"
              style={{ color: "var(--cl-font-secondary)" }}
            >
              v3.2.1
            </p>
          </div>
          <div className="flex flex-row gap-6">
            {[
              { label: "Accuracy", value: "96.8%" },
              { label: "Dice", value: "0.942" },
              { label: "IoU", value: "0.891" },
            ].map((m) => (
              <div key={m.label} className="flex flex-col items-center gap-1">
                <p
                  className="text-xs"
                  style={{ color: "var(--cl-font-secondary)" }}
                >
                  {m.label}
                </p>
                <p
                  className="text-lg font-bold"
                  style={{ color: "var(--cl-font-primary)" }}
                >
                  {m.value}
                </p>
              </div>
            ))}
          </div>
          <div className="flex flex-col items-end gap-1">
            <p
              className="text-xs"
              style={{ color: "var(--cl-font-secondary)" }}
            >
              Architecture: U-Net
            </p>
            <p
              className="text-xs"
              style={{ color: "var(--cl-font-secondary)" }}
            >
              31.4M params
            </p>
            <div
              className="px-2 py-1 rounded-md text-xs font-bold mt-1"
              style={{
                background: "var(--bg-green)",
                color: "var(--cl-green)",
                border: "1px solid var(--cl-green)",
              }}
            >
              Active
            </div>
          </div>
        </div>
      </Card>

      {/* search + filter */}
      <div className="flex my-4 flex-row items-center gap-2">
        <InputText
          placeholder="Search models by name, version, or architecture..."
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
        open={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        title="Register Model"
        description="Add a new model to the registry"
        icon="brain"
      >
        <div className="flex flex-col gap-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pth,.keras"
            className="hidden"
            onChange={(event) => setModelFile(event.target.files?.[0] ?? null)}
          />
          <div className="flex flex-col gap-1">
            <label
              className="text-xs font-semibold"
              style={{ color: "var(--cl-font-secondary)" }}
            >
              Model Name
            </label>
            <InputText placeholder="e.g. fraud-detector-v2" />
          </div>

          <div className="flex flex-col gap-1">
            <label
              className="text-xs font-semibold"
              style={{ color: "var(--cl-font-secondary)" }}
            >
              Architecture
            </label>
            <SelectList
              options={architectureOptions}
              value={architecture}
              onChange={setArchitecture}
              className="w-full"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              className="text-xs font-semibold"
              style={{ color: "var(--cl-font-secondary)" }}
            >
              Description
            </label>
            <InputText placeholder="Describe what this model does..." />
          </div>

          <div className="flex flex-col gap-1">
            <label
              className="text-xs font-semibold"
              style={{ color: "var(--cl-font-secondary)" }}
            >
              Version
            </label>
            <InputText placeholder="e.g. 1.0.0" />
          </div>

          {/* drop zone */}
          <div className="flex flex-col gap-1">
            <label
              className="text-xs font-semibold"
              style={{ color: "var(--cl-font-secondary)" }}
            >
              Import Model
            </label>
            <div
              className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 cursor-pointer"
              style={{ borderColor: "var(--cl-border)" }}
              onClick={() => fileInputRef.current?.click()}
            >
              <SvgIcon
                name="upload"
                className="text-[var(--cl-font-secondary)]"
                size="w-8 h-8"
              />
              <p
                className="text-sm font-medium"
                style={{ color: "var(--cl-font-primary)" }}
              >
                Drop your model file here or click to browse
              </p>
              <p
                className="text-xs"
                style={{ color: "var(--cl-font-secondary)" }}
              >
                Supports .pth and .keras
              </p>
            </div>
            {modelFile && (
              <p
                className="text-xs"
                style={{ color: "var(--cl-font-secondary)" }}
              >
                Selected: {modelFile.name}
              </p>
            )}
          </div>

          {uploadError && (
            <p className="text-xs" style={{ color: "var(--cl-red)" }}>
              {uploadError}
            </p>
          )}

          {uploadStatus && (
            <p className="text-xs" style={{ color: "var(--cl-green)" }}>
              {uploadStatus}
            </p>
          )}

          <div className="flex flex-row justify-end gap-2 mt-2">
            <Button
              label="Cancel"
              variant="secondary"
              onClick={() => setUploadModalOpen(false)}
            />
            <Button
              label={uploading ? "Uploading..." : "Register Model"}
              ico={<SvgIcon name="plus" />}
              disabled={uploading}
              onClick={handleModelUpload}
            />
          </div>
        </div>
      </Modal>
      {/* edit model modal */}
      <Modal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Edit Model"
        description="Modify your model configuration"
        icon="brain"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label
              className="text-xs font-semibold"
              style={{ color: "var(--cl-font-secondary)" }}
            >
              Model Name
            </label>
            <InputText
              placeholder="Model name"
              value={selectedRow?.model ?? ""}
              onChange={() => {}}
            />
          </div>

          <div className="flex flex-row gap-3">
            <div className="flex flex-col gap-1 flex-1">
              <label
                className="text-xs font-semibold"
                style={{ color: "var(--cl-font-secondary)" }}
              >
                Architecture
              </label>
              <SelectList
                options={architectureOptions}
                value={architecture}
                onChange={setArchitecture}
                className="w-full"
              />
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <label
                className="text-xs font-semibold"
                style={{ color: "var(--cl-font-secondary)" }}
              >
                Version
              </label>
              <InputText
                placeholder="e.g. 1.0.0"
                value={selectedRow?.version ?? ""}
                onChange={() => {}}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label
              className="text-xs font-semibold"
              style={{ color: "var(--cl-font-secondary)" }}
            >
              Description
            </label>
            <InputText
              placeholder="Describe what this model does..."
              value={selectedRow?.description ?? ""}
              onChange={() => {}}
            />
          </div>

          <div className="flex flex-row justify-end gap-2 mt-2">
            <Button
              label="Cancel"
              variant="secondary"
              onClick={() => setEditModalOpen(false)}
            />
            <Button label="Save Model" ico={<SvgIcon name="save" />} />
          </div>
        </div>
      </Modal>
    </main>
  );
}
