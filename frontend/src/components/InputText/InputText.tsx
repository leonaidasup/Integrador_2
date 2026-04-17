import React from "react";

type InputType = "text" | "password";

interface InputProps {
  type?: InputType;
  placeholder?: string;
  value?: string;
  className?: string;
  disabled?: boolean;
  ico?: React.ReactNode;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const inputStyles: React.CSSProperties = {
  backgroundColor: "var(--bg-input)",
  color: "var(--cl-font-primary)",
  border: "2px solid var(--cl-border)",
};

const inputHoverStyles: React.CSSProperties = {
  backgroundColor: "var(--bg-input-hover)",
  color: "var(--cl-font-primary)",
  border: "2px solid var(--cl-border)",
};

export const InputText: React.FC<InputProps> = ({
  type = "text",
  placeholder = "",
  value,
  className = "",
  disabled = false,
  ico,
  onChange,
}) => {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={isHovered && !disabled ? inputHoverStyles : inputStyles}
      className={`
        flex items-center gap-2 px-4 py-2 rounded-md
        transition-all duration-200
        ${disabled ? "opacity-50 cursor-not-allowed" : "opacity-100"}
        ${className}
      `}
    >
      {ico && (
        <span className="w-4 h-4 flex items-center justify-center">{ico}</span>
      )}
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={onChange}
        style={{
          background: "transparent",
          outline: "none",
          color: "var(--cl-font-primary)",
        }}
        className="text-sm font-semibold w-full placeholder:text-[var(--cl-font-secondary)]"
      />
    </div>
  );
};
