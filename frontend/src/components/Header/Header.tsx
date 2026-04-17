import React, { useState, useRef, useEffect } from "react";
import { Button } from "../Button";
import { SvgIcon } from "../SvgIcon";
import { InputText } from "../InputText";
import { Modal } from "../Modal";
import { SelectList } from "../SelectList";
import { ToggleRow } from "../ToggleRow";

interface HeaderProps {
  children?: React.ReactNode;
  onLogout?: () => void;
}

// ─── estilos compartidos ───────────────────────────────────────────────────

const headerStyles: React.CSSProperties = {
  backgroundColor: "var(--bg-title-user)",
  borderBottom: "1px solid var(--cl-border)",
};

const dropdownStyles = (open: boolean): React.CSSProperties => ({
  position: "absolute",
  right: 0,
  marginTop: "8px",
  width: "192px",
  borderRadius: "8px",
  overflow: "hidden",
  zIndex: 50,
  background: "var(--bg-list)",
  border: "1px solid var(--cl-border)",
  opacity: open ? 1 : 0,
  transform: open ? "translateY(0) scale(1)" : "translateY(-8px) scale(0.97)",
  pointerEvents: open ? "auto" : "none",
  transition: "opacity 180ms ease, transform 180ms ease",
});

const menuItemStyles: React.CSSProperties = {
  width: "100%",
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  gap: "12px",
  padding: "8px 16px",
  fontSize: "14px",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  color: "var(--cl-font-primary)",
  transition: "background 120ms ease",
};

interface ProfileForm {
  name: string;
  email: string;
  role: string;
  bio: string;
}

interface SettingsState {
  emailNotifications: boolean;
  trainingAlerts: boolean;
  uploadNotifications: boolean;
  autoSave: boolean;
  language: string;
  timezone: string;
}

interface SelectRowProps {
  title: string;
  description: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (val: string) => void;
}

