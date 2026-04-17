import { useState } from "react";
import { Button } from "../components/Button";
import { SvgIcon } from "../components/SvgIcon";
import { InputText } from "../components/InputText";
import { Card } from "../components/Card";
import { SummaryCard } from "../components/SummaryCard";
import { SelectList } from "../components/SelectList";
import { Table } from "../components/Table";
import { Modal } from "../components/Modal";

const summaryDatasets = {
  "Total Datasets": 58,
  "Total Images": 856,
  Ready: 41,
  Processing: 4,
};

const statusStyles: Record<string, { bg: string; color: string }> = {
  ready: { bg: "var(--bg-green)", color: "var(--cl-green)" },
  processing: { bg: "var(--bg-yellow)", color: "var(--cl-yellow)" },
  failed: { bg: "var(--bg-red)", color: "var(--cl-red)" },
};

const data = [
  {
    preview: "image",
    name: "Data 5.2",
    description: "Descripcion del data set",
    images: 2847,
    tags: ["Tag 1", "Tag 2", "Categoría"],
    size: "4.2 GB",
    updated: "Mar 12, 2026",
    actions: "",
  },
  {
    preview: "image",
    name: "Data 1.2",
    description: "Descripcion del data set",
    images: 1523,
    tags: ["Tag 1", "Categoría"],
    size: "2.8 GB",
    updated: "Mar 10, 2026",
    actions: "",
  },
  {
    preview: "image",
    name: "Data 3.2",
    description: "Descripcion del data set",
    images: 856,
    tags: ["Tag 1", "Tag 1 2", "Tag3"],
    size: "1.5 GB",
    updated: "Mar 8, 2026",
    actions: "",
  },
  {
    preview: "image",
    name: "Data 1",
    description: "Descripcion del data set …",
    images: 420,
    tags: ["Tag 1", "Otra Categoría", "Categoría"],
    size: "680 MB",
    updated: "Mar 6, 2026",
    actions: "",
  },
  {
    preview: "image",
    name: "Data 0.0",
    description: "Descripcion del data set",
    images: 3210,
    tags: ["Tag 1", "Tangamandapio"],
    size: "5.7 GB",
    updated: "Mar 4, 2026",
    actions: "",
  },
];

const MAX_TAGS = 2;

const textRender = (value: any) => <span className="font-medium">{value}</span>;

const columns = [
  {
    key: "preview",
    label: "Preview",
    render: () => (
      <div
        className="w-10 h-10 rounded-md flex items-center justify-center"
        style={{ background: "var(--bg-blue)" }}
      >
        <SvgIcon name="image" className="text-[var(--cl-blue)]" />
      </div>
    ),
  },
  { key: "name", label: "Name", render: textRender },
  { key: "description", label: "Description", render: textRender },
  { key: "images", label: "Images", render: textRender },
  {
    key: "tags",
    label: "Tags",
    render: (value: string[]) => (
      <div className="flex flex-row flex-wrap gap-1">
        {value.slice(0, MAX_TAGS).map((tag) => (
          <span
            key={tag}
            className="px-2 py-0.5 rounded-md text-xs font-medium"
            style={{
              background: "var(--bg-tables-selector)",
              color: "var(--cl-font-secondary)",
            }}
          >
            {tag}
          </span>
        ))}
        {value.length > MAX_TAGS && (
          <span
            className="px-2 py-0.5 rounded-md text-xs font-medium"
            style={{
              background: "var(--bg-tables-selector)",
              color: "var(--cl-font-secondary)",
            }}
          >
            +{value.length - MAX_TAGS}
          </span>
        )}
      </div>
    ),
  },
  { key: "size", label: "Size", render: textRender },
  { key: "updated", label: "Updated", render: textRender },
  {
    key: "actions",
    label: "Actions",
    render: () => (
      <div className="flex flex-row gap-2">
        <SvgIcon
          name="ellipsis"
          className="text-[var(--cl-font-secondary)] cursor-pointer"
        />
      </div>
    ),
  },
];

