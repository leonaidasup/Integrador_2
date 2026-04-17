import { useState, useEffect } from "react";
import { Button } from "../components/Button";
import { InputText } from "../components/InputText";
import { SvgIcon } from "../components/SvgIcon";

type AuthView = "login" | "register" | "forgot";

interface AuthProps {
  onLogin: (role: "user" | "admin") => void;
}

export default function Auth({ onLogin }: AuthProps) {
  const [view, setView] = useState<AuthView>("login");
  const [email, setEmail] = useState("");

  const handleLogin = () => {
    if (email === "admin") {
      onLogin("admin");
    } else {
      onLogin("user");
    }
  };
  const handleRegister = () => {};
  const handleForgot = () => {};

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Enter") {
        if (view === "login") handleLogin();
        if (view === "register") handleRegister();
        if (view === "forgot") handleForgot();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [view, email]);

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
        {/* logo / título */}
        <div className="flex flex-col items-center gap-1 mb-2">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center mb-2"
            style={{
              background: "var(--bg-blue)",
              border: "1px solid var(--cl-blue)",
            }}
          >
            <SvgIcon
              name="brain"
              className="text-[var(--cl-blue)]"
              size="w-6 h-6"
            />
          </div>
          <h1
            className="text-xl font-semibold"
            style={{ color: "var(--cl-font-primary)" }}
          >
            {view === "login" && "Welcome back"}
            {view === "register" && "Create account"}
            {view === "forgot" && "Reset password"}
          </h1>
          <p
            className="text-xs text-center"
            style={{ color: "var(--cl-font-secondary)" }}
          >
            {view === "login" && "Sign in to your AI Platform account"}
            {view === "register" && "Start using AI segmentation tools"}
            {view === "forgot" && "We'll send you a reset link"}
          </p>
        </div>

        {/* login */}
        {view === "login" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label
                className="text-xs font-semibold"
                style={{ color: "var(--cl-font-secondary)" }}
              >
                Username
              </label>
              <InputText
                placeholder="your username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label
                className="text-xs font-semibold"
                style={{ color: "var(--cl-font-secondary)" }}
              >
                Password
              </label>
              <InputText placeholder="••••••••" type="password" />
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setView("forgot")}
                className="text-xs cursor-pointer"
                style={{ color: "var(--cl-font-third)" }}
              >
                Forgot password?
              </button>
            </div>
            <div className="flex justify-center">
              <Button
                label="Sign In"
                onClick={handleLogin}
                className="w-fit mt-1"
              />
            </div>
            <p
              className="text-xs text-center mt-1"
              style={{ color: "var(--cl-font-secondary)" }}
            >
              Don't have an account?{" "}
              <button
                onClick={() => setView("register")}
                className="cursor-pointer"
                style={{ color: "var(--cl-font-third)" }}
              >
                Sign up
              </button>
            </p>
          </div>
        )}

        {/* register*/}
        {view === "register" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label
                className="text-xs font-semibold"
                style={{ color: "var(--cl-font-secondary)" }}
              >
                Username
              </label>
              <InputText placeholder="your username" />
            </div>
            <div className="flex flex-col gap-1">
              <label
                className="text-xs font-semibold"
                style={{ color: "var(--cl-font-secondary)" }}
              >
                Password
              </label>
              <InputText placeholder="••••••••" type="password" />
            </div>
            <div className="flex flex-col gap-1">
              <label
                className="text-xs font-semibold"
                style={{ color: "var(--cl-font-secondary)" }}
              >
                Confirm Password
              </label>
              <InputText placeholder="••••••••" type="password" />
            </div>
            <div className="flex justify-center">
              <Button
                label="Create Account"
                onClick={handleRegister}
                className="w-fit mt-1"
              />
            </div>
            <p
              className="text-xs text-center mt-1"
              style={{ color: "var(--cl-font-secondary)" }}
            >
              Already have an account?{" "}
              <button
                onClick={() => setView("login")}
                className="cursor-pointer"
                style={{ color: "var(--cl-font-third)" }}
              >
                Sign in
              </button>
            </p>
          </div>
        )}
        {/* forgot */}
        {view === "forgot" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label
                className="text-xs font-semibold"
                style={{ color: "var(--cl-font-secondary)" }}
              >
                Username
              </label>
              <InputText placeholder="your username" />
            </div>
            <div className="flex justify-center">
              <Button
                label="Send Reset Link"
                onClick={handleForgot}
                className="w-fit mt-1"
              />
            </div>
            <p
              className="text-xs text-center mt-1"
              style={{ color: "var(--cl-font-secondary)" }}
            >
              Remember your password?{" "}
              <button
                onClick={() => setView("login")}
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
