// src/components/AdminUsersTable.tsx
import { useEffect, useMemo, useState } from "react";

type Memberships = Record<string, string>; // { "2024": "A-12" }

type User = {
  id: number;
  nom: string;
  prenom: string;
  identifiant?: string; // member_id ou email
  cartes?: Memberships;
  role: string;
};

type ConfirmationDialog = {
  title: string;
  message: string;
  details?: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
};

const ALLOWED_PREFIXES = ["A", "F", "E", "EA", "MI", "S"];
const ROLE_OPTIONS = ["member", "verifier", "admin", "en attente"];

const ROLE_LABELS: Record<string, string> = {
  member: "Membre",
  verifier: "Vérificateur",
  admin: "Admin",
  "en attente": "En attente",
};

const PAGE_SIZE = 25;

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
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [cardFilter, setCardFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationDialog | null>(
    null,
  );
  const [confirmationLoading, setConfirmationLoading] = useState(false);
  const [editValues, setEditValues] = useState<{
    nom: string;
    prenom: string;
    identifiant: string;
  }>({ nom: "", prenom: "", identifiant: "" });

  // ---------- API ----------
  const fetchUsers = async () => {
    const res = await fetch("/api/admin/users", { credentials: "include" });
    if (!res.ok) throw new Error("Impossible de charger les utilisateurs");
    const data: User[] = await res.json();
    setUsers(data);
  };

  const ensureAdmin = async (): Promise<boolean> => {
    const res = await fetch("/api/me", { credentials: "include" });
    if (!res.ok) {
      window.location.href = "/login";
      return false;
    }
    const me = await res.json();
    if (me.role !== "admin") {
      window.location.href = "/";
      return false;
    }
    return true;
  };

  useEffect(() => {
    (async () => {
      if (!(await ensureAdmin())) return;
      await fetchUsers();
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, roleFilter, cardFilter]);

  // ---------- Cartes ----------
  const addCard = async (
    userId: number,
    annee: string,
    prefix: string,
    num: number,
  ) => {
    const annee_code = `${prefix}-${num}`;
    const res = await fetch(`/api/admin/users/${userId}/annees`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ annee, annee_code }),
    });
    if (!res.ok) {
      alert("Erreur lors de l'ajout de la carte");
      return;
    }
    await fetchUsers();
  };

  const removeCard = async (userId: number, annee: string) => {
    const res = await fetch(`/api/admin/users/${userId}/annees/${annee}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      alert("Erreur lors de la suppression");
      return;
    }
    await fetchUsers();
  };

  const requestRemoveCard = (user: User, annee: string, code: string) => {
    setConfirmation({
      title: "Supprimer cette carte ?",
      message: `La carte ${annee} - ${code} sera retirée de ${user.prenom} ${user.nom}.`,
      details: "Cette action ne supprimera pas l'utilisateur.",
      confirmLabel: "Supprimer la carte",
      onConfirm: () => removeCard(user.id, annee),
    });
  };

  // ---------- Rôle ----------
  const changeRole = async (userId: number, role: string) => {
    const res = await fetch(`/api/admin/users/${userId}/role`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ role }),
    });
    if (!res.ok) {
      alert("Erreur lors du changement de rôle");
      return;
    }
    await fetchUsers();
  };

  // ---------- Supprimer utilisateur ----------
  const deleteUser = async (userId: number) => {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      alert("Erreur lors de la suppression de l'utilisateur");
      return;
    }
    await fetchUsers();
  };

  const requestDeleteUser = (user: User) => {
    const cardCount = Object.keys(user.cartes ?? {}).length;
    setConfirmation({
      title: "Supprimer cet utilisateur ?",
      message: `${user.prenom} ${user.nom} sera supprimé définitivement.`,
      details:
        cardCount > 0
          ? `${cardCount} carte${cardCount > 1 ? "s" : ""} liée${cardCount > 1 ? "s" : ""} à ce compte seront aussi concernées.`
          : "Ce compte n'a aucune carte liée.",
      confirmLabel: "Supprimer l'utilisateur",
      onConfirm: () => deleteUser(user.id),
    });
  };

  const confirmAction = async () => {
    if (!confirmation || confirmationLoading) return;
    setConfirmationLoading(true);
    try {
      await confirmation.onConfirm();
      setConfirmation(null);
    } finally {
      setConfirmationLoading(false);
    }
  };

  const closeConfirmation = () => {
    if (confirmationLoading) return;
    setConfirmation(null);
  };

  // ---------- Modifier utilisateur ----------
  const saveUser = async (userId: number) => {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(editValues),
    });
    if (!res.ok) {
      alert("Erreur lors de la modification");
      return;
    }
    setEditingUserId(null);
    await fetchUsers();
  };

  const yearRanges = makeYearRanges();

  const totalUsers = users.length;
  const totalCards = users.reduce(
    (sum, u) => sum + (u.cartes ? Object.keys(u.cartes).length : 0),
    0,
  );
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const identity =
        `${u.nom} ${u.prenom} ${u.identifiant ?? ""}`.toLowerCase();
      const hasCards = Object.keys(u.cartes ?? {}).length > 0;
      const matchesSearch =
        normalizedSearch.length === 0 || identity.includes(normalizedSearch);
      const matchesRole = roleFilter === "all" || u.role === roleFilter;
      const matchesCard =
        cardFilter === "all" ||
        (cardFilter === "with" && hasCards) ||
        (cardFilter === "without" && !hasCards);

      return matchesSearch && matchesRole && matchesCard;
    });
  }, [users, normalizedSearch, roleFilter, cardFilter]);

  const totalFilteredCards = filteredUsers.reduce(
    (sum, u) => sum + (u.cartes ? Object.keys(u.cartes).length : 0),
    0,
  );
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedUsers = filteredUsers.slice(
    (safeCurrentPage - 1) * PAGE_SIZE,
    safeCurrentPage * PAGE_SIZE,
  );
  const pageStart =
    filteredUsers.length === 0 ? 0 : (safeCurrentPage - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(safeCurrentPage * PAGE_SIZE, filteredUsers.length);

  if (loading) return <p>Chargement...</p>;

  const downloadExcel = () => {
    if (!filteredUsers.length) return;
    const yearSet = new Set<string>();
    filteredUsers.forEach((u) => {
      Object.keys(u.cartes ?? {}).forEach((year) => yearSet.add(year));
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
    const rows = filteredUsers.map((u) => [
      u.nom,
      u.prenom,
      u.identifiant ?? "",
      u.role,
      ...yearColumns.map((year) => u.cartes?.[year] ?? ""),
    ]);
    const escapeCell = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const tableContent = [header, ...rows]
      .map((row) => row.map((cell) => escapeCell(String(cell ?? ""))).join(";"))
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
    <div className="w-full">
      <div className="mb-4 flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-blue-50 px-4 py-2 text-sm text-blue-700 sm:text-base">
            <span className="font-semibold">{totalUsers}</span> utilisateurs
          </span>
          <span className="rounded-full bg-emerald-50 px-4 py-2 text-sm text-emerald-700 sm:text-base">
            <span className="font-semibold">{totalCards}</span> cartes
          </span>
          <span className="rounded-full bg-slate-100 px-4 py-2 text-sm text-slate-700 sm:text-base">
            <span className="font-semibold">{filteredUsers.length}</span>{" "}
            affichés
          </span>
        </div>
        <button
          type="button"
          onClick={downloadExcel}
          disabled={!filteredUsers.length}
          className="flex items-center gap-2 self-start rounded-full bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:from-blue-700 hover:to-blue-600 disabled:cursor-not-allowed disabled:from-gray-400 disabled:to-gray-400 disabled:text-gray-200 disabled:shadow-none sm:self-auto sm:text-base"
        >
          <span aria-hidden>📥</span>
          Exporter en Excel
        </button>
      </div>

      <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[minmax(280px,1fr)_220px_220px]">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">
              Recherche
            </span>
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Nom, prénom ou identifiant"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">
              Rôle
            </span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            >
              <option value="all">Tous les rôles</option>
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r] ?? r}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">
              Cartes
            </span>
            <select
              value={cardFilter}
              onChange={(e) => setCardFilter(e.target.value)}
              className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            >
              <option value="all">Avec et sans carte</option>
              <option value="with">Avec carte</option>
              <option value="without">Sans carte</option>
            </select>
          </label>
        </div>

        <div className="mt-3 flex flex-col gap-2 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <p>
            {filteredUsers.length} utilisateur
            {filteredUsers.length > 1 ? "s" : ""} trouvé
            {filteredUsers.length > 1 ? "s" : ""}, {totalFilteredCards} carte
            {totalFilteredCards > 1 ? "s" : ""}
          </p>
          {(searchTerm || roleFilter !== "all" || cardFilter !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm("");
                setRoleFilter("all");
                setCardFilter("all");
              }}
              className="self-start rounded border border-gray-300 px-3 py-1.5 font-semibold text-slate-700 transition hover:bg-slate-50 sm:self-auto"
            >
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      {filteredUsers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-slate-500">
          Aucun utilisateur ne correspond aux filtres.
        </div>
      ) : null}

      <div className="space-y-3 md:hidden">
        {paginatedUsers.map((u) => (
          <article
            key={u.id}
            className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm"
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <p className="text-base font-semibold text-slate-900">
                  {u.prenom} {u.nom}
                </p>
                <p className="text-xs text-slate-500">
                  {u.identifiant ?? "Sans identifiant"}
                </p>
              </div>
              <select
                value={u.role}
                onChange={(e) => changeRole(u.id, e.target.value)}
                className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r] ?? r}
                  </option>
                ))}
              </select>
            </div>

            {editingUserId === u.id ? (
              <div className="mb-3 grid grid-cols-1 gap-2">
                <input
                  value={editValues.nom}
                  onChange={(e) =>
                    setEditValues((prev) => ({ ...prev, nom: e.target.value }))
                  }
                  className="w-full rounded border border-gray-300 p-2"
                  placeholder="Nom"
                />
                <input
                  value={editValues.prenom}
                  onChange={(e) =>
                    setEditValues((prev) => ({
                      ...prev,
                      prenom: e.target.value,
                    }))
                  }
                  className="w-full rounded border border-gray-300 p-2"
                  placeholder="Prénom"
                />
                <input
                  value={editValues.identifiant}
                  onChange={(e) =>
                    setEditValues((prev) => ({
                      ...prev,
                      identifiant: e.target.value,
                    }))
                  }
                  className="w-full rounded border border-gray-300 p-2"
                  placeholder="Identifiant"
                />
              </div>
            ) : null}

            <div className="mb-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Cartes
              </p>
              <div className="space-y-1">
                {u.cartes && Object.entries(u.cartes).length > 0 ? (
                  Object.entries(u.cartes)
                    .sort((a, b) => Number(b[0]) - Number(a[0]))
                    .map(([annee, code]) => (
                      <div
                        key={annee}
                        className="flex items-center justify-between rounded bg-slate-50 px-2 py-1 text-sm"
                      >
                        <span>
                          {annee} - {code}
                        </span>
                        <button
                          className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-700"
                          onClick={() => requestRemoveCard(u, annee, code)}
                        >
                          Suppr.
                        </button>
                      </div>
                    ))
                ) : (
                  <span className="text-sm text-gray-400">Aucune carte</span>
                )}
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = e.currentTarget as any;
                const annee = f.annee.value;
                const prefix = f.prefix.value;
                const num = parseInt(f.num.value, 10);
                addCard(u.id, annee, prefix, num);
              }}
              className="mb-3 grid grid-cols-1 gap-2"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Ajouter une carte
              </p>
              <select
                name="annee"
                required
                className="w-full rounded border border-gray-300 p-2"
              >
                {yearRanges.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <select
                  name="prefix"
                  required
                  className="w-full rounded border border-gray-300 p-2"
                >
                  {ALLOWED_PREFIXES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <input
                  name="num"
                  type="number"
                  min={1}
                  placeholder="Numéro"
                  required
                  className="w-full rounded border border-gray-300 p-2"
                />
              </div>
              <button
                type="submit"
                className="rounded bg-blue-900 px-3 py-2 text-sm font-semibold text-white"
              >
                Ajouter
              </button>
            </form>

            <div className="flex flex-wrap gap-2">
              {editingUserId === u.id ? (
                <>
                  <button
                    onClick={() => saveUser(u.id)}
                    className="rounded bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700"
                  >
                    Enregistrer
                  </button>
                  <button
                    onClick={() => setEditingUserId(null)}
                    className="rounded bg-gray-400 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-500"
                  >
                    Annuler
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setEditingUserId(u.id);
                      setEditValues({
                        nom: u.nom,
                        prenom: u.prenom,
                        identifiant: u.identifiant ?? "",
                      });
                    }}
                    className="rounded bg-yellow-500 px-3 py-2 text-sm font-semibold text-white hover:bg-yellow-600"
                  >
                    Modifier
                  </button>
                  <button
                    onClick={() => requestDeleteUser(u)}
                    className="rounded bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"
                  >
                    Supprimer
                  </button>
                </>
              )}
            </div>
          </article>
        ))}
      </div>

      <div className="hidden w-full overflow-x-auto rounded-lg border border-gray-200 bg-white md:block">
        <table className="min-w-[1180px] table-fixed border-collapse">
          <colgroup>
            <col className="w-[14%]" />
            <col className="w-[14%]" />
            <col className="w-[20%]" />
            <col className="w-[18%]" />
            <col className="w-[17%]" />
            <col className="w-[9%]" />
            <col className="w-[8%]" />
          </colgroup>
          <thead>
            <tr>
              <th className="border-b border-r px-3 py-2 text-left">Nom</th>
              <th className="border-b border-r px-3 py-2 text-left">Prénom</th>
              <th className="border-b border-r px-3 py-2 text-left">
                Identifiant
              </th>
              <th className="border-b border-r px-3 py-2 text-left">Cartes</th>
              <th className="border-b border-r px-3 py-2 text-left">
                Ajouter une carte
              </th>
              <th className="border-b border-r px-3 py-2 text-left">Rôle</th>
              <th className="border-b px-3 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedUsers.map((u) => (
              <tr key={u.id}>
                <td className="border-b border-r px-3 py-3 align-top">
                  {editingUserId === u.id ? (
                    <input
                      value={editValues.nom}
                      onChange={(e) =>
                        setEditValues((prev) => ({
                          ...prev,
                          nom: e.target.value,
                        }))
                      }
                      className="w-full min-w-0 rounded border border-gray-300 p-2"
                    />
                  ) : (
                    u.nom
                  )}
                </td>
                <td className="border-b border-r px-3 py-3 align-top">
                  {editingUserId === u.id ? (
                    <input
                      value={editValues.prenom}
                      onChange={(e) =>
                        setEditValues((prev) => ({
                          ...prev,
                          prenom: e.target.value,
                        }))
                      }
                      className="w-full min-w-0 rounded border border-gray-300 p-2"
                    />
                  ) : (
                    u.prenom
                  )}
                </td>
                <td className="border-b border-r px-3 py-3 align-top">
                  {editingUserId === u.id ? (
                    <input
                      value={editValues.identifiant}
                      onChange={(e) =>
                        setEditValues((prev) => ({
                          ...prev,
                          identifiant: e.target.value,
                        }))
                      }
                      className="w-full min-w-0 rounded border border-gray-300 p-2"
                    />
                  ) : (
                    (u.identifiant ?? "")
                  )}
                </td>
                <td className="border-b border-r px-3 py-3 align-top">
                  {u.cartes && Object.entries(u.cartes).length > 0 ? (
                    Object.entries(u.cartes)
                      .sort((a, b) => Number(b[0]) - Number(a[0]))
                      .map(([annee, code]) => (
                        <div
                          key={annee}
                          className="mb-1 flex items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1 text-sm"
                        >
                          <span className="truncate">
                            {annee} - {code}
                          </span>
                          <button
                            className="shrink-0 rounded bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                            onClick={() => requestRemoveCard(u, annee, code)}
                          >
                            Suppr.
                          </button>
                        </div>
                      ))
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="border-b border-r px-3 py-3 align-top">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = e.currentTarget as any;
                      const annee = f.annee.value;
                      const prefix = f.prefix.value;
                      const num = parseInt(f.num.value, 10);
                      addCard(u.id, annee, prefix, num);
                    }}
                    className="grid grid-cols-[1fr_72px] gap-2"
                  >
                    <select
                      name="annee"
                      required
                      className="col-span-2 w-full rounded border border-gray-300 px-2 py-2"
                    >
                      {yearRanges.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                    <select
                      name="prefix"
                      required
                      className="w-full rounded border border-gray-300 px-2 py-2"
                    >
                      {ALLOWED_PREFIXES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                    <input
                      name="num"
                      type="number"
                      min={1}
                      placeholder="Numéro"
                      required
                      className="w-full min-w-0 rounded border border-gray-300 px-2 py-2"
                    />
                    <button
                      type="submit"
                      className="col-span-2 rounded bg-blue-900 px-2 py-2 text-sm font-semibold text-white hover:bg-blue-800"
                    >
                      Ajouter
                    </button>
                  </form>
                </td>
                <td className="border-b border-r px-3 py-3 align-top">
                  <select
                    value={u.role}
                    onChange={(e) => changeRole(u.id, e.target.value)}
                    className="w-full rounded border border-gray-300 px-2 py-2 text-sm"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r] ?? r}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="border-b px-3 py-3 align-top">
                  <div className="flex flex-wrap gap-2">
                    {editingUserId === u.id ? (
                      <>
                        <button
                          onClick={() => saveUser(u.id)}
                          className="rounded bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700"
                        >
                          OK
                        </button>
                        <button
                          onClick={() => setEditingUserId(null)}
                          className="rounded bg-gray-400 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-500"
                        >
                          Annuler
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setEditingUserId(u.id);
                            setEditValues({
                              nom: u.nom,
                              prenom: u.prenom,
                              identifiant: u.identifiant ?? "",
                            });
                          }}
                          className="rounded bg-yellow-500 px-3 py-2 text-sm font-semibold text-white hover:bg-yellow-600"
                        >
                          Modifier
                        </button>
                        <button
                          onClick={() => requestDeleteUser(u)}
                          className="rounded bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"
                        >
                          Suppr.
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredUsers.length > PAGE_SIZE ? (
        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-3 text-sm text-slate-700 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <p>
            {pageStart}-{pageEnd} sur {filteredUsers.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={safeCurrentPage === 1}
              className="rounded border border-gray-300 px-3 py-2 font-semibold transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-white"
            >
              Précédent
            </button>
            <span className="min-w-24 text-center font-semibold">
              Page {safeCurrentPage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() =>
                setCurrentPage((page) => Math.min(totalPages, page + 1))
              }
              disabled={safeCurrentPage === totalPages}
              className="rounded border border-gray-300 px-3 py-2 font-semibold transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-white"
            >
              Suivant
            </button>
          </div>
        </div>
      ) : null}

      {confirmation ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeConfirmation();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-confirm-title"
            className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-5 shadow-xl"
          >
            <div className="mb-4">
              <p
                id="admin-confirm-title"
                className="text-lg font-semibold text-slate-950"
              >
                {confirmation.title}
              </p>
              <p className="mt-2 text-sm text-slate-700">
                {confirmation.message}
              </p>
              {confirmation.details ? (
                <p className="mt-2 rounded border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {confirmation.details}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeConfirmation}
                disabled={confirmationLoading}
                className="rounded border border-gray-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-gray-400"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmAction}
                disabled={confirmationLoading}
                className="rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
              >
                {confirmationLoading
                  ? "Suppression..."
                  : confirmation.confirmLabel}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
