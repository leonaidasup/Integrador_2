import { useEffect, useRef, useState } from "react";
import { Button } from "../components/Button";
import { SvgIcon } from "../components/SvgIcon";
import { InputText } from "../components/InputText";
import { Card } from "../components/Card";
import { SummaryCard } from "../components/SummaryCard";
import { SelectList } from "../components/SelectList";
import { Table } from "../components/Table";
import { Modal } from "../components/Modal";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

// ── Types ────────────────────────────────────────────────────────────────────

interface Dataset {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  tags: string[];
  version: string;
  image_count: number;
  created_at: string;
  updated_at: string;
}

interface DatasetListResponse {
  datasets: Dataset[];
  total: number;
}

interface ImageRecord {
  id: string;
  dataset_id: string;
  filename: string;
  storage_path: string;
  width: number | null;
  height: number | null;
  format: string | null;
  size_bytes: number | null;
  created_at: string;
}

interface ImageListResponse {
  images: ImageRecord[];
  total: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const token = () => localStorage.getItem("auth_token") ?? "";

const authHeaders = () => ({ Authorization: `Bearer ${token()}` });

const formatBytes = (bytes: number | null): string => {
  if (!bytes) return "-";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const MAX_TAGS = 2;

const sortOptions = [
  { label: "All", value: "all" },
  { label: "Name A-Z", value: "name" },
  { label: "Date", value: "date" },
  { label: "Images", value: "images" },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function Datasets() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Upload dataset modal
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [dsName, setDsName] = useState("");
  const [dsDescription, setDsDescription] = useState("");
  const [dsTags, setDsTags] = useState("");
  const [dsVersion, setDsVersion] = useState("1.0.0");
  const [dsFiles, setDsFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Images modal
  const [imagesModalOpen, setImagesModalOpen] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [imageUploadFile, setImageUploadFile] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const imageFileRef = useRef<HTMLInputElement | null>(null);

  // Delete modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [datasetToDelete, setDatasetToDelete] = useState<Dataset | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [sort, setSort] = useState("all");
  const [search, setSearch] = useState("");

  // ── API calls ──────────────────────────────────────────────────────────────

  const loadDatasets = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/datasets`, { headers: authHeaders() });
      const payload = (await res.json()) as DatasetListResponse & { detail?: string };
      if (!res.ok) { setError(payload.detail ?? "Could not load datasets."); return; }
      setDatasets(payload.datasets ?? []);
    } catch {
      setError("Could not reach backend.");
    } finally {
      setLoading(false);
    }
  };

  const loadImages = async (datasetId: string) => {
    setLoadingImages(true);
    setImageUploadError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/datasets/${datasetId}/images`, { headers: authHeaders() });
      const payload = (await res.json()) as ImageListResponse & { detail?: string };
      if (!res.ok) { setImageUploadError(payload.detail ?? "Could not load images."); return; }
      setImages(payload.images ?? []);
    } catch {
      setImageUploadError("Could not reach backend.");
    } finally {
      setLoadingImages(false);
    }
  };

  useEffect(() => { void loadDatasets(); }, []);

  // ── Create dataset + upload images ─────────────────────────────────────────

