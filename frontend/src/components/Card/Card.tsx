import React, { useState } from "react";

interface CardProps {
  title?: string;
  children?: React.ReactNode;
  className?: string;
  hoverable?: boolean;
}

export const Card: React.FC<CardProps> = ({
  title,
  children,
  className = "",
  hoverable = false,
}) => {
  const [hovered, setHovered] = useState(false);

  const cardStyles: React.CSSProperties = {
    backgroundColor: "var(--bg-frame)",
    border: "1px solid var(--cl-border)",
    boxShadow:
      hoverable && hovered ? "0 0px 7px var(--cl-font-secondary)" : "none",
  };

  return (
    <div
      style={cardStyles}
      className={`flex flex-col rounded-lg p-4 gap-3 transition-shadow duration-200 ${className}`}
      onMouseEnter={() => hoverable && setHovered(true)}
      onMouseLeave={() => hoverable && setHovered(false)}
    >
      {title && (
        <p
          className="text-sm font-semibold"
          style={{ color: "var(--cl-font-primary)" }}
        >
          {title}
        </p>
      )}
      {children}
    </div>
  );
};
