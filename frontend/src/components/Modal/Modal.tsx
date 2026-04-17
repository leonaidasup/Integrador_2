import React, { useEffect, useRef } from "react";
import { SvgIcon } from "../SvgIcon";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  icon?: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  description,
  icon,
  children,
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
    >
      <div
        ref={ref}
        className="flex flex-col gap-4 rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
        style={{
          backgroundColor: "var(--bg-frame)",
          border: "1px solid var(--cl-border)",
        }}
      >
        <div className="flex flex-row items-start justify-between">
          <div className="flex flex-row items-center gap-3">
            {icon && (
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{
                  background: "var(--bg-blue)",
                  border: "1px solid var(--cl-blue)",
                }}
              >
                <SvgIcon name={icon} className="text-[var(--cl-blue)]" />
              </div>
            )}
            <div className="flex flex-col gap-1">
              <h2
                className="text-lg font-semibold"
                style={{ color: "var(--cl-font-primary)" }}
              >
                {title}
              </h2>
              {description && (
                <p
                  className="text-sm"
                  style={{ color: "var(--cl-font-secondary)" }}
                >
                  {description}
                </p>
              )}
            </div>
          </div>
        </div>

        {children}
      </div>
    </div>
  );
};
