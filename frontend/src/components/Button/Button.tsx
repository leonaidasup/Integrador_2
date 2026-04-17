import React from "react";

type Variant = "primary" | "secondary" | "navigation" | "transparent";

interface ButtonProps {
  label?: string;
  variant?: Variant;
  className?: string;
  disabled?: boolean;
  ico?: React.ReactNode;
  active?: boolean;
  cursorStyle?: string;
  onClick?: () => void;
}

const variantStyles: Record<Variant, React.CSSProperties> = {
  primary: {
    backgroundColor: "var(--bg-button-primary)",
    color: "var(--cl-font-primary)",
  },
  secondary: {
    backgroundColor: "var(--bg-button-secondary)",
    color: "var(--cl-font-primary)",
  },
  navigation: {
    backgroundColor: "transparent",
    color: "var(--cl-font-secondary)",
  },
  transparent: {
    color: "var(--cl-font-secondary)",
  },
};

const variantHoverStyles: Record<Variant, React.CSSProperties> = {
  primary: {
    backgroundColor: "var(--bg-button-primary-hvr)",
    color: "var(--cl-font-primary)",
    boxShadow: "0 0px 5px var(--bg-button-primary)",
  },
  secondary: {
    backgroundColor: "var(--bg-button-secondary-hvr)",
    color: "var(--cl-font-primary)",
    boxShadow: "0 0px 5px var(--cl-font-secondary)",
  },
  navigation: {
    backgroundColor: "var(--bg-blue)",
    color: "var(--cl-font-primary)",
    boxShadow: "0 0px 5px var(--bg-blue)",
  },
  transparent: {
    color: "var(--cl-font-primary)",
  },
};

const variantActiveStyles: Record<Variant, React.CSSProperties> = {
  primary: {},
  secondary: {},
  navigation: {
    backgroundColor: "var(--bg-button-primary)",
    color: "var(--cl-font-primary)",
    boxShadow: "0 0px 5px var(--bg-button-primary)",
  },
  transparent: {},
};

export const Button: React.FC<ButtonProps> = ({
  label = "",
  variant = "primary",
  className = "",
  disabled = false,
  ico,
  active = false,
  cursorStyle = "",
  onClick = () => {},
}) => {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={
        active
          ? variantActiveStyles[variant]
          : isHovered && !disabled
          ? variantHoverStyles[variant]
          : variantStyles[variant]
      }
      className={`
        flex items-center gap-1.5 rounded-md transition-all duration-200 text-sm font-semibold
        ${label ? "px-4 py-2" : "mx-4 my-2"}
        ${disabled ? "opacity-50 cursor-default" : "opacity-100"}
        ${cursorStyle}
        ${className}
      `}
    >
      {ico && <span className="flex items-center justify-center">{ico}</span>}
      {label}
    </button>
  );
};
