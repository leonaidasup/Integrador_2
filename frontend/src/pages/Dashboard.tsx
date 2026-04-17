import { useState } from "react";
import { Button } from "../components/Button";
import { SvgIcon } from "../components/SvgIcon";
import { Card } from "../components/Card";
import { Modal } from "../components/Modal";
import { InputText } from "../components/InputText";
import { Table } from "../components/Table";

const statusStyles: Record<string, { bg: string; color: string }> = {
  running: { bg: "var(--bg-blue)", color: "var(--cl-blue)" },
  complete: { bg: "var(--bg-green)", color: "var(--cl-green)" },
  pause: { bg: "var(--bg-yellow)", color: "var(--cl-yellow)" },
  failed: { bg: "var(--bg-red)", color: "var(--cl-red)" },
};

const data = [
  {
    model: "CellSegNet v2.3",
    version: "v2.3",
    architecture: "U-Net",
    description: "Cell segmentation model",
    status: "complete",
  },
  {
    model: "BioVision UNet",
    version: "v1.8",
    architecture: "U-Net",
    description: "Training model",
    status: "running",
  },
  {
    model: "DeepCell-X",
    version: "v4.0",
    architecture: "ResNet",
    description: "Paused experiment",
    status: "pause",
  },
  {
    model: "NanoSeg AI",
    version: "v0.9",
    architecture: "EfficientNet",
    description: "Failed training",
    status: "failed",
  },
];

export default function Dashboard() {
  const [modelModalOpen, setModelModalOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState<any>(null);
  const [search, setSearch] = useState("");

  const filteredData = data.filter((row) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      row.model.toLowerCase().includes(q) ||
      row.version.toLowerCase().includes(q) ||
      row.architecture.toLowerCase().includes(q) ||
      row.description.toLowerCase().includes(q)
    );
  });

  const columns = [
    { key: "model", label: "Model" },
    { key: "version", label: "Version" },
    { key: "architecture", label: "Architecture" },
    {
      key: "status",
      label: "Status",
      render: (value: string) => (
        <span
          className="text-xs px-2 py-1 rounded-md"
          style={{
            background: statusStyles[value].bg,
            color: statusStyles[value].color,
          }}
        >
          {value}
        </span>
      ),
    },
    {
      key: "select",
      label: "",
      render: (_: any, row: any) => (
        <Button
          label="Select"
          className="sm"
          onClick={() => {
            setSelectedModel(row);
            setModelModalOpen(false);
          }}
        />
      ),
    },
  ];

  return (
    <main className="flex-1 overflow-y-auto p-6 bg-[var(--bg-page-user)]">
      <div
        className="flex flex-col mb-6 p-6 rounded-xl"
        style={{
          background:
            "linear-gradient(135deg, var(--bg-blue) 0%, var(--bg-green) 100%)",
          border: "1px solid var(--cl-border)",
        }}
      >
        <h1
          className="text-2xl font-semibold"
          style={{ color: "var(--cl-white)" }}
        >
          AI Platform
        </h1>
        <p
          className="text-sm mt-1"
          style={{ color: "var(--cl-font-secondary)" }}
        >
          Image Analysis Workspace
        </p>
        <p
          className="text-sm mt-3 max-w-lg"
          style={{ color: "var(--cl-font-secondary)" }}
        >
          Upload microscopy images and run state-of-the-art AI segmentation
          models for precise cell and tissue analysis.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <Card>
          <div
            className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8"
            style={{ borderColor: "var(--cl-border)" }}
          >
            <SvgIcon
              name="image"
              className="text-[var(--cl-font-secondary)]"
              size="w-10 h-10"
            />
            <p
              className="text-sm font-medium"
              style={{ color: "var(--cl-font-primary)" }}
            >
              Drop your microscopy image here
            </p>
            <p
              className="text-xs text-center"
              style={{ color: "var(--cl-font-secondary)" }}
            >
              Upload high-resolution cell or tissue images for AI-powered
              segmentation analysis
            </p>
            <Button label="Browse Files" ico={<SvgIcon name="upload" />} />
          </div>
        </Card>

        <Card title="AI Analysis">
          <div className="flex flex-col gap-4">
            <div className="flex flex-row gap-2">
              <Button
                label="Buscar modelo"
                variant="transparent"
                ico={<SvgIcon name="search" />}
                onClick={() => setModelModalOpen(true)}
              />

              <Button
                label="Run Segmentation"
                ico={<SvgIcon name="play" />}
                className="ml-auto"
              />
            </div>

            <div
              className="flex items-center justify-between rounded-lg p-4"
              style={{ background: "var(--bg-tables-selector)" }}
            >
              {selectedModel ? (
                <>
                  <div className="flex flex-col gap-1">
                    <span
                      className="text-sm font-semibold"
                      style={{ color: "var(--cl-font-primary)" }}
                    >
                      {selectedModel.model}
                    </span>
                    <span
                      className="text-xs"
                      style={{ color: "var(--cl-font-secondary)" }}
                    >
                      {selectedModel.version} • {selectedModel.architecture}
                    </span>
                  </div>

                  <span
                    className="text-xs px-2 py-1 rounded-md"
                    style={{
                      background: statusStyles[selectedModel.status].bg,
                      color: statusStyles[selectedModel.status].color,
                    }}
                  >
                    {selectedModel.status}
                  </span>
                </>
              ) : (
                <span
                  className="text-xs"
                  style={{ color: "var(--cl-font-secondary)" }}
                >
                  No model selected
                </span>
              )}
            </div>
          </div>
        </Card>

        <Card title="Export Results">
          <p
            className="text-xs mb-2"
            style={{ color: "var(--cl-font-secondary)" }}
          >
            Complete analysis first
          </p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Mask", fmt: "PNG format", icon: "image" },
              { label: "Overlay", fmt: "PNG format", icon: "layers" },
              { label: "Report", fmt: "PDF format", icon: "file-text" },
              { label: "Data", fmt: "CSV format", icon: "table" },
            ].map((item) => (
              <div
                key={item.label}
                className="flex flex-row items-center gap-2 rounded-lg p-3"
                style={{
                  background: "var(--bg-tables-selector)",
                  border: "1px solid var(--cl-border)",
                }}
              >
                <SvgIcon
                  name={item.icon}
                  className="text-[var(--cl-font-secondary)]"
                />
                <div className="flex flex-col">
                  <p
                    className="text-xs font-semibold"
                    style={{ color: "var(--cl-font-primary)" }}
                  >
                    {item.label}
                  </p>
                  <p
                    className="text-xs"
                    style={{ color: "var(--cl-font-secondary)" }}
                  >
                    {item.fmt}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <Button
            label="Download All (ZIP)"
            className="w-full mt-2 justify-center"
            ico={<SvgIcon name="download" />}
          />
        </Card>
      </div>

      <Modal
        open={modelModalOpen}
        onClose={() => setModelModalOpen(false)}
        title="Select Model"
        description="Choose a model"
        icon="brain"
      >
        <div className="flex flex-col gap-4">
          <InputText
            placeholder="Search model..."
            ico={<SvgIcon name="search" />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <Table columns={columns} data={filteredData} />
        </div>
      </Modal>
    </main>
  );
}
