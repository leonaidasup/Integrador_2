import React, { useState, useRef, useEffect } from "react";
import { Button } from "../Button";
import { SvgIcon } from "../SvgIcon";
import { InputText } from "../InputText";

interface HeaderProps {
  children?: React.ReactNode;
  onLogout?: () => void;
}

const headerStyles: React.CSSProperties = {
  backgroundColor: "var(--bg-title-user)",
  borderBottom: "1px solid var(--cl-border)",
};

export const Header: React.FC<HeaderProps> = ({ children, onLogout }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const menuItems = [
    { label: "Edit Profile", icon: "user", action: () => {} },
    { label: "Settings", icon: "settings", action: () => {} },
  ];

  return (
    <header
      style={headerStyles}
      className="flex items-center w-full px-4 py-3 gap-4"
    >
      <div className="flex flex-row items-center gap-4 w-full">
        <Button
          className="rounded-3xl"
          ico={<SvgIcon name="user" size="w-5 h-5" />}
        />
        <div>
          <p className="text-lg font-bold text-[var(--cl-font-primary)]">
            Plataforma
          </p>
          <p className="text-sm font-semibold text-[var(--cl-font-third)]">
            AI Platform
          </p>
        </div>
        <InputText
          className="w-4/12"
          ico={<SvgIcon name="search" />}
          placeholder="Search experiments, datasets and anythings"
        />
      </div>

      <div className="flex flex-row items-center justify-center gap-0.5">
        <Button
          variant="transparent"
          ico={<SvgIcon name="circle-question-mark" size="w-5 h-5" />}
          label="Help"
          className="gap-3"
        />
        <div
          style={{ backgroundColor: "var(--cl-border)" }}
          className="w-px h-6 m-2"
        />
        <Button
          className="rounded-full"
          variant="transparent"
          ico={<SvgIcon name="bell" size="w-5 h-5" glow="var(--cl-white)" />}
        />

        {/* user menu */}
        <div ref={menuRef} className="relative">
          <Button
            className="rounded-full"
            variant="transparent"
            ico={<SvgIcon name="user" size="w-5 h-5" glow="var(--cl-white)" />}
            onClick={() => setMenuOpen(!menuOpen)}
          />

          {menuOpen && (
            <div
              className="absolute right-0 mt-2 w-48 rounded-lg overflow-hidden z-50"
              style={{
                background: "var(--bg-list)",
                border: "1px solid var(--cl-border)",
              }}
            >
              {menuItems.map((item) => (
                <button
                  key={item.label}
                  onClick={() => {
                    item.action();
                    setMenuOpen(false);
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "var(--bg-input-hover)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                  className="w-full flex flex-row items-center gap-3 px-4 py-2 text-sm transition-colors duration-200 cursor-pointer"
                  style={{ color: "var(--cl-font-primary)" }}
                >
                  <SvgIcon name={item.icon} size="w-4 h-4" />
                  {item.label}
                </button>
              ))}

              <div
                style={{ borderTop: "1px solid var(--cl-border)" }}
                className="my-1"
              />

              <button
                onClick={() => {
                  setMenuOpen(false);
                  onLogout?.();
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "var(--bg-red)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
                className="w-full flex flex-row items-center gap-3 px-4 py-2 text-sm transition-colors duration-200 cursor-pointer"
                style={{ color: "var(--cl-red)" }}
              >
                <SvgIcon name="log-out" size="w-4 h-4" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
