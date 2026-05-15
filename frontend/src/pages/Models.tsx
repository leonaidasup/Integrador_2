import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../components/Button";
import { SvgIcon } from "../components/SvgIcon";
import { InputText } from "../components/InputText";
import { Card } from "../components/Card";
import { SummaryCard } from "../components/SummaryCard";
import { SelectList } from "../components/SelectList";
import { Table } from "../components/Table";
import { Modal } from "../components/Modal";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

type ArtifactType = "full_model" | "weights";

interface RegistryModel {
  id: string;
  name: string;
  version: string;
  description?: string | null;
  framework: string;
  architecture?: string | null;
  artifact_type: ArtifactType;
  artifact_path: string;
  classes: string[];
  config: Record<string, unknown>;
  active: boolean;
  last_activation_status?: string | null;
  last_activation_error?: string | null;
  created_at: string;
  updated_at: string;
}

interface ModelListResponse {
  models: RegistryModel[];
  total: number;
}

interface ApiError {
  detail?: string;
}

const architectureOptions = [
  { label: "Keras", value: "keras" },
  { label: "Mask R-CNN", value: "mask_rcnn" },
  { label: "PyTorch", value: "pytorch" },
];

const artifactTypeOptions = [
  { label: "Full model", value: "full_model" },
  { label: "Weights", value: "weights" },
];

const sortOptions = [
  { label: "All Models", value: "all" },
  { label: "Active", value: "active" },
  { label: "Architecture", value: "architecture" },
  { label: "Artifact Type", value: "artifact_type" },
];

const defaultConfig = {
  NAME: "graphene_mask_rcnn",
  NUM_CLASSES: 3,
  BACKBONE: "resnet101",
  IMAGE_MIN_DIM: 1024,
  IMAGE_MAX_DIM: 1024,
};

const textRender = (value: unknown) => (
  <span className="font-medium">{String(value ?? "-")}</span>
);

const formatFileSize = (path: string) => {
  const filename = path.split(/[\\/]/).pop();
  return filename ?? path;
};

