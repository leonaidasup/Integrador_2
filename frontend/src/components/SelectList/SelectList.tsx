import { useState, useRef, useEffect } from "react";
import { SvgIcon } from "../SvgIcon";

interface Option {
  label: string;
  value: string;
}

interface Props {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function SelectList({
  options,
  value,
  onChange,
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={() => setOpen(!open)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="border-2 border-[var(--cl-border)] rounded-lg px-3 py-2 text-sm cursor-pointer flex items-center gap-2 w-full transition-all duration-200"
        style={{
          background: !hovered ? "var(--bg-input)" : "var(--bg-input-hover)",
          color: "var(--cl-font-primary)",
          minWidth: className ? undefined : "9rem",
        }}
      >
        <span className="flex-1 text-left">{selected?.label}</span>
        <span
          className={`flex items-center transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        >
          <SvgIcon name="chevron-down" />
        </span>
      </button>

      <div
        className={`
          absolute z-10 mt-1 w-full border-2 border-[var(--cl-border)] rounded-lg overflow-hidden
          transition-all duration-200 origin-top
          ${open ? "scale-y-100 opacity-100" : "scale-y-0 opacity-0"}
        `}
        style={{ background: "var(--bg-list)" }}
      >
        {options.map((opt, index) => (
          <button
            key={opt.value}
            onClick={() => {
              onChange(opt.value);
              setOpen(false);
            }}
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
            className="w-full text-left px-3 py-2 text-sm cursor-pointer transition-all duration-200"
            style={{
              color: "var(--cl-font-primary)",
              background:
                hoveredIndex === index
                  ? "var(--bg-input-hover)"
                  : "transparent",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
