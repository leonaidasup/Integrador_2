import { Button } from "../components/Button";
import { SvgIcon } from "../components/SvgIcon";
import { Card } from "../components/Card";

export default function Dashboard() {
  return (
    <main className="flex-1 overflow-y-auto p-6 bg-[var(--bg-page-user)]">
      {/* header */}
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
        {/* upload */}
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
            <div className="flex flex-row gap-2 mt-1">
              {["PNG", "TIFF", "JPEG"].map((fmt) => (
                <span
                  key={fmt}
                  className="px-2 py-0.5 rounded text-xs font-medium"
                  style={{
                    background: "var(--bg-tables-selector)",
                    color: "var(--cl-font-secondary)",
                  }}
                >
                  {fmt}
                </span>
              ))}
              <span
                className="text-xs"
                style={{ color: "var(--cl-font-secondary)" }}
              >
                up to 50MB
              </span>
            </div>
          </div>
        </Card>

        {/* ai analysis */}
        <Card title="AI Analysis">
          <div className="flex flex-row items-center justify-between">
            <div className="flex flex-col gap-1">
              <p
                className="text-sm font-semibold"
                style={{ color: "var(--cl-font-primary)" }}
              >
                CellSegNet v2.3
              </p>
              <p
                className="text-xs"
                style={{ color: "var(--cl-font-secondary)" }}
              >
                Ready for analysis
              </p>
            </div>
            <Button label="Run Segmentation" ico={<SvgIcon name="play" />} />
          </div>
          <div
            className="flex flex-col gap-1 rounded-lg p-3 mt-2"
            style={{ background: "var(--bg-tables-selector)" }}
          >
            <p
              className="text-xs font-semibold"
              style={{ color: "var(--cl-font-secondary)" }}
            >
              Model Confidence
            </p>
            <p
              className="text-xs"
              style={{ color: "var(--cl-font-secondary)" }}
            >
              Awaiting analysis
            </p>
          </div>
        </Card>

        {/* annotation tools */}
        <Card title="Annotation Tools">
          <div
            className="flex flex-col gap-2 rounded-lg p-3"
            style={{ background: "var(--bg-tables-selector)" }}
          >
            <p
              className="text-xs font-semibold"
              style={{ color: "var(--cl-font-secondary)" }}
            >
              Awaiting segmentation
            </p>
            <p
              className="text-xs"
              style={{ color: "var(--cl-font-secondary)" }}
            >
              Run AI segmentation first to enable manual correction tools
            </p>
          </div>
        </Card>

        {/* export results */}
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
    </main>
  );
}
