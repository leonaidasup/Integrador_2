import { useEffect, useRef, useState } from "react";
import { Button } from "../components/Button";
import { SvgIcon } from "../components/SvgIcon";
import { Card } from "../components/Card";
import { Modal } from "../components/Modal";
import { InputText } from "../components/InputText";
import { Table } from "../components/Table";

const statusStyles: Record<string, { bg: string; color: string }> = {
  active: { bg: "var(--bg-green)", color: "var(--cl-green)" },
  inactive: { bg: "var(--bg-yellow)", color: "var(--cl-yellow)" },
  failed: { bg: "var(--bg-red)", color: "var(--cl-red)" },
};

type Model = {
  id: string;
  name: string;
  version: string;
  architecture: string | null;
  description: string | null;
  active: boolean;
  framework: string;
  artifact_type: string;
  classes: string[];
};

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

const SEGMENTATION_COLOR_MAP: Record<string, string> = {
  background: "#000000",
  "few-layer": "#00aaff",
  bulk: "#ff8c00",
};

const SEGMENTATION_COLOR_FALLBACKS = [
  "#000000",
  "#00aaff",
  "#ff8c00",
  "#8b5cf6",
  "#22c55e",
  "#ef4444",
];

type SegmentResult = {
  filename: string;
  classes: string[];
  mask_base64: string;
  segmented_base64: string;
  overlay_base64: string;
  model_loaded: boolean;
};

