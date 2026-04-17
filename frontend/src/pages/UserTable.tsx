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
  const [viewOpen, setViewOpen] = useState(false); // ✅ NUEVO
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
            ico={<SvgIcon name="eye" size="w-4 h-4" />}
            onClick={() => {
              setSelectedUser(row);
              setViewOpen(true);
            }}
          />

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
      <div className="flex flex-col mb-6">
        <h1 className="text-2xl text-[var(--cl-font-primary)] font-semibold">
          User Table
        </h1>
        <p className="text-sm text-[var(--cl-font-secondary)]">
          Manage platform users and permissions
        </p>
      </div>

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

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit User"
        description="Modify user information and permissions"
        icon="user-pen"
      >
        <div className="flex flex-col gap-4">
          <InputText
            value={selectedUser?.user ?? ""}
            onChange={(e) =>
              setSelectedUser({ ...selectedUser, user: e.target.value })
            }
          />
          <InputText
            value={selectedUser?.username ?? ""}
            onChange={(e) =>
              setSelectedUser({ ...selectedUser, username: e.target.value })
            }
          />
          <SelectList
            options={[
              { label: "User", value: "user" },
              { label: "Admin", value: "admin" },
            ]}
            value={selectedUser?.role ?? "user"}
            onChange={(val) => setSelectedUser({ ...selectedUser, role: val })}
          />

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

      <Modal
        open={viewOpen}
        onClose={() => setViewOpen(false)}
        title="User Info"
        description="User usage & activity"
        icon="activity"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-[var(--cl-font-primary)]">
              {selectedUser?.user}
            </span>
            <span className="text-xs text-[var(--cl-font-secondary)]">
              @{selectedUser?.username}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 rounded-lg bg-[var(--bg-tables-selector)]">
              <p className="text-xs text-[var(--cl-font-secondary)]">
                CPU Usage
              </p>
              <p className="text-sm text-[var(--cl-font-primary)]">32%</p>
            </div>

            <div className="p-3 rounded-lg bg-[var(--bg-tables-selector)]">
              <p className="text-xs text-[var(--cl-font-secondary)]">
                GPU Usage
              </p>
              <p className="text-sm text-[var(--cl-font-primary)]">68%</p>
            </div>

            <div className="p-3 rounded-lg bg-[var(--bg-tables-selector)]">
              <p className="text-xs text-[var(--cl-font-secondary)]">
                Model Storage
              </p>
              <p className="text-sm text-[var(--cl-font-primary)]">2.4 GB</p>
            </div>

            <div className="p-3 rounded-lg bg-[var(--bg-tables-selector)]">
              <p className="text-xs text-[var(--cl-font-secondary)]">
                Dataset Storage
              </p>
              <p className="text-sm text-[var(--cl-font-primary)]">5.1 GB</p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs text-[var(--cl-font-secondary)]">
              Models Usage
            </p>

            <div className="flex flex-col gap-1 text-xs">
              <div className="flex justify-between">
                <span className="text-[var(--cl-font-primary)]">ResNet50</span>
                <span className="text-[var(--cl-font-secondary)]">1.2 GB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--cl-font-primary)]">YOLOv8</span>
                <span className="text-[var(--cl-font-secondary)]">800 MB</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs text-[var(--cl-font-secondary)]">Datasets</p>

            <div className="flex flex-col gap-1 text-xs">
              <div className="flex justify-between">
                <span className="text-[var(--cl-font-primary)]">Images v1</span>
                <span className="text-[var(--cl-font-secondary)]">3.2 GB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--cl-font-primary)]">
                  Medical Set
                </span>
                <span className="text-[var(--cl-font-secondary)]">1.9 GB</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs text-[var(--cl-font-secondary)]">
              Recent Activity
            </p>

            <div className="flex flex-col text-xs rounded-lg overflow-hidden border border-[var(--cl-border)]">
              <div className="grid grid-cols-3 px-3 py-2 bg-[var(--bg-tables)] text-[var(--cl-font-secondary)]">
                <span>Action</span>
                <span>Date</span>
                <span>Status</span>
              </div>

              <div className="grid grid-cols-3 px-3 py-2">
                <span className="text-[var(--cl-font-primary)]">Run Model</span>
                <span className="text-[var(--cl-font-secondary)]">Mar 14</span>
                <span className="text-[var(--cl-green)]">Success</span>
              </div>

              <div className="grid grid-cols-3 px-3 py-2">
                <span className="text-[var(--cl-font-primary)]">
                  Upload Dataset
                </span>
                <span className="text-[var(--cl-font-secondary)]">Mar 13</span>
                <span className="text-[var(--cl-green)]">Success</span>
              </div>

              <div className="grid grid-cols-3 px-3 py-2">
                <span className="text-[var(--cl-font-primary)]">
                  Train Model
                </span>
                <span className="text-[var(--cl-font-secondary)]">Mar 12</span>
                <span className="text-[var(--cl-yellow)]">Pending</span>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </main>
  );
}
