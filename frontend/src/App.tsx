import { useState, useEffect } from "react";
import { NavBar } from "./components/NavBar";
import { Header } from "./components/Header";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Experiments from "./pages/Experiments";
import Datasets from "./pages/Datasets";
import Models from "./pages/Models";
import Analytics from "./pages/Analytics";
import SystemOverview from "./pages/SystemOverview";
import UserTable from "./pages/UserTable";

type Role = "user" | "admin" | null;

const TOKEN_KEY = "auth_token";
const ROLE_KEY  = "auth_role";
const NAME_KEY  = "auth_name";

const userPages: Record<string, React.ReactNode> = {
  dashboard:   <Dashboard />,
  experiments: <Experiments />,
  datasets:    <Datasets />,
  models:      <Models />,
  analytics:   <Analytics />,
};

const adminPages: Record<string, React.ReactNode> = {
  overview: <SystemOverview />,
  users:    <UserTable />,
};

export default function App() {
  const [role, setRole]   = useState<Role>(null);
  const [name, setName]   = useState<string>("");
  const [activePage, setActivePage] = useState("dashboard");

  // Restaurar sesión desde localStorage al arrancar
  useEffect(() => {
    const savedToken = localStorage.getItem(TOKEN_KEY);
    const savedRole  = localStorage.getItem(ROLE_KEY) as Role;
    const savedName  = localStorage.getItem(NAME_KEY) ?? "";
    if (savedToken && savedRole) {
      setRole(savedRole);
      setName(savedName);
      setActivePage(savedRole === "admin" ? "overview" : "dashboard");
    }
  }, []);

  const handleLogin = (r: "user" | "admin", token: string, userName: string) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(ROLE_KEY,  r);
    localStorage.setItem(NAME_KEY,  userName);
    setRole(r);
    setName(userName);
    setActivePage(r === "admin" ? "overview" : "dashboard");
  };

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ROLE_KEY);
    localStorage.removeItem(NAME_KEY);
    setRole(null);
    setName("");
  };

  if (!role) return <Auth onLogin={handleLogin} />;

  if (role === "admin")
    return (
      <div className="flex flex-col h-screen">
        <Header onLogout={handleLogout} userName={name} />
        <div className="flex flex-1 overflow-hidden">
          <NavBar activePage={activePage} onNavigate={setActivePage} role="admin" />
          {adminPages[activePage]}
        </div>
      </div>
    );

  return (
    <div className="flex flex-col h-screen">
      <Header onLogout={handleLogout} userName={name} />
      <div className="flex flex-1 overflow-hidden">
        <NavBar activePage={activePage} onNavigate={setActivePage} role="user" />
        {userPages[activePage]}
      </div>
    </div>
  );
}
