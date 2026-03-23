import { useEffect, useMemo, useState, type FormEvent } from "react";

type AdminUser = {
  id: string;
  nom: string;
  prenom: string;
  member_id?: string | null;
};

type VoteOption = { id: string; text: string };

type VoteSession = {
  id: string;
  question: string;
  status: "open" | "closed";
  options: VoteOption[];
};

type Room = {
  id: string;
  title: string;
  code: string;
  password: string;
  created_at?: string;
  expires_at?: string;
  access_type: "public" | "restricted";
  allowed_member_ids: string[];
  active_vote?: VoteSession | null;
};

function formatDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("fr-BE");
}

export default function AdminVotesManager() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [accessType, setAccessType] = useState<"public" | "restricted">("public");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

  const [voteQuestionByRoom, setVoteQuestionByRoom] = useState<Record<string, string>>({});
  const [voteOptionsByRoom, setVoteOptionsByRoom] = useState<Record<string, string>>({});

  const userChoices = useMemo(
    () =>
      users
        .filter((u) => !!u.member_id)
        .sort((a, b) => {
          const nameA = `${a.nom} ${a.prenom}`.toLowerCase();
          const nameB = `${b.nom} ${b.prenom}`.toLowerCase();
          return nameA.localeCompare(nameB);
        }),
    [users]
  );

  const fetchRooms = async () => {
    const res = await fetch("/api/admin/rooms", { credentials: "include" });
    if (!res.ok) throw new Error("Impossible de charger les rooms");
    const data = await res.json();
    setRooms(data);
  };

  const fetchUsers = async () => {
    const res = await fetch("/api/admin/users", { credentials: "include" });
    if (!res.ok) throw new Error("Impossible de charger les utilisateurs");
    const data = await res.json();
    setUsers(data);
  };

  useEffect(() => {
    (async () => {
      try {
        setError("");
        const meRes = await fetch("/api/me", { credentials: "include" });
        if (!meRes.ok) {
          window.location.href = "/login?next=" + encodeURIComponent(window.location.pathname);
          return;
        }
        const me = await meRes.json();
        if (me.role !== "admin") {
          window.location.href = "/";
          return;
        }

        await Promise.all([fetchUsers(), fetchRooms()]);
      } catch (err: any) {
        setError(err?.message || "Erreur lors du chargement");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggleMember = (memberId: string) => {
    setSelectedMemberIds((prev) =>
      prev.includes(memberId) ? prev.filter((x) => x !== memberId) : [...prev, memberId]
    );
  };

  const createRoom = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      const payload = {
        title,
        duration_minutes: durationMinutes,
        access_type: accessType,
        allowed_member_ids: accessType === "restricted" ? selectedMemberIds : [],
      };

      const res = await fetch("/api/admin/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Erreur ${res.status}`);
        return;
      }

      setTitle("");
      setDurationMinutes(60);
      setAccessType("public");
      setSelectedMemberIds([]);
      await fetchRooms();
    } catch {
      setError("Erreur réseau lors de la création de room");
    }
  };

  const deleteRoom = async (roomId: string) => {
    if (!confirm("Supprimer cette room ?")) return;

    const res = await fetch(`/api/admin/rooms/${roomId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      alert("Impossible de supprimer la room");
      return;
    }
    await fetchRooms();
  };

  const extendRoom = async (roomId: string, minutes: number) => {
    const res = await fetch(`/api/admin/rooms/${roomId}/extend`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ minutes }),
    });
    if (!res.ok) {
      alert("Impossible d'étendre la room");
      return;
    }
    await fetchRooms();
  };

  const createVote = async (roomId: string) => {
    const question = (voteQuestionByRoom[roomId] || "").trim();
    const optionsRaw = voteOptionsByRoom[roomId] || "";
    const options = optionsRaw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (!question || options.length < 2) {
      alert("Ajoute une question et au moins 2 options (une par ligne).");
      return;
    }

    const res = await fetch(`/api/admin/rooms/${roomId}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ question, options }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || `Erreur ${res.status}`);
      return;
    }

    setVoteQuestionByRoom((prev) => ({ ...prev, [roomId]: "" }));
    setVoteOptionsByRoom((prev) => ({ ...prev, [roomId]: "" }));
    await fetchRooms();
  };

  const closeVote = async (roomId: string, sessionId: string) => {
    const res = await fetch(`/api/admin/rooms/${roomId}/vote/${sessionId}/close`, {
      method: "PUT",
      credentials: "include",
    });
    if (!res.ok) {
      alert("Impossible de fermer le vote");
      return;
    }
    await fetchRooms();
  };

  if (loading) return <p>Chargement...</p>;

  return (
    <div className="w-full space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="mb-3 text-xl font-semibold text-blue-900">Créer une room de vote</h2>

        <form onSubmit={createRoom} className="grid gap-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titre de la room"
            className="w-full rounded-xl border border-slate-300 px-3 py-2"
            required
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span>Durée (minutes)</span>
              <input
                type="number"
                min={1}
                max={1440}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(parseInt(e.target.value || "0", 10) || 0)}
                className="rounded-xl border border-slate-300 px-3 py-2"
                required
              />
            </label>

            <label className="grid gap-1 text-sm">
              <span>Accès</span>
              <select
                value={accessType}
                onChange={(e) => setAccessType(e.target.value as "public" | "restricted")}
                className="rounded-xl border border-slate-300 px-3 py-2"
              >
                <option value="public">Public (tous les connectés)</option>
                <option value="restricted">Restreint (matricules choisis)</option>
              </select>
            </label>
          </div>

          {accessType === "restricted" ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-sm font-semibold text-slate-700">Matricules autorisés</p>
              <div className="max-h-52 space-y-1 overflow-auto pr-1">
                {userChoices.length ? (
                  userChoices.map((u) => (
                    <label key={u.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-white">
                      <input
                        type="checkbox"
                        checked={selectedMemberIds.includes(u.member_id || "")}
                        onChange={() => toggleMember(u.member_id || "")}
                      />
                      <span>
                        {u.nom} {u.prenom} ({u.member_id})
                      </span>
                    </label>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">Aucun utilisateur avec matricule.</p>
                )}
              </div>
            </div>
          ) : null}

          <div>
            <button
              type="submit"
              className="rounded-xl bg-blue-900 px-4 py-2 font-semibold text-white hover:bg-blue-800"
            >
              Créer la room
            </button>
          </div>
        </form>

        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-blue-900">Rooms</h2>

        {rooms.length ? (
          rooms.map((room) => (
            <article key={room.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{room.title}</h3>
                  <p className="text-sm text-slate-600">Code: <strong>{room.code}</strong></p>
                  <p className="text-sm text-slate-600">Mot de passe: <strong>{room.password}</strong></p>
                  <p className="text-sm text-slate-600">Expire: {formatDate(room.expires_at)}</p>
                  <p className="text-sm text-slate-600">
                    Accès: {room.access_type === "public" ? "Public" : `Restreint (${room.allowed_member_ids.length} matricules)`}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => extendRoom(room.id, 30)}
                    className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                  >
                    +30 min
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteRoom(room.id)}
                    className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"
                  >
                    Supprimer
                  </button>
                </div>
              </div>

              {room.access_type === "restricted" ? (
                <p className="mt-2 text-xs text-slate-500">
                  Matricules autorisés: {room.allowed_member_ids.join(", ")}
                </p>
              ) : null}

              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-sm font-semibold text-slate-700">Lancer un vote</p>
                <div className="grid gap-2">
                  <input
                    value={voteQuestionByRoom[room.id] || ""}
                    onChange={(e) =>
                      setVoteQuestionByRoom((prev) => ({ ...prev, [room.id]: e.target.value }))
                    }
                    placeholder="Question du vote"
                    className="rounded-lg border border-slate-300 px-3 py-2"
                  />
                  <textarea
                    value={voteOptionsByRoom[room.id] || ""}
                    onChange={(e) =>
                      setVoteOptionsByRoom((prev) => ({ ...prev, [room.id]: e.target.value }))
                    }
                    placeholder={"Une option par ligne\nOui\nNon\nAbstention"}
                    rows={4}
                    className="rounded-lg border border-slate-300 px-3 py-2"
                  />
                  <div>
                    <button
                      type="button"
                      onClick={() => createVote(room.id)}
                      className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                    >
                      Ouvrir le vote
                    </button>
                  </div>
                </div>

                {room.active_vote ? (
                  <div className="mt-3 rounded-lg bg-white p-3">
                    <p className="text-sm font-semibold text-slate-800">Vote actif: {room.active_vote.question}</p>
                    <ul className="mt-1 list-disc pl-5 text-sm text-slate-600">
                      {room.active_vote.options.map((option) => (
                        <li key={option.id}>{option.text}</li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      onClick={() => closeVote(room.id, room.active_vote!.id)}
                      className="mt-2 rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-600"
                    >
                      Fermer le vote actif
                    </button>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">Aucun vote actif.</p>
                )}
              </div>
            </article>
          ))
        ) : (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
            Aucune room pour l'instant.
          </p>
        )}
      </section>
    </div>
  );
}