export default function Datasets() {
  const sortOptions = [
    { label: "All", value: "all" },
    { label: "Name A-Z", value: "name" },
    { label: "Date", value: "date" },
    { label: "Size", value: "size" },
    { label: "Images", value: "images" },
  ];

  const [sort, setSort] = useState("all");
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  const [search, setSearch] = useState("");
  const parseSize = (size: string): number => {
    const [num, unit] = size.split(" ");
    const val = parseFloat(num);
    if (unit === "GB") return val * 1024;
    if (unit === "MB") return val;
    return val;
  };
  const filteredData = data
    .filter((row) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        row.name.toLowerCase().includes(q) ||
        row.description.toLowerCase().includes(q) ||
        row.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => {
      switch (sort) {
        case "name":
          return a.name.localeCompare(b.name);
        case "images":
          return b.images - a.images;
        case "size":
          return parseSize(b.size) - parseSize(a.size); // mayor a menor
        case "date":
          return a.updated.localeCompare(b.updated);
        default:
          return 0;
      }
    });

  return (
    <main className="flex-1 overflow-y-auto p-6 bg-[var(--bg-page-user)]">
      <div className="flex flex-row items-center justify-between">
        <div className="flex flex-col justify-between mb-6">
          <h1 className="text-2xl text-[var(--cl-font-primary)] font-semibold">
            Datasets
          </h1>
          <p className="text-sm text-[var(--cl-font-secondary)]">
            Manage your microscopy image collections
          </p>
        </div>
        <Button
          label="Upload Dataset"
          className="h-min"
          ico={<SvgIcon name="upload" />}
          onClick={() => setUploadModalOpen(true)}
        />
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card hoverable>
          <SummaryCard
            label="Total Datasets"
            value={summaryDatasets["Total Datasets"]}
            icon="database"
            classNameValue="text-[var(--cl-white)]"
          />
        </Card>
        <Card hoverable>
          <SummaryCard
            label="Total Images"
            value={summaryDatasets["Total Images"]}
            icon="image"
            classNameValue="text-[var(--cl-white)]"
          />
        </Card>
        <Card hoverable>
          <SummaryCard
            label="Ready"
            value={summaryDatasets["Ready"]}
            icon="circle-check-big"
            classNameValue="text-[var(--cl-green)]"
          />
        </Card>
        <Card hoverable>
          <SummaryCard
            label="Processing"
            value={summaryDatasets["Processing"]}
            icon="loader-circle"
            classNameValue="text-[var(--cl-yellow)]"
          />
        </Card>
      </div>

      <div className="flex my-4 flex-row items-center gap-2">
        <InputText
          placeholder="Search datasets by name, description, or tags..."
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
        title="Upload Dataset"
        description="Add a new image collection to your workspace"
        icon="database"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label
              className="text-xs font-semibold"
              style={{ color: "var(--cl-font-secondary)" }}
            >
              Dataset Name
            </label>
            <InputText placeholder="e.g. Cell Microscopy v2" />
          </div>

          <div className="flex flex-col gap-1">
            <label
              className="text-xs font-semibold"
              style={{ color: "var(--cl-font-secondary)" }}
            >
              Description
            </label>
            <InputText placeholder="Describe the contents of this dataset..." />
          </div>

          <div className="flex flex-col gap-1">
            <label
              className="text-xs font-semibold"
              style={{ color: "var(--cl-font-secondary)" }}
            >
              Tags
            </label>
            <InputText placeholder="e.g. cells, tissue, microscopy" />
          </div>

          {/* drop zone */}
          <div className="flex flex-col gap-1">
            <label
              className="text-xs font-semibold"
              style={{ color: "var(--cl-font-secondary)" }}
            >
              Images
            </label>
            <div
              className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 cursor-pointer"
              style={{ borderColor: "var(--cl-border)" }}
            >
              <SvgIcon
                name="image"
                className="text-[var(--cl-font-secondary)]"
                size="w-8 h-8"
              />
              <p
                className="text-sm font-medium"
                style={{ color: "var(--cl-font-primary)" }}
              >
                Drop your images here or click to browse
              </p>
              <p
                className="text-xs"
                style={{ color: "var(--cl-font-secondary)" }}
              >
                Supports PNG, TIFF, JPEG — up to 50MB per file
              </p>
            </div>
          </div>

          <div className="flex flex-row justify-end gap-2 mt-2">
            <Button
              label="Cancel"
              variant="secondary"
              onClick={() => setUploadModalOpen(false)}
            />
            <Button label="Upload Dataset" ico={<SvgIcon name="upload" />} />
          </div>
        </div>
      </Modal>
    </main>
  );
}