export default function Models() {
  const [models, setModels] = useState<RegistryModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [registryError, setRegistryError] = useState<string | null>(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<RegistryModel | null>(null);
  const [sort, setSort] = useState("all");
  const [search, setSearch] = useState("");

  const [modelName, setModelName] = useState("");
  const [version, setVersion] = useState("1.0.0");
  const [description, setDescription] = useState("");
  const [architecture, setArchitecture] = useState("keras");
  const [artifactType, setArtifactType] = useState<ArtifactType>("full_model");
  const [classNames, setClassNames] = useState("background, few-layer, bulk");
  const [configJson, setConfigJson] = useState(
    JSON.stringify(defaultConfig, null, 2),
  );
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadModels = async () => {
    setLoadingModels(true);
    setRegistryError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/registry/models`);
      const payload = (await response.json()) as ModelListResponse & ApiError;
      if (!response.ok) {
        setRegistryError(payload.detail ?? "Could not load models.");
        return;
      }
      setModels(payload.models ?? []);
    } catch {
      setRegistryError("Could not reach backend. Check that the API is running.");
    } finally {
      setLoadingModels(false);
    }
  };

  useEffect(() => {
    void loadModels();
  }, []);

  const activeModel = models.find((model) => model.active) ?? null;

  const filteredData = useMemo(() => {
    const q = search.toLowerCase();
    return models
      .filter((row) => {
        if (sort === "active" && !row.active) return false;
        if (!q) return true;
        return (
          row.name.toLowerCase().includes(q) ||
          row.version.toLowerCase().includes(q) ||
          (row.architecture ?? "").toLowerCase().includes(q) ||
          row.artifact_type.toLowerCase().includes(q) ||
          (row.description ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        switch (sort) {
          case "architecture":
            return (a.architecture ?? "").localeCompare(b.architecture ?? "");
          case "artifact_type":
            return a.artifact_type.localeCompare(b.artifact_type);
          default:
            return 0;
        }
      });
  }, [models, search, sort]);

  const resetUploadForm = () => {
    setModelName("");
    setVersion("1.0.0");
    setDescription("");
    setArchitecture("keras");
    setArtifactType("full_model");
    setClassNames("background, few-layer, bulk");
    setConfigJson(JSON.stringify(defaultConfig, null, 2));
    setModelFile(null);
    setUploadError(null);
    setUploadStatus(null);
  };

  const parseClasses = () =>
    classNames
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

  const handleModelUpload = async () => {
    if (!modelFile) {
      setUploadError("Please select a model file before uploading.");
      return;
    }
    if (!modelName.trim()) {
      setUploadError("Model name is required.");
      return;
    }

    let parsedConfig: Record<string, unknown> = {};
    try {
      parsedConfig = configJson.trim() ? JSON.parse(configJson) : {};
      if (typeof parsedConfig !== "object" || Array.isArray(parsedConfig)) {
        throw new Error("Config must be a JSON object.");
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Invalid config JSON.");
      return;
    }

    const parsedClasses = parseClasses();
    if (artifactType === "weights" && (!architecture || parsedClasses.length === 0)) {
      setUploadError("Weights require architecture and class names.");
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadStatus(null);

    try {
      const formData = new FormData();
      formData.append("file", modelFile);
      formData.append("name", modelName.trim());
      formData.append("version", version.trim() || "1.0.0");
      formData.append("description", description.trim());
      formData.append("framework", architecture === "pytorch" ? "pytorch" : "keras");
      formData.append("architecture", architecture);
      formData.append("artifact_type", artifactType);
      formData.append("classes", JSON.stringify(parsedClasses));
      formData.append("config", JSON.stringify(parsedConfig));

      const response = await fetch(`${API_BASE_URL}/registry/models/upload`, {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as RegistryModel & ApiError;

      if (!response.ok) {
        setUploadError(payload.detail ?? "Model registration failed.");
        return;
      }

      setUploadStatus(`Registered ${payload.name} ${payload.version}.`);
      await loadModels();
      resetUploadForm();
      setUploadModalOpen(false);
    } catch {
      setUploadError("Could not reach backend. Check that the API is running.");
    } finally {
      setUploading(false);
    }
  };

  const handleActivate = async (modelId: string) => {
    setActivatingId(modelId);
    setActivationError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/registry/models/${modelId}/activate`, {
        method: "POST",
      });
      const payload = (await response.json()) as RegistryModel & ApiError;
      if (!response.ok) {
        setActivationError(payload.detail ?? "Model activation failed.");
        await loadModels();
        return;
      }
      await loadModels();
    } catch {
      setActivationError("Could not reach backend. Check that the API is running.");
    } finally {
      setActivatingId(null);
    }
  };

  const columns = [
    { key: "name", label: "Model", render: textRender },
    { key: "version", label: "Version", render: textRender },
    {
      key: "architecture",
      label: "Architecture",
      render: (value: unknown) => textRender(value ?? "keras"),
    },
    {
      key: "artifact_type",
      label: "Artifact",
      render: (value: unknown) => textRender(value),
    },
    {
      key: "active",
      label: "Status",
      render: (_: unknown, row: Record<string, unknown>) => {
        const model = row as unknown as RegistryModel;
        return (
          <span
            className="text-xs font-bold"
            style={{ color: model.active ? "var(--cl-green)" : "var(--cl-font-secondary)" }}
          >
            {model.active ? "Active" : model.last_activation_status ?? "Inactive"}
          </span>
        );
      },
    },
    {
      key: "actions",
      label: "",
      render: (_: unknown, row: Record<string, unknown>) => {
        const model = row as unknown as RegistryModel;
        return (
          <div className="flex items-center justify-end gap-2">
            <Button
              label={activatingId === model.id ? "Activating" : "Activate"}
              variant="secondary"
              disabled={model.active || activatingId === model.id}
              onClick={() => void handleActivate(model.id)}
            />
            <Button
              variant="transparent"
              ico={<SvgIcon name="ellipsis" />}
              onClick={() => {
                setSelectedRow(model);
                setDetailsModalOpen(true);
              }}
            />
          </div>
        );
      },
    },
  ];

  return (
    <main className="flex-1 overflow-y-auto p-6 bg-[var(--bg-page-user)]">
      <div className="flex flex-row items-center justify-between">
        <div className="flex flex-col justify-between mb-6">
          <h1 className="text-2xl text-[var(--cl-font-primary)] font-semibold">
            Models
          </h1>
          <p className="text-sm text-[var(--cl-font-secondary)]">
            Manage segmentation model registration and activation
          </p>
        </div>
        <Button
          label="Register Model"
          className="h-min"
          ico={<SvgIcon name="upload" />}
          onClick={() => setUploadModalOpen(true)}
        />
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card hoverable>
          <SummaryCard
            label="Total Models"
            value={models.length}
            icon="box"
            classNameValue="text-[var(--cl-white)]"
          />
        </Card>
        <Card hoverable>
          <SummaryCard
            label="Active"
            value={models.filter((model) => model.active).length}
            icon="circle-check-big"
            classNameValue="text-[var(--cl-green)]"
          />
        </Card>
        <Card hoverable>
          <SummaryCard
            label="Weights"
            value={models.filter((model) => model.artifact_type === "weights").length}
            icon="file-box"
            classNameValue="text-[var(--cl-blue)]"
          />
        </Card>
        <Card hoverable>
          <SummaryCard
            label="Architectures"
            value={new Set(models.map((model) => model.architecture ?? model.framework)).size}
            icon="cpu"
            classNameValue="text-[var(--cl-yellow)]"
          />
        </Card>
      </div>

      <Card className="my-4">
        <div className="flex flex-row items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold" style={{ color: "var(--cl-font-secondary)" }}>
              Active Model
            </p>
            <p className="text-lg font-bold" style={{ color: "var(--cl-font-primary)" }}>
              {activeModel?.name ?? "No active model"}
            </p>
            <p className="text-sm" style={{ color: "var(--cl-font-secondary)" }}>
              {activeModel ? activeModel.version : "Activate a registered model before segmenting"}
            </p>
          </div>
          {activeModel && (
            <div className="flex flex-row gap-6">
              <div className="flex flex-col items-center gap-1">
                <p className="text-xs" style={{ color: "var(--cl-font-secondary)" }}>
                  Architecture
                </p>
                <p className="text-lg font-bold" style={{ color: "var(--cl-font-primary)" }}>
                  {activeModel.architecture ?? activeModel.framework}
                </p>
              </div>
              <div className="flex flex-col items-center gap-1">
                <p className="text-xs" style={{ color: "var(--cl-font-secondary)" }}>
                  Artifact
                </p>
                <p className="text-lg font-bold" style={{ color: "var(--cl-font-primary)" }}>
                  {activeModel.artifact_type}
                </p>
              </div>
              <div className="flex flex-col items-center gap-1">
                <p className="text-xs" style={{ color: "var(--cl-font-secondary)" }}>
                  Classes
                </p>
                <p className="text-lg font-bold" style={{ color: "var(--cl-font-primary)" }}>
                  {activeModel.classes.length}
                </p>
              </div>
            </div>
          )}
        </div>
      </Card>

      <div className="flex my-4 flex-row items-center gap-2">
        <InputText
          placeholder="Search models by name, version, architecture, or artifact..."
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
        <Button
          label={loadingModels ? "Refreshing" : "Refresh"}
          variant="secondary"
          disabled={loadingModels}
          onClick={() => void loadModels()}
        />
      </div>

      {registryError && (
        <p className="mb-3 text-xs" style={{ color: "var(--cl-red)" }}>
          {registryError}
        </p>
      )}
      {activationError && (
        <p className="mb-3 text-xs" style={{ color: "var(--cl-red)" }}>
          {activationError}
        </p>
      )}

      <Table columns={columns} data={filteredData as unknown as Record<string, unknown>[]} />

      <Modal
        open={uploadModalOpen}
        onClose={() => {
          setUploadModalOpen(false);
          resetUploadForm();
        }}
        title="Register Model"
        description="Add a model artifact and runtime metadata"
        icon="brain"
      >
        <div className="flex flex-col gap-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".h5,.keras,.pth,.pt,.pkl,.joblib"
            className="hidden"
            onChange={(event) => setModelFile(event.target.files?.[0] ?? null)}
          />

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: "var(--cl-font-secondary)" }}>
                Model Name
              </label>
              <InputText
                placeholder="e.g. graphene-mask-rcnn"
                value={modelName}
                onChange={(event) => setModelName(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: "var(--cl-font-secondary)" }}>
                Version
              </label>
              <InputText
                placeholder="e.g. 1.0.0"
                value={version}
                onChange={(event) => setVersion(event.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: "var(--cl-font-secondary)" }}>
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
              <label className="text-xs font-semibold" style={{ color: "var(--cl-font-secondary)" }}>
                Artifact Type
              </label>
              <SelectList
                options={artifactTypeOptions}
                value={artifactType}
                onChange={(value) => setArtifactType(value as ArtifactType)}
                className="w-full"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold" style={{ color: "var(--cl-font-secondary)" }}>
              Class Names
            </label>
            <InputText
              placeholder="background, few-layer, bulk"
              value={classNames}
              onChange={(event) => setClassNames(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold" style={{ color: "var(--cl-font-secondary)" }}>
              Runtime Config JSON
            </label>
            <textarea
              className="min-h-[8rem] rounded-md border-2 px-4 py-2 text-sm font-semibold outline-none"
              style={{
                background: "var(--bg-input)",
                borderColor: "var(--cl-border)",
                color: "var(--cl-font-primary)",
              }}
              value={artifactType === "full_model" ? configJson : configJson}
              onChange={(event) => setConfigJson(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold" style={{ color: "var(--cl-font-secondary)" }}>
              Description
            </label>
            <InputText
              placeholder="Describe what this model does..."
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold" style={{ color: "var(--cl-font-secondary)" }}>
              Model Artifact
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
              <p className="text-sm font-medium" style={{ color: "var(--cl-font-primary)" }}>
                Drop your model file here or click to browse
              </p>
              <p className="text-xs" style={{ color: "var(--cl-font-secondary)" }}>
                Supports .h5, .keras, .pth, .pt, .pkl, .joblib
              </p>
            </div>
            {modelFile && (
              <p className="text-xs" style={{ color: "var(--cl-font-secondary)" }}>
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
              onClick={() => {
                setUploadModalOpen(false);
                resetUploadForm();
              }}
            />
            <Button
              label={uploading ? "Registering..." : "Register Model"}
              ico={<SvgIcon name="plus" />}
              disabled={uploading}
              onClick={() => void handleModelUpload()}
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={detailsModalOpen}
        onClose={() => setDetailsModalOpen(false)}
        title="Model Details"
        description="Registry metadata and activation status"
        icon="brain"
      >
        <div className="flex flex-col gap-3 text-sm" style={{ color: "var(--cl-font-primary)" }}>
          <p><strong>Name:</strong> {selectedRow?.name}</p>
          <p><strong>Version:</strong> {selectedRow?.version}</p>
          <p><strong>Architecture:</strong> {selectedRow?.architecture ?? selectedRow?.framework}</p>
          <p><strong>Artifact:</strong> {selectedRow?.artifact_type}</p>
          <p><strong>File:</strong> {selectedRow ? formatFileSize(selectedRow.artifact_path) : "-"}</p>
          <p><strong>Classes:</strong> {selectedRow?.classes.join(", ") || "-"}</p>
          <p><strong>Status:</strong> {selectedRow?.active ? "Active" : selectedRow?.last_activation_status ?? "Inactive"}</p>
          {selectedRow?.last_activation_error && (
            <p style={{ color: "var(--cl-red)" }}>
              <strong>Last activation error:</strong> {selectedRow.last_activation_error}
            </p>
          )}
          <pre
            className="max-h-56 overflow-auto rounded-md border-2 p-3 text-xs"
            style={{ borderColor: "var(--cl-border)", background: "var(--bg-input)" }}
          >
            {JSON.stringify(selectedRow?.config ?? {}, null, 2)}
          </pre>
          {selectedRow && (
            <div className="flex justify-end">
              <Button
                label={selectedRow.active ? "Active" : "Activate"}
                disabled={selectedRow.active || activatingId === selectedRow.id}
                onClick={() => void handleActivate(selectedRow.id)}
              />
            </div>
          )}
        </div>
      </Modal>
    </main>
  );
}
