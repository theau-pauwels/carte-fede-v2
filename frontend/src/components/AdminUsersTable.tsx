// src/components/AdminUsersTable.tsx
import { useEffect, useState } from "react";

type Memberships = Record<string, string>; // { "2024": "A-12" }

type User = {
  id: number;
  nom: string;
  prenom: string;
  identifiant?: string; // member_id ou email
  cartes?: Memberships;
  role: string;
};

const ALLOWED_PREFIXES = ["A","F","E","EA","MI","S"];
const ROLE_OPTIONS = ["member","verifier","admin","en attente"];

function currentAcademicStartYear() {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return m >= 8 ? y : y - 1;
}

function makeYearRanges(countBefore = 2, countAfter = 6) {
  const start = currentAcademicStartYear();
  return Array.from({ length: countAfter + countBefore + 1 }, (_, k) => {
    const y = start - countBefore + k;
    return `${y}-${y + 1}`;
  });
}

export default function AdminUsersTable() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<{ nom: string; prenom: string; identifiant: string }>({ nom: "", prenom: "", identifiant: "" });

  // ---------- API ----------
  const fetchUsers = async () => {
    const res = await fetch("/api/admin/users", { credentials: "include" });
    if (!res.ok) throw new Error("Impossible de charger les utilisateurs");
    const data: User[] = await res.json();
    setUsers(data);
  };

  const ensureAdmin = async (): Promise<boolean> => {
    const res = await fetch("/api/me", { credentials: "include" });
    if (!res.ok) { window.location.href = "/login"; return false; }
    const me = await res.json();
    if (me.role !== "admin") { window.location.href = "/"; return false; }
    return true;
  };

  useEffect(() => {
    (async () => {
      if (!(await ensureAdmin())) return;
      await fetchUsers();
      setLoading(false);
    })();
  }, []);

  // ---------- Cartes ----------
  const addCard = async (userId: number, annee: string, prefix: string, num: number) => {
    const annee_code = `${prefix}-${num}`;
    const res = await fetch(`/api/admin/users/${userId}/annees`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ annee, annee_code }),
    });
    if (!res.ok) { alert("Erreur lors de l'ajout de la carte"); return; }
    await fetchUsers();
  };

  const removeCard = async (userId: number, annee: string) => {
    if (!confirm(`Supprimer la carte pour ${annee} ?`)) return;
    const res = await fetch(`/api/admin/users/${userId}/annees/${annee}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) { alert("Erreur lors de la suppression"); return; }
    await fetchUsers();
  };

  // ---------- Rôle ----------
  const changeRole = async (userId: number, role: string) => {
    const res = await fetch(`/api/admin/users/${userId}/role`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ role }),
    });
    if (!res.ok) { alert("Erreur lors du changement de rôle"); return; }
    await fetchUsers();
  };

  // ---------- Supprimer utilisateur ----------
  const deleteUser = async (userId: number) => {
    if (!confirm("Voulez-vous vraiment supprimer cet utilisateur ?")) return;
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) { alert("Erreur lors de la suppression de l'utilisateur"); return; }
    await fetchUsers();
  };

  // ---------- Modifier utilisateur ----------
  const saveUser = async (userId: number) => {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(editValues),
    });
    if (!res.ok) { alert("Erreur lors de la modification"); return; }
    setEditingUserId(null);
    await fetchUsers();
  };

  if (loading) return <p>Chargement...</p>;

  const yearRanges = makeYearRanges();

  const totalUsers = users.length;
  const totalCards = users.reduce((sum, u) => sum + (u.cartes ? Object.keys(u.cartes).length : 0), 0);

  const downloadExcel = () => {
    if (!users.length) return;
    const yearSet = new Set<string>();
    users.forEach(u => {
      Object.keys(u.cartes ?? {}).forEach(year => yearSet.add(year));
    });
    const yearColumns = Array.from(yearSet).sort((a, b) => {
      const numA = parseInt(a, 10);
      const numB = parseInt(b, 10);
      if (!Number.isNaN(numA) && !Number.isNaN(numB)) return numB - numA;
      if (!Number.isNaN(numA)) return -1;
      if (!Number.isNaN(numB)) return 1;
      return b.localeCompare(a);
    });
    const header = ["Nom", "Prénom", "Identifiant", "Rôle", ...yearColumns];
    const rows = users.map(u => [
      u.nom,
      u.prenom,
      u.identifiant ?? "",
      u.role,
      ...yearColumns.map(year => u.cartes?.[year] ?? ""),
    ]);
    const escapeCell = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const tableContent = [header, ...rows]
      .map(row => row.map(cell => escapeCell(String(cell ?? ""))).join(";"))
      .join("\n");
    const blob = new Blob(["\uFEFF" + tableContent], {
      type: "application/vnd.ms-excel;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `utilisateurs-${new Date().toISOString().split("T")[0]}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-blue-50 px-4 py-2 text-sm text-blue-700 sm:text-base">
            <span className="font-semibold">{totalUsers}</span> utilisateurs
          </span>
          <span className="rounded-full bg-emerald-50 px-4 py-2 text-sm text-emerald-700 sm:text-base">
            <span className="font-semibold">{totalCards}</span> cartes
          </span>
        </div>
        <button
          type="button"
          onClick={downloadExcel}
          disabled={!totalUsers}
          className="flex items-center gap-2 self-start rounded-full bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:from-blue-700 hover:to-blue-600 disabled:cursor-not-allowed disabled:from-gray-400 disabled:text-gray-200 disabled:to-gray-400 disabled:shadow-none sm:self-auto sm:text-base"
        >
          <span aria-hidden>📥</span>
          Exporter en Excel
        </button>
      </div>
      <table className="w-full border-collapse border">
        <thead>
          <tr>
            <th className="border px-2 py-1">Nom</th>
            <th className="border px-2 py-1">Prénom</th>
            <th className="border px-2 py-1">Identifiant</th>
            <th className="border px-2 py-1">Cartes</th>
            <th className="border px-2 py-1">Ajouter une carte</th>
            <th className="border px-2 py-1">Rôle</th>
            <th className="border px-2 py-1">Actions</th>
          </tr>
        </thead>
        <tbody>
        {users.map(u => (
          <tr key={u.id}>
            <td className="border px-2 py-1">
              {editingUserId === u.id ? (
                <input
                  value={editValues.nom}
                  onChange={e => setEditValues(prev => ({ ...prev, nom: e.target.value }))}
                  className="border p-1 rounded"
                />
              ) : u.nom}
            </td>
            <td className="border px-2 py-1">
              {editingUserId === u.id ? (
                <input
                  value={editValues.prenom}
                  onChange={e => setEditValues(prev => ({ ...prev, prenom: e.target.value }))}
                  className="border p-1 rounded"
                />
              ) : u.prenom}
            </td>
            <td className="border px-2 py-1">
              {editingUserId === u.id ? (
                <input
                  value={editValues.identifiant}
                  onChange={e => setEditValues(prev => ({ ...prev, identifiant: e.target.value }))}
                  className="border p-1 rounded"
                />
              ) : u.identifiant ?? ""}
            </td>
            <td className="border px-2 py-1">
              {u.cartes && Object.entries(u.cartes).length > 0
                ? Object.entries(u.cartes).sort((a,b)=>Number(b[0])-Number(a[0])).map(([annee, code])=>(
                  <div key={annee}>
                    {annee} → {code}{" "}
                    <button className="text-red-600" onClick={()=>removeCard(u.id,annee)}>🗑</button>
                  </div>
                ))
                : <span className="text-gray-400">—</span>
              }
            </td>
            <td className="border px-2 py-1">
              <form onSubmit={e => {
                e.preventDefault();
                const f = e.currentTarget as any;
                const annee = f.annee.value;
                const prefix = f.prefix.value;
                const num = parseInt(f.num.value,10);
                addCard(u.id, annee, prefix, num);
              }} className="flex flex-col gap-1">
                <select name="annee" required>{yearRanges.map(y=><option key={y} value={y}>{y}</option>)}</select>
                <select name="prefix" required>{ALLOWED_PREFIXES.map(p=><option key={p} value={p}>{p}</option>)}</select>
                <input name="num" type="number" min={1} placeholder="Numéro" required />
                <button type="submit" className="bg-blue-900 text-white px-2 py-1 rounded">➕</button>
              </form>
            </td>
            <td className="border px-2 py-1">
              <select value={u.role} onChange={e=>changeRole(u.id,e.target.value)}>
                {ROLE_OPTIONS.map(r=><option key={r} value={r}>{r}</option>)}
              </select>
            </td>
            <td className="border px-2 py-1 flex gap-1">
              {editingUserId === u.id ? (
                <>
                  <button onClick={()=>saveUser(u.id)} className="bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700">💾</button>
                  <button onClick={()=>setEditingUserId(null)} className="bg-gray-400 text-white px-2 py-1 rounded hover:bg-gray-500">✖</button>
                </>
              ) : (
                <>
                  <button onClick={()=>{setEditingUserId(u.id); setEditValues({nom:u.nom, prenom:u.prenom, identifiant:u.identifiant ?? ""})}} className="bg-yellow-500 px-2 py-1 rounded hover:bg-yellow-600">✏️</button>
                  <button onClick={()=>deleteUser(u.id)} className="bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700">🗑</button>
                </>
              )}
            </td>
          </tr>
        ))}
      </tbody>
      </table>
    </>
  );
}