export default function Dashboard() {
  const [modelModalOpen, setModelModalOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [allModels, setAllModels] = useState<Model[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [activatingModel, setActivatingModel] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [segmentResult, setSegmentResult] = useState<SegmentResult | null>(
    null,
  );
  const [segmentError, setSegmentError] = useState<string | null>(null);
  const [segmenting, setSegmenting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetchAvailableModels();
  }, []);

  const fetchAvailableModels = async () => {
    setLoadingModels(true);
    setModelsError(null);
    try {
      const token = localStorage.getItem("auth_token") ?? "";
      const response = await fetch(`${API_BASE_URL}/registry/models`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch models");
      }

      const data = await response.json();
      setAllModels(data.models || []);
      
      // Set active model as selected by default
      const activeModel = data.models?.find((m: Model) => m.active);
      if (activeModel) {
        setSelectedModel(activeModel);
      }
    } catch (error) {
      setModelsError(
        error instanceof Error ? error.message : "Failed to load models",
      );
    } finally {
      setLoadingModels(false);
    }
  };

  const handleActivateModel = async (modelId: string) => {
    setActivatingModel(modelId);
    try {
      const token = localStorage.getItem("auth_token") ?? "";
      const response = await fetch(
        `${API_BASE_URL}/registry/models/${modelId}/activate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error("Failed to activate model");
      }

      const activatedModel = await response.json();
      
      // Update local state
      setAllModels((prevModels) =>
        prevModels.map((m) => ({
          ...m,
          active: m.id === modelId,
        })),
      );
      
      setSelectedModel(activatedModel);
      setModelModalOpen(false);
    } catch (error) {
      setModelsError(
        error instanceof Error ? error.message : "Failed to activate model",
      );
    } finally {
      setActivatingModel(null);
    }
  };

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const handleSelectImage = (file: File | null) => {
    setImageFile(file);
    setSegmentResult(null);
    setSegmentError(null);
  };

  const handleRunSegmentation = async () => {
    if (!imageFile) {
      setSegmentError("Please upload an image before running segmentation.");
      return;
    }

    setSegmenting(true);
    setSegmentError(null);

    try {
      const token = localStorage.getItem("auth_token") ?? "";
      const formData = new FormData();
      formData.append("file", imageFile);

      const response = await fetch(`${API_BASE_URL}/segment`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
        body: formData,
      });

      const payload = (await response.json()) as SegmentResult & {
        detail?: string;
      };

      if (!response.ok) {
        setSegmentError(payload.detail ?? "Segmentation failed.");
        return;
      }

      setSegmentResult(payload);
    } catch (error) {
      setSegmentError(
        "Could not reach backend. Check that the API is running.",
      );
    } finally {
      setSegmenting(false);
    }
  };

  const segmentationLegend = segmentResult
    ? segmentResult.classes.map((label, index) => ({
        label,
        color:
          SEGMENTATION_COLOR_MAP[label.toLowerCase()] ??
          SEGMENTATION_COLOR_FALLBACKS[
            index % SEGMENTATION_COLOR_FALLBACKS.length
          ],
      }))
    : [];

  const filteredData = allModels.filter((row) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      row.name.toLowerCase().includes(q) ||
      row.version.toLowerCase().includes(q) ||
      (row.architecture?.toLowerCase().includes(q) ?? false) ||
      (row.description?.toLowerCase().includes(q) ?? false)
    );
  });

  const columns = [
    { key: "name", label: "Model" },
    { key: "version", label: "Version" },
    { key: "architecture", label: "Architecture" },
    {
      key: "active",
      label: "Status",
      render: (value: boolean) => (
        <span
          className="text-xs px-2 py-1 rounded-md"
          style={{
            background: statusStyles[value ? "active" : "inactive"].bg,
            color: statusStyles[value ? "active" : "inactive"].color,
          }}
        >
          {value ? "active" : "inactive"}
        </span>
      ),
    },
    {
      key: "select",
      label: "",
      render: (_: any, row: Model) => (
        <Button
          label={row.active ? "Active" : "Activate"}
          className="sm"
          disabled={activatingModel === row.id || row.active}
          onClick={() => {
            if (!row.active) {
              handleActivateModel(row.id);
            }
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
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/tiff"
              className="hidden"
              onChange={(event) =>
                handleSelectImage(event.target.files?.[0] ?? null)
              }
            />
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
            <Button
              label={imageFile ? "Replace Image" : "Browse Files"}
              ico={<SvgIcon name="upload" />}
              onClick={() => fileInputRef.current?.click()}
            />
            {imageFile && (
              <p
                className="text-xs"
                style={{ color: "var(--cl-font-secondary)" }}
              >
                Selected: {imageFile.name}
              </p>
            )}
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
                label={segmenting ? "Segmenting..." : "Run Segmentation"}
                ico={<SvgIcon name="play" />}
                className="ml-auto"
                disabled={segmenting || !imageFile}
                onClick={handleRunSegmentation}
              />
            </div>

            {segmenting && (
              <div
                className="flex items-center gap-3 rounded-lg px-4 py-3"
                style={{
                  background: "var(--bg-blue)",
                  border: "1px solid var(--cl-blue)",
                }}
                aria-live="polite"
                aria-busy="true"
              >
                <span className="relative flex h-4 w-4">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--cl-blue)] opacity-60" />
                  <span className="relative inline-flex h-4 w-4 rounded-full bg-[var(--cl-blue)]" />
                </span>
                <div className="flex flex-col gap-0.5">
                  <span
                    className="text-sm font-semibold"
                    style={{ color: "var(--cl-blue)" }}
                  >
                    Segmenting image
                  </span>
                  <span
                    className="text-xs"
                    style={{ color: "var(--cl-font-secondary)" }}
                  >
                    Please wait while the model analyzes the uploaded image.
                  </span>
                </div>
              </div>
            )}

            {segmentError && (
              <p className="text-xs" style={{ color: "var(--cl-red)" }}>
                {segmentError}
              </p>
            )}

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
                      {selectedModel.name}
                    </span>
                    <span
                      className="text-xs"
                      style={{ color: "var(--cl-font-secondary)" }}
                    >
                      {selectedModel.version} • {selectedModel.architecture || "Unknown"}
                    </span>
                  </div>

                  <span
                    className="text-xs px-2 py-1 rounded-md"
                    style={{
                      background: statusStyles[selectedModel.active ? "active" : "inactive"].bg,
                      color: statusStyles[selectedModel.active ? "active" : "inactive"].color,
                    }}
                  >
                    {selectedModel.active ? "active" : "inactive"}
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

        {imagePreviewUrl && segmentResult && (
          <Card title="Segmentation Results">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_1fr]">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="flex flex-col gap-2">
                  <span
                    className="text-xs font-semibold"
                    style={{ color: "var(--cl-font-secondary)" }}
                  >
                    Original
                  </span>
                  <img
                    src={imagePreviewUrl}
                    alt="Original microscopy"
                    className="rounded-lg border border-[var(--cl-border)]"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <span
                    className="text-xs font-semibold"
                    style={{ color: "var(--cl-font-secondary)" }}
                  >
                    Segmented
                  </span>
                  <img
                    src={`data:image/png;base64,${segmentResult.segmented_base64}`}
                    alt="Segmented visualization"
                    className="rounded-lg border border-[var(--cl-border)]"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <span
                    className="text-xs font-semibold"
                    style={{ color: "var(--cl-font-secondary)" }}
                  >
                    Overlay
                  </span>
                  <img
                    src={`data:image/png;base64,${segmentResult.overlay_base64}`}
                    alt="Overlay composition"
                    className="rounded-lg border border-[var(--cl-border)]"
                  />
                </div>
              </div>

              <div
                className="flex flex-col gap-3 rounded-xl p-4"
                style={{
                  background: "var(--bg-tables-selector)",
                  border: "1px solid var(--cl-border)",
                }}
              >
                <div className="flex flex-col gap-1">
                  <span
                    className="text-sm font-semibold"
                    style={{ color: "var(--cl-font-primary)" }}
                  >
                    Color Legend
                  </span>
                  <span
                    className="text-xs"
                    style={{ color: "var(--cl-font-secondary)" }}
                  >
                    Each color corresponds to one label returned by the model.
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  {segmentationLegend.map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center gap-3 rounded-lg px-3 py-2"
                      style={{ background: "var(--bg-tables)" }}
                    >
                      <span
                        className="h-4 w-4 rounded-sm border"
                        style={{
                          backgroundColor: item.color,
                          borderColor:
                            item.color === "#000000"
                              ? "var(--cl-border)"
                              : item.color,
                        }}
                      />
                      <div className="flex flex-col">
                        <span
                          className="text-sm font-medium"
                          style={{ color: "var(--cl-font-primary)" }}
                        >
                          {item.label}
                        </span>
                        <span
                          className="text-xs uppercase tracking-wider"
                          style={{ color: "var(--cl-font-secondary)" }}
                        >
                          {item.color}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        )}

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

          {loadingModels && (
            <div
              className="flex items-center gap-3 rounded-lg px-4 py-3"
              style={{
                background: "var(--bg-blue)",
                border: "1px solid var(--cl-blue)",
              }}
            >
              <span className="relative flex h-4 w-4">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--cl-blue)] opacity-60" />
                <span className="relative inline-flex h-4 w-4 rounded-full bg-[var(--cl-blue)]" />
              </span>
              <span
                className="text-sm"
                style={{ color: "var(--cl-blue)" }}
              >
                Loading models...
              </span>
            </div>
          )}

          {modelsError && !loadingModels && (
            <p className="text-xs" style={{ color: "var(--cl-red)" }}>
              {modelsError}
            </p>
          )}

          {allModels.length === 0 && !loadingModels && (
            <p
              className="text-xs text-center py-4"
              style={{ color: "var(--cl-font-secondary)" }}
            >
              No models available. Upload one from the Models section.
            </p>
          )}

          {allModels.length > 0 && (
            <Table columns={columns} data={filteredData} />
          )}
        </div>
      </Modal>
    </main>
  );
}
