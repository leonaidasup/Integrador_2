import { useState, useEffect } from "react";
import { Button } from "../components/Button";
import { InputText } from "../components/InputText";
import { SvgIcon } from "../components/SvgIcon";

type AuthView = "login" | "register";

interface AuthProps {
  onLogin: (role: "user" | "admin", token: string, name: string) => void;
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

export default function Auth({ onLogin }: AuthProps) {
  const [view, setView] = useState<AuthView>("login");

  // login
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  // register
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");
  const [regRole, setRegRole] = useState<"user" | "admin">("user");
  const [regError, setRegError] = useState<string | null>(null);
  const [regSuccess, setRegSuccess] = useState<string | null>(null);
  const [regLoading, setRegLoading] = useState(false);

  const resetLogin = () => {
    setLoginEmail("");
    setLoginPassword("");
    setLoginError(null);
  };

  const resetRegister = () => {
    setRegName("");
    setRegEmail("");
    setRegPassword("");
    setRegConfirm("");
    setRegRole("user");
    setRegError(null);
    setRegSuccess(null);
  };

  const switchView = (v: AuthView) => {
    resetLogin();
    resetRegister();
    setView(v);
  };

  // ── Login ──────────────────────────────────────────────────────────
  const handleLogin = async () => {
    if (!loginEmail.trim() || !loginPassword) {
      setLoginError("Please fill in all fields.");
      return;
    }
    setLoginLoading(true);
    setLoginError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail.trim(), password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.detail ?? "Invalid email or password.");
        return;
      }
      // fetch /auth/me to get role and name
      const meRes = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      const me = await meRes.json();
      if (!meRes.ok) {
        setLoginError(me.detail ?? "Could not load user info.");
        return;
      }
      onLogin(me.role, data.access_token, me.name);
    } catch {
      setLoginError("Could not reach the server. Check that the API is running.");
    } finally {
      setLoginLoading(false);
    }
  };

  // ── Register ───────────────────────────────────────────────────────
  const handleRegister = async () => {
    if (!regName.trim() || !regEmail.trim() || !regPassword || !regConfirm) {
      setRegError("Please fill in all fields.");
      return;
    }
    if (regPassword !== regConfirm) {
      setRegError("Passwords do not match.");
      return;
    }
    if (regPassword.length < 6) {
      setRegError("Password must be at least 6 characters.");
      return;
    }
    setRegLoading(true);
    setRegError(null);
    setRegSuccess(null);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: regName.trim(),
          email: regEmail.trim(),
          password: regPassword,
          role: regRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRegError(data.detail ?? "Registration failed.");
        return;
      }
      setRegSuccess(`Account created for ${data.name}. You can now sign in.`);
      setTimeout(() => switchView("login"), 1800);
    } catch {
      setRegError("Could not reach the server. Check that the API is running.");
    } finally {
      setRegLoading(false);
    }
  };

  // ── Enter key ──────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      if (view === "login") handleLogin();
      if (view === "register") handleRegister();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [view, loginEmail, loginPassword, regName, regEmail, regPassword, regConfirm, regRole]);

  return (
    <div
      className="flex items-center justify-center h-screen w-screen"
      style={{ background: "var(--bg-page-user)" }}
    >
      <div
        className="flex flex-col gap-6 w-full max-w-sm p-8 rounded-xl"
        style={{
          background: "var(--bg-frame)",
          border: "1px solid var(--cl-border)",
        }}
      >
        {/* Logo / título */}
        <div className="flex flex-col items-center gap-1 mb-2">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center mb-2"
            style={{ background: "var(--bg-blue)", border: "1px solid var(--cl-blue)" }}
          >
            <SvgIcon name="brain" className="text-[var(--cl-blue)]" size="w-6 h-6" />
          </div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--cl-font-primary)" }}>
            {view === "login" ? "Welcome back" : "Create account"}
          </h1>
          <p className="text-xs text-center" style={{ color: "var(--cl-font-secondary)" }}>
            {view === "login"
              ? "Sign in to your AI Platform account"
              : "Start using AI segmentation tools"}
          </p>
        </div>

        {/* ── Login ── */}
        {view === "login" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: "var(--cl-font-secondary)" }}>
                Email
              </label>
              <InputText
                placeholder="you@example.com"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: "var(--cl-font-secondary)" }}>
                Password
              </label>
              <InputText
                placeholder="••••••••"
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
              />
            </div>

            {loginError && (
              <p className="text-xs" style={{ color: "var(--cl-red)" }}>
                {loginError}
              </p>
            )}

            <div className="flex justify-center">
              <Button
                label={loginLoading ? "Signing in…" : "Sign In"}
                disabled={loginLoading}
                onClick={handleLogin}
                className="w-fit mt-1"
              />
            </div>

            <p className="text-xs text-center mt-1" style={{ color: "var(--cl-font-secondary)" }}>
              Don't have an account?{" "}
              <button
                onClick={() => switchView("register")}
                className="cursor-pointer"
                style={{ color: "var(--cl-font-third)" }}
              >
                Sign up
              </button>
            </p>
          </div>
        )}

        {/* ── Register ── */}
        {view === "register" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: "var(--cl-font-secondary)" }}>
                Full Name
              </label>
              <InputText
                placeholder="Jane Doe"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: "var(--cl-font-secondary)" }}>
                Email
              </label>
              <InputText
                placeholder="you@example.com"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: "var(--cl-font-secondary)" }}>
                Password
              </label>
              <InputText
                placeholder="••••••••"
                type="password"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: "var(--cl-font-secondary)" }}>
                Confirm Password
              </label>
              <InputText
                placeholder="••••••••"
                type="password"
                value={regConfirm}
                onChange={(e) => setRegConfirm(e.target.value)}
              />
            </div>

            {/* Selector de rol */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: "var(--cl-font-secondary)" }}>
                Role
              </label>
              <div className="flex gap-2">
                {(["user", "admin"] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRegRole(r)}
                    className="flex-1 py-2 rounded-md text-xs font-semibold transition-all duration-200"
                    style={{
                      background: regRole === r ? "var(--bg-button-primary)" : "var(--bg-button-secondary)",
                      color: "var(--cl-font-primary)",
                      border: regRole === r ? "1px solid var(--cl-blue)" : "1px solid var(--cl-border)",
                    }}
                  >
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {regError && (
              <p className="text-xs" style={{ color: "var(--cl-red)" }}>
                {regError}
              </p>
            )}
            {regSuccess && (
              <p className="text-xs" style={{ color: "var(--cl-green)" }}>
                {regSuccess}
              </p>
            )}

            <div className="flex justify-center">
              <Button
                label={regLoading ? "Creating…" : "Create Account"}
                disabled={regLoading}
                onClick={handleRegister}
                className="w-fit mt-1"
              />
            </div>

            <p className="text-xs text-center mt-1" style={{ color: "var(--cl-font-secondary)" }}>
              Already have an account?{" "}
              <button
                onClick={() => switchView("login")}
                className="cursor-pointer"
                style={{ color: "var(--cl-font-third)" }}
              >
                Sign in
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
