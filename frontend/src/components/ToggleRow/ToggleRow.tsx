interface Props {
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}

export function ToggleRow({ title, description, checked, onChange }: Props) {
  return (
    <div className="flex items-center justify-between py-2.5">
      {/* TEXT */}
      <div className="flex flex-col gap-0.5">
        <span
          className="text-sm font-medium"
          style={{ color: "var(--cl-font-primary)" }}
        >
          {title}
        </span>
        <span className="text-xs" style={{ color: "var(--cl-font-secondary)" }}>
          {description}
        </span>
      </div>

      {/* TOGGLE */}
      <button
        onClick={() => onChange(!checked)}
        className="w-11 h-6 rounded-full flex items-center px-1 transition-all duration-300"
        style={{
          background: checked ? "var(--bg-button-primary)" : "var(--bg-input)",
        }}
      >
        <div
          className={`w-4 h-4 bg-white rounded-full shadow-md transform transition-all duration-300 ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
