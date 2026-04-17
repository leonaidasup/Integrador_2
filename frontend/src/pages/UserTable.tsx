import { useState } from "react";
import { Card } from "../components/Card";
import { SummaryCard } from "../components/SummaryCard";
import { Table } from "../components/Table";
import { InputText } from "../components/InputText";
import { SelectList } from "../components/SelectList";
import { SvgIcon } from "../components/SvgIcon";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";

const users = [
  {
    id: 1,
    user: "John Doe",
    username: "john",
    role: "user",
    experiments: 12,
    status: "active",
    lastLogin: "Mar 14, 14:02",
  },
  {
    id: 2,
    user: "Ana García",
    username: "ana",
    role: "user",
    experiments: 8,
    status: "active",
    lastLogin: "Mar 14, 13:21",
  },
  {
    id: 3,
    user: "Luis Pérez",
    username: "luis",
    role: "user",
    experiments: 3,
    status: "blocked",
    lastLogin: "Mar 12, 09:10",
  },
  {
    id: 4,
    user: "María López",
    username: "maria",
    role: "admin",
    experiments: 0,
    status: "active",
    lastLogin: "Mar 14, 08:45",
  },
  {
    id: 5,
    user: "Carlos Ruiz",
    username: "carlo",
    role: "user",
    experiments: 21,
    status: "active",
    lastLogin: "Mar 13, 17:30",
  },
  {
    id: 6,
    user: "Sara Muñoz",
    username: "sara",
    role: "user",
    experiments: 5,
    status: "blocked",
    lastLogin: "Mar 10, 11:20",
  },
];

const summaryUsers = {
  "Total Users": users.length,
  "Active Users": users.filter((u) => u.status === "active").length,
  Admins: users.filter((u) => u.role === "admin").length,
};

const statusStyles: Record<string, { bg: string; color: string }> = {
  active: { bg: "var(--bg-green)", color: "var(--cl-green)" },
  blocked: { bg: "var(--bg-red)", color: "var(--cl-red)" },
};

const roleStyles: Record<string, { bg: string; color: string }> = {
  admin: { bg: "var(--bg-yellow)", color: "var(--cl-yellow)" },
  user: { bg: "var(--bg-blue)", color: "var(--cl-blue)" },
};

const textRender = (value: any) => (
  <span className="font-medium text-sm">{value}</span>
);

const filterOptions = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Blocked", value: "blocked" },
  { label: "Admin", value: "admin" },
  { label: "User", value: "user" },
];

export default function UserTable() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [editOpen, setEditOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);

  const filteredUsers = users.filter((row) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !search ||
      row.user.toLowerCase().includes(q) ||
      row.username.toLowerCase().includes(q) ||
      row.role.toLowerCase().includes(q) ||
      row.status.toLowerCase().includes(q);
    const matchesFilter =
      filter === "all" || filter === row.status || filter === row.role;
    return matchesSearch && matchesFilter;
  });

  const columns = [
    { key: "user", label: "User", render: textRender },
    { key: "username", label: "Username", render: textRender },
    {
      key: "role",
      label: "Role",
      render: (value: string) => {
        const style = roleStyles[value] ?? {
          bg: "var(--bg-tables-selector)",
          color: "var(--cl-font-secondary)",
        };
        return (
          <div
            className="px-2 py-0.5 rounded-md text-xs w-fit font-bold"
            style={{
              background: style.bg,
              color: style.color,
              border: `1px solid ${style.color}`,
            }}
          >
            {value}
          </div>
        );
      },
    },
    { key: "experiments", label: "Experiments", render: textRender },
    {
      key: "status",
      label: "Status",
      render: (value: string) => {
        const style = statusStyles[value] ?? {
          bg: "var(--bg-tables-selector)",
          color: "var(--cl-font-secondary)",
        };
        return (
          <div
            className="px-2 py-0.5 rounded-md text-xs w-fit font-bold"
            style={{
              background: style.bg,
              color: style.color,
              border: `1px solid ${style.color}`,
            }}
          >
            {value}
          </div>
        );
      },
    },
    { key: "lastLogin", label: "Last Login", render: textRender },
    {
      key: "actions",
      label: "Actions",
      render: (_: any, row: any) => (
        <div className="flex flex-row gap-1">
          <Button
            variant="transparent"
            ico={<SvgIcon name="pencil" size="w-4 h-4" />}
            onClick={() => {
              setSelectedUser(row);
              setEditOpen(true);
            }}
          />
          <Button
            variant="transparent"
            ico={<SvgIcon name="trash-2" size="w-4 h-4" />}
            onClick={() => {}}
          />
        </div>
      ),
    },
  ];

  return (
    <main className="flex-1 overflow-y-auto p-6 bg-[var(--bg-page-user)]">
      {/* header */}
      <div className="flex flex-col mb-6">
        <h1 className="text-2xl text-[var(--cl-font-primary)] font-semibold">
          User Table
        </h1>
        <p className="text-sm text-[var(--cl-font-secondary)]">
          Manage platform users and permissions
        </p>
      </div>

      {/* summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <Card hoverable>
          <SummaryCard
            label="Total Users"
            value={summaryUsers["Total Users"]}
            icon="users"
            classNameValue="text-[var(--cl-white)]"
          />
        </Card>
        <Card hoverable>
          <SummaryCard
            label="Active Users"
            value={summaryUsers["Active Users"]}
            icon="circle-check-big"
            classNameValue="text-[var(--cl-green)]"
          />
        </Card>
        <Card hoverable>
          <SummaryCard
            label="Admins"
            value={summaryUsers["Admins"]}
            icon="shield"
            classNameValue="text-[var(--cl-yellow)]"
          />
        </Card>
      </div>

      {/* table */}
      <Card title="Users">
        <div className="flex flex-row items-center gap-2 mb-4">
          <InputText
            placeholder="Search by name, username, role..."
            ico={<SvgIcon name="search" />}
            className="w-2/4"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <SvgIcon
            name="sliders-horizontal"
            className="text-[var(--cl-font-primary)]"
            size="w-5 h-5"
          />
          <SelectList
            options={filterOptions}
            value={filter}
            onChange={setFilter}
          />
        </div>
        <Table columns={columns} data={filteredUsers} />
      </Card>

      {/* edit modal */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit User"
        description="Modify user information and permissions"
        icon="user-pen"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label
              className="text-xs font-semibold"
              style={{ color: "var(--cl-font-secondary)" }}
            >
              Full Name
            </label>
            <InputText
              placeholder="Full name"
              value={selectedUser?.user ?? ""}
              onChange={() => {}}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              className="text-xs font-semibold"
              style={{ color: "var(--cl-font-secondary)" }}
            >
              Username
            </label>
            <InputText
              placeholder="Username"
              value={selectedUser?.username ?? ""}
              onChange={() => {}}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              className="text-xs font-semibold"
              style={{ color: "var(--cl-font-secondary)" }}
            >
              Role
            </label>
            <SelectList
              options={[
                { label: "User", value: "user" },
                { label: "Admin", value: "admin" },
              ]}
              value={selectedUser?.role ?? "user"}
              onChange={() => {}}
              className="w-full"
            />
          </div>
          <div className="flex flex-row justify-end gap-2 mt-2">
            <Button
              label="Cancel"
              variant="secondary"
              onClick={() => setEditOpen(false)}
            />
            <Button label="Save User" ico={<SvgIcon name="save" />} />
          </div>
        </div>
      </Modal>
    </main>
  );
}