  const handleCreateDataset = async () => {
    if (!dsName.trim()) { setUploadError("Dataset name is required."); return; }
    setUploading(true);
    setUploadError(null);
    try {
      // 1. Create dataset
      const res = await fetch(`${API_BASE_URL}/datasets`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          name: dsName.trim(),
          description: dsDescription.trim() || null,
          tags: dsTags.split(",").map(t => t.trim()).filter(Boolean),
          version: dsVersion.trim() || "1.0.0",
        }),
      });
      const dataset = (await res.json()) as Dataset & { detail?: string };
      if (!res.ok) { setUploadError(dataset.detail ?? "Failed to create dataset."); return; }

      // 2. Upload images if any
      for (const file of dsFiles) {
        const form = new FormData();
        form.append("file", file);
        await fetch(`${API_BASE_URL}/datasets/${dataset.id}/images`, {
          method: "POST",
          headers: authHeaders(),
          body: form,
        });
      }

      await loadDatasets();
      resetUploadForm();
      setUploadModalOpen(false);
    } catch {
      setUploadError("Could not reach backend.");
    } finally {
      setUploading(false);
    }
  };

  const resetUploadForm = () => {
    setDsName(""); setDsDescription(""); setDsTags(""); setDsVersion("1.0.0");
    setDsFiles([]); setUploadError(null);
  };

  // ── Add image to existing dataset ──────────────────────────────────────────

  const handleAddImage = async () => {
    if (!imageUploadFile || !selectedDataset) return;
    setUploadingImage(true);
    setImageUploadError(null);
    try {
      const form = new FormData();
      form.append("file", imageUploadFile);
      const res = await fetch(`${API_BASE_URL}/datasets/${selectedDataset.id}/images`, {
        method: "POST",
        headers: authHeaders(),
        body: form,
      });
      const payload = await res.json();
      if (!res.ok) { setImageUploadError(payload.detail ?? "Upload failed."); return; }
      setImageUploadFile(null);
      await loadImages(selectedDataset.id);
      await loadDatasets();
    } catch {
      setImageUploadError("Could not reach backend.");
    } finally {
      setUploadingImage(false);
    }
  };

  // ── Delete dataset ─────────────────────────────────────────────────────────

  const handleDeleteDataset = async () => {
    if (!datasetToDelete) return;
    setDeleting(true);
    try {
      await fetch(`${API_BASE_URL}/datasets/${datasetToDelete.id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      await loadDatasets();
      setDeleteModalOpen(false);
      setDatasetToDelete(null);
    } catch {
      // silently fail
    } finally {
      setDeleting(false);
    }
  };

  // ── Table config ───────────────────────────────────────────────────────────

  const textRender = (value: unknown) => <span className="font-medium">{String(value ?? "-")}</span>;

  const columns = [
    {
      key: "preview",
      label: "Preview",
      render: () => (
        <div className="w-10 h-10 rounded-md flex items-center justify-center" style={{ background: "var(--bg-blue)" }}>
          <SvgIcon name="image" className="text-[var(--cl-blue)]" />
        </div>
      ),
    },
    { key: "name", label: "Name", render: textRender },
    {
      key: "description",
      label: "Description",
      render: (v: unknown) => (
        <span className="font-medium text-[var(--cl-font-secondary)]">
          {String(v ?? "-").slice(0, 60)}{String(v ?? "").length > 60 ? "…" : ""}
        </span>
      ),
    },
    { key: "image_count", label: "Images", render: textRender },
    {
      key: "tags",
      label: "Tags",
      render: (value: unknown) => {
        const tags = value as string[];
        return (
          <div className="flex flex-row flex-wrap gap-1">
            {tags.slice(0, MAX_TAGS).map((tag) => (
              <span key={tag} className="px-2 py-0.5 rounded-md text-xs font-medium"
                style={{ background: "var(--bg-tables-selector)", color: "var(--cl-font-secondary)" }}>
                {tag}
              </span>
            ))}
            {tags.length > MAX_TAGS && (
              <span className="px-2 py-0.5 rounded-md text-xs font-medium"
                style={{ background: "var(--bg-tables-selector)", color: "var(--cl-font-secondary)" }}>
                +{tags.length - MAX_TAGS}
              </span>
            )}
          </div>
        );
      },
    },
    { key: "version", label: "Version", render: textRender },
    {
      key: "updated_at",
      label: "Updated",
      render: (v: unknown) => <span className="font-medium">{formatDate(String(v))}</span>,
    },
    {
      key: "actions",
      label: "",
      render: (_: unknown, row: Record<string, unknown>) => {
        const ds = row as unknown as Dataset;
        return (
          <div className="flex flex-row gap-2 items-center justify-end">
            <Button
              label="Images"
              variant="secondary"
              ico={<SvgIcon name="image" />}
              onClick={() => {
                setSelectedDataset(ds);
                setImages([]);
                setImagesModalOpen(true);
                void loadImages(ds.id);
              }}
            />
            <Button
              variant="transparent"
              ico={<SvgIcon name="trash-2" />}
              onClick={() => {
                setDatasetToDelete(ds);
                setDeleteModalOpen(true);
              }}
            />
          </div>
        );
      },
    },
  ];

  // ── Filtered + sorted data ─────────────────────────────────────────────────

  const filteredData = datasets
    .filter((row) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        row.name.toLowerCase().includes(q) ||
        (row.description ?? "").toLowerCase().includes(q) ||
        row.tags.some((t) => t.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => {
      switch (sort) {
        case "name": return a.name.localeCompare(b.name);
        case "images": return b.image_count - a.image_count;
        case "date": return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        default: return 0;
      }
    });

  const totalImages = datasets.reduce((acc, d) => acc + d.image_count, 0);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="flex-1 overflow-y-auto p-6 bg-[var(--bg-page-user)]">
      <div className="flex flex-row items-center justify-between">
        <div className="flex flex-col justify-between mb-6">
          <h1 className="text-2xl text-[var(--cl-font-primary)] font-semibold">Datasets</h1>
          <p className="text-sm text-[var(--cl-font-secondary)]">Manage your microscopy image collections</p>
        </div>
        <Button label="Upload Dataset" className="h-min" ico={<SvgIcon name="upload" />} onClick={() => setUploadModalOpen(true)} />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card hoverable>
          <SummaryCard label="Total Datasets" value={datasets.length} icon="database" classNameValue="text-[var(--cl-white)]" />
        </Card>
        <Card hoverable>
          <SummaryCard label="Total Images" value={totalImages} icon="image" classNameValue="text-[var(--cl-white)]" />
        </Card>
        <Card hoverable>
          <SummaryCard label="With Images" value={datasets.filter(d => d.image_count > 0).length} icon="circle-check-big" classNameValue="text-[var(--cl-green)]" />
        </Card>
        <Card hoverable>
          <SummaryCard label="Empty" value={datasets.filter(d => d.image_count === 0).length} icon="loader-circle" classNameValue="text-[var(--cl-yellow)]" />
        </Card>
      </div>

      {/* Search + sort */}
      <div className="flex my-4 flex-row items-center gap-2">
        <InputText
          placeholder="Search datasets by name, description, or tags..."
          ico={<SvgIcon name="search" />}
          className="w-2/4"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <SvgIcon name="sliders-horizontal" className="text-[var(--cl-font-primary)]" size="w-5 h-5" />
        <SelectList options={sortOptions} value={sort} onChange={setSort} />
        <Button
          label={loading ? "Refreshing" : "Refresh"}
          variant="secondary"
          disabled={loading}
          onClick={() => void loadDatasets()}
        />
      </div>

      {error && <p className="mb-3 text-xs" style={{ color: "var(--cl-red)" }}>{error}</p>}

      <Table columns={columns} data={filteredData as unknown as Record<string, unknown>[]} />

      {/* ── Create Dataset Modal ── */}
      <Modal open={uploadModalOpen} onClose={() => { setUploadModalOpen(false); resetUploadForm(); }}
        title="Upload Dataset" description="Add a new image collection to your workspace" icon="database">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: "var(--cl-font-secondary)" }}>Dataset Name *</label>
              <InputText placeholder="e.g. Cell Microscopy v2" value={dsName} onChange={(e) => setDsName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: "var(--cl-font-secondary)" }}>Version</label>
              <InputText placeholder="1.0.0" value={dsVersion} onChange={(e) => setDsVersion(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold" style={{ color: "var(--cl-font-secondary)" }}>Description</label>
            <InputText placeholder="Describe the contents of this dataset..." value={dsDescription} onChange={(e) => setDsDescription(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold" style={{ color: "var(--cl-font-secondary)" }}>Tags</label>
            <InputText placeholder="e.g. cells, tissue, microscopy (comma separated)" value={dsTags} onChange={(e) => setDsTags(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold" style={{ color: "var(--cl-font-secondary)" }}>Images (optional)</label>
            <input ref={fileInputRef} type="file" accept=".png,.jpg,.jpeg,.tiff" multiple className="hidden"
              onChange={(e) => setDsFiles(Array.from(e.target.files ?? []))} />
            <div
              className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 cursor-pointer"
              style={{ borderColor: "var(--cl-border)" }}
              onClick={() => fileInputRef.current?.click()}
            >
              <SvgIcon name="image" className="text-[var(--cl-font-secondary)]" size="w-8 h-8" />
              <p className="text-sm font-medium" style={{ color: "var(--cl-font-primary)" }}>
                Drop images here or click to browse
              </p>
              <p className="text-xs" style={{ color: "var(--cl-font-secondary)" }}>PNG, TIFF, JPEG</p>
            </div>
            {dsFiles.length > 0 && (
              <p className="text-xs" style={{ color: "var(--cl-font-secondary)" }}>
                {dsFiles.length} file{dsFiles.length > 1 ? "s" : ""} selected
              </p>
            )}
          </div>

          {uploadError && <p className="text-xs" style={{ color: "var(--cl-red)" }}>{uploadError}</p>}

          <div className="flex flex-row justify-end gap-2 mt-2">
            <Button label="Cancel" variant="secondary" onClick={() => { setUploadModalOpen(false); resetUploadForm(); }} />
            <Button label={uploading ? "Creating..." : "Create Dataset"} ico={<SvgIcon name="upload" />} disabled={uploading}
              onClick={() => void handleCreateDataset()} />
          </div>
        </div>
      </Modal>

      {/* ── Images Modal ── */}
      <Modal open={imagesModalOpen} onClose={() => { setImagesModalOpen(false); setImageUploadFile(null); setImageUploadError(null); }}
        title={selectedDataset?.name ?? "Images"} description={`${images.length} image${images.length !== 1 ? "s" : ""} in this dataset`} icon="image">
        <div className="flex flex-col gap-4">
          {/* Add image */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold" style={{ color: "var(--cl-font-secondary)" }}>Add Image</label>
            <input ref={imageFileRef} type="file" accept=".png,.jpg,.jpeg,.tiff" className="hidden"
              onChange={(e) => setImageUploadFile(e.target.files?.[0] ?? null)} />
            <div className="flex flex-row gap-2 items-center">
              <div
                className="flex flex-1 items-center gap-2 rounded-lg border-2 border-dashed p-3 cursor-pointer"
                style={{ borderColor: "var(--cl-border)" }}
                onClick={() => imageFileRef.current?.click()}
              >
                <SvgIcon name="upload" className="text-[var(--cl-font-secondary)]" />
                <p className="text-sm" style={{ color: imageUploadFile ? "var(--cl-font-primary)" : "var(--cl-font-secondary)" }}>
                  {imageUploadFile ? imageUploadFile.name : "Click to select image"}
                </p>
              </div>
              <Button label={uploadingImage ? "Uploading..." : "Upload"} disabled={!imageUploadFile || uploadingImage}
                onClick={() => void handleAddImage()} />
            </div>
            {imageUploadError && <p className="text-xs" style={{ color: "var(--cl-red)" }}>{imageUploadError}</p>}
          </div>

          {/* Images list */}
          <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
            {loadingImages && <p className="text-xs" style={{ color: "var(--cl-font-secondary)" }}>Loading images...</p>}
            {!loadingImages && images.length === 0 && (
              <p className="text-xs" style={{ color: "var(--cl-font-secondary)" }}>No images yet. Upload the first one.</p>
            )}
            {images.map((img) => (
              <div key={img.id} className="flex flex-row items-center gap-3 p-3 rounded-lg"
                style={{ background: "var(--bg-tables-selector)", border: "1px solid var(--cl-border)" }}>
                <div className="w-8 h-8 rounded flex items-center justify-center" style={{ background: "var(--bg-blue)" }}>
                  <SvgIcon name="image" className="text-[var(--cl-blue)]" size="w-4 h-4" />
                </div>
                <div className="flex flex-col flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color: "var(--cl-font-primary)" }}>{img.filename}</p>
                  <p className="text-xs" style={{ color: "var(--cl-font-secondary)" }}>
                    {img.width && img.height ? `${img.width}×${img.height}` : ""} {img.format?.toUpperCase() ?? ""} · {formatBytes(img.size_bytes)}
                  </p>
                </div>
                <p className="text-xs" style={{ color: "var(--cl-font-secondary)" }}>{formatDate(img.created_at)}</p>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      {/* ── Delete Confirmation Modal ── */}
      <Modal open={deleteModalOpen} onClose={() => { setDeleteModalOpen(false); setDatasetToDelete(null); }}
        title="Delete Dataset" description="This action cannot be undone" icon="trash-2">
        <div className="flex flex-col gap-4">
          <p className="text-sm" style={{ color: "var(--cl-font-primary)" }}>
            Are you sure you want to delete <strong>{datasetToDelete?.name}</strong>?
            {(datasetToDelete?.image_count ?? 0) > 0 && (
              <> It contains <strong>{datasetToDelete?.image_count} image{datasetToDelete?.image_count !== 1 ? "s" : ""}</strong>.</>
            )}
          </p>
          <div className="flex flex-row justify-end gap-2">
            <Button label="Cancel" variant="secondary" onClick={() => { setDeleteModalOpen(false); setDatasetToDelete(null); }} />
            <Button label={deleting ? "Deleting..." : "Delete"} disabled={deleting} onClick={() => void handleDeleteDataset()} />
          </div>
        </div>
      </Modal>
    </main>
  );
}
