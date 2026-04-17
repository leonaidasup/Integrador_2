import React from "react";
import { Button } from "../Button";
import { SvgIcon } from "../SvgIcon";
import { Card } from "../Card";

const navBarStyles: React.CSSProperties = {
  backgroundColor: "var(--bg-page-user)",
  borderRight: "1px solid var(--cl-border)",
};

interface NavBarProps {
  activePage: string;
  onNavigate: (page: string) => void;
  role?: "user" | "admin";
}

export const NavBar: React.FC<NavBarProps> = ({
  activePage,
  onNavigate,
  role = "user",
}) => {
  return (
    <nav
      style={navBarStyles}
      className="flex flex-col h-full w-60 px-3 py-4 gap-2 overflow-hidden"
    >
      {role === "user" && (
        <>
          <Button
            label="Dashboard"
            ico={<SvgIcon name="layout-dashboard" />}
            variant="navigation"
            active={activePage === "dashboard"}
            onClick={() => onNavigate("dashboard")}
          />
          <Button
            label="Experiments"
            ico={<SvgIcon name="flask-conical" />}
            variant="navigation"
            active={activePage === "experiments"}
            onClick={() => onNavigate("experiments")}
          />
          <Button
            label="DataSets"
            ico={<SvgIcon name="database" />}
            variant="navigation"
            active={activePage === "datasets"}
            onClick={() => onNavigate("datasets")}
          />
          <Button
            label="Models"
            ico={<SvgIcon name="brain" />}
            variant="navigation"
            active={activePage === "models"}
            onClick={() => onNavigate("models")}
          />
          <Button
            label="Analytics"
            ico={<SvgIcon name="chart-spline" />}
            variant="navigation"
            active={activePage === "analytics"}
            onClick={() => onNavigate("analytics")}
          />
        </>
      )}

      {role === "admin" && (
        <>
          <Button
            label="System Overview"
            ico={<SvgIcon name="settings" />}
            variant="navigation"
            active={activePage === "overview"}
            onClick={() => onNavigate("overview")}
          />
          <Button
            label="User Table"
            ico={<SvgIcon name="users" />}
            variant="navigation"
            active={activePage === "users"}
            onClick={() => onNavigate("users")}
          />
        </>
      )}
    </nav>
  );
};