const SelectRow: React.FC<SelectRowProps> = ({
  title,
  description,
  value,
  options,
  onChange,
}) => (
  <div
    className="flex items-center justify-between py-2.5"
    style={{ borderBottom: "1px solid var(--cl-border)" }}
  >
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
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-xs px-2 py-1 rounded-md"
      style={{
        border: "1px solid var(--cl-border)",
        background: "var(--bg-input)",
        color: "var(--cl-font-primary)",
        cursor: "pointer",
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  </div>
);

// ─── componente principal ──────────────────────────────────────────────────

export const Header: React.FC<HeaderProps> = ({ children, onLogout }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  const [profile, setProfile] = useState<ProfileForm>({
    name: "",
    email: "",
    role: "",
    bio: "",
  });

  const [settings, setSettings] = useState<SettingsState>({
    emailNotifications: true,
    trainingAlerts: true,
    uploadNotifications: false,
    autoSave: true,
    language: "en",
    timezone: "UTC-5",
  });

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

  const handleProfileChange = (field: keyof ProfileForm, value: string) =>
    setProfile((prev) => ({ ...prev, [field]: value }));

  const handleSettingChange = <K extends keyof SettingsState>(
    key: K,
    value: SettingsState[K]
  ) => setSettings((prev) => ({ ...prev, [key]: value }));

  const handleSaveProfile = () => {
    console.log("Saving profile:", profile);
    setProfileModalOpen(false);
  };

  const handleSaveSettings = () => {
    console.log("Saving settings:", settings);
    setSettingsModalOpen(false);
  };

  const menuItems = [
    {
      label: "Edit Profile",
      icon: "user",
      action: () => setProfileModalOpen(true),
    },
    {
      label: "Settings",
      icon: "settings",
      action: () => setSettingsModalOpen(true),
    },
  ];

  return (
    <>
      <header
        style={headerStyles}
        className="flex items-center w-full px-4 py-3 gap-4"
      >
        <div className="flex flex-row items-center gap-4 w-full">
          <SvgIcon name="brain" size="w-7 h-7" className="text-white" />
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
            onClick={() => window.open("https://www.wikipedia.org", "_blank")}
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

          <div ref={menuRef} className="relative">
            <Button
              className="rounded-full"
              variant="transparent"
              ico={
                <SvgIcon name="user" size="w-5 h-5" glow="var(--cl-white)" />
              }
              onClick={() => setMenuOpen((prev) => !prev)}
            />

            <div style={dropdownStyles(menuOpen)}>
              {menuItems.map((item) => (
                <button
                  key={item.label}
                  onClick={() => {
                    item.action();
                    setMenuOpen(false);
                  }}
                  style={{
                    ...menuItemStyles,
                    background:
                      hoveredItem === item.label
                        ? "var(--bg-input-hover)"
                        : "transparent",
                  }}
                  onMouseEnter={() => setHoveredItem(item.label)}
                  onMouseLeave={() => setHoveredItem(null)}
                >
                  <SvgIcon name={item.icon} size="w-4 h-4" />
                  {item.label}
                </button>
              ))}

              <div
                style={{
                  borderTop: "1px solid var(--cl-border)",
                  margin: "4px 0",
                }}
              />

              <button
                onClick={() => {
                  setMenuOpen(false);
                  onLogout?.();
                }}
                style={{
                  ...menuItemStyles,
                  color: "var(--cl-red)",
                  background:
                    hoveredItem === "logout" ? "var(--bg-red)" : "transparent",
                }}
                onMouseEnter={() => setHoveredItem("logout")}
                onMouseLeave={() => setHoveredItem(null)}
              >
                <SvgIcon name="log-out" size="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── Edit Profile Modal ── */}
      <Modal
        open={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        title="Edit Profile"
        description="Update your personal information and preferences"
        icon="user"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-row items-center gap-4">
            <div
              className="flex items-center justify-center rounded-full w-16 h-16 text-xl font-bold"
              style={{
                backgroundColor: "var(--bg-input-hover)",
                color: "var(--cl-font-primary)",
              }}
            >
              {profile.name ? profile.name.charAt(0).toUpperCase() : "U"}
            </div>
            <div className="flex flex-col gap-1">
              <p
                className="text-sm font-semibold"
                style={{ color: "var(--cl-font-primary)" }}
              >
                Profile photo
              </p>
              <p
                className="text-xs"
                style={{ color: "var(--cl-font-secondary)" }}
              >
                PNG or JPEG — max 2MB
              </p>
              <Button
                label="Upload photo"
                variant="secondary"
                ico={<SvgIcon name="upload" size="w-4 h-4" />}
              />
            </div>
          </div>

          <div
            style={{ borderTop: "1px solid var(--cl-border)" }}
            className="my-1"
          />

          {[
            {
              field: "name" as const,
              label: "Full Name",
              placeholder: "e.g. Jane Doe",
            },
            {
              field: "email" as const,
              label: "Email",
              placeholder: "e.g. jane@company.com",
            },
            {
              field: "role" as const,
              label: "Role",
              placeholder: "e.g. ML Engineer",
            },
            {
              field: "bio" as const,
              label: "Bio",
              placeholder: "A short description about yourself...",
            },
          ].map(({ field, label, placeholder }) => (
            <div key={field} className="flex flex-col gap-1">
              <label
                className="text-xs font-semibold"
                style={{ color: "var(--cl-font-secondary)" }}
              >
                {label}
              </label>
              <InputText
                placeholder={placeholder}
                value={profile[field]}
                onChange={(e) => handleProfileChange(field, e.target.value)}
              />
            </div>
          ))}

          <div className="flex flex-row justify-end gap-2 mt-2">
            <Button
              label="Cancel"
              variant="secondary"
              onClick={() => setProfileModalOpen(false)}
            />
            <Button
              label="Save Changes"
              ico={<SvgIcon name="save" />}
              onClick={handleSaveProfile}
            />
          </div>
        </div>
      </Modal>

      {/* ── Settings Modal ── */}
      <Modal
        open={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        title="Settings"
        description="Manage your workspace and notification preferences"
        icon="settings"
      >
        <div className="flex flex-col">
          <ToggleRow
            title="Email notifications"
            description="Receive updates about your experiments"
            checked={settings.emailNotifications}
            onChange={(v) => handleSettingChange("emailNotifications", v)}
          />

          <ToggleRow
            title="Training alerts"
            description="Notify when a model finishes training"
            checked={settings.trainingAlerts}
            onChange={(v) => handleSettingChange("trainingAlerts", v)}
          />

          <ToggleRow
            title="Dataset upload complete"
            description="Get notified when uploads finish"
            checked={settings.uploadNotifications}
            onChange={(v) => handleSettingChange("uploadNotifications", v)}
          />

          <div className="flex items-center justify-between py-2.5">
            <div className="flex flex-col gap-0.5">
              <span
                className="text-sm font-medium"
                style={{ color: "var(--cl-font-primary)" }}
              >
                Default language
              </span>
              <span
                className="text-xs"
                style={{ color: "var(--cl-font-secondary)" }}
              >
                Interface display language
              </span>
            </div>

            <div className="w-44">
              <SelectList
                options={[
                  { label: "English", value: "en" },
                  { label: "Español", value: "es" },
                  { label: "Português", value: "pt" },
                ]}
                value={settings.language}
                onChange={(v) => handleSettingChange("language", v)}
              />
            </div>
          </div>
          <div className="flex items-center justify-between py-2.5">
            <div className="flex flex-col gap-0.5">
              <span
                className="text-sm font-medium"
                style={{ color: "var(--cl-font-primary)" }}
              >
                Timezone
              </span>
              <span
                className="text-xs"
                style={{ color: "var(--cl-font-secondary)" }}
              >
                Used for scheduling and logs
              </span>
            </div>

            <div className="w-44">
              <SelectList
                options={[
                  { label: "UTC-5 (Bogotá)", value: "UTC-5" },
                  { label: "UTC-3 (São Paulo)", value: "UTC-3" },
                  { label: "UTC+0 (London)", value: "UTC+0" },
                ]}
                value={settings.timezone}
                onChange={(v) => handleSettingChange("timezone", v)}
              />
            </div>
          </div>
          <ToggleRow
            title="Auto-save experiments"
            description="Save progress every 5 minutes"
            checked={settings.autoSave}
            onChange={(v) => handleSettingChange("autoSave", v)}
          />

          <div className="flex items-center justify-between py-2.5">
            <div className="flex flex-col gap-0.5">
              <span
                className="text-sm font-medium"
                style={{ color: "var(--cl-font-primary)" }}
              >
                Delete account
              </span>
              <span
                className="text-xs"
                style={{ color: "var(--cl-font-secondary)" }}
              >
                Permanently remove all your data
              </span>
            </div>
            <Button
              label="Delete"
              variant="secondary"
              ico={<SvgIcon name="trash-2" />}
            />
          </div>

          <div
            style={{ borderTop: "1px solid var(--cl-border)" }}
            className="mt-3 pt-3"
          />
          <div className="flex flex-row justify-end gap-2">
            <Button
              label="Cancel"
              variant="secondary"
              onClick={() => setSettingsModalOpen(false)}
            />
            <Button
              label="Save Settings"
              ico={<SvgIcon name="save" />}
              onClick={handleSaveSettings}
            />
          </div>
        </div>
      </Modal>
    </>
  );
};
