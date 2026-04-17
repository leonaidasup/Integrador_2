import { useState } from "react";
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

const userPages: Record<string, React.ReactNode> = {
  dashboard: <Dashboard />,
  experiments: <Experiments />,
  datasets: <Datasets />,
  models: <Models />,
  analytics: <Analytics />,
};

const adminPages: Record<string, React.ReactNode> = {
  overview: <SystemOverview />,
  users: <UserTable />,
};

export default function App() {
  const [role, setRole] = useState<Role>(null);
  const [activePage, setActivePage] = useState("dashboard");

  const handleLogin = (r: "user" | "admin") => {
    setRole(r);
    setActivePage(r === "admin" ? "overview" : "dashboard");
  };

  if (!role) return <Auth onLogin={handleLogin} />;

  if (role === "admin")
    return (
      <div className="flex flex-col h-screen">
        <Header onLogout={() => setRole(null)} />
        <div className="flex flex-1 overflow-hidden">
          <NavBar
            activePage={activePage}
            onNavigate={setActivePage}
            role="admin"
          />
          {adminPages[activePage]}
        </div>
      </div>
    );

  return (
    <div className="flex flex-col h-screen">
      <Header onLogout={() => setRole(null)} />
      <div className="flex flex-1 overflow-hidden">
        <NavBar
          activePage={activePage}
          onNavigate={setActivePage}
          role="user"
        />
        {userPages[activePage]}
      </div>
    </div>
  );
}
