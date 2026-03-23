import { useEffect, useState, type FormEvent } from "react";

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
  created_at?: string;
  expires_at?: string;
  access_type: "public" | "restricted";
};

type RoomEntry = {
  room: Room;
  active_vote?: VoteSession | null;
};

function formatDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("fr-BE");
}

export default function VotePortal() {
  const [rooms, setRooms] = useState<RoomEntry[]>([]);
  const [selected, setSelected] = useState<RoomEntry | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const fetchRooms = async () => {
    const res = await fetch("/api/rooms", { credentials: "include" });
    if (!res.ok) throw new Error("Impossible de charger les rooms");
    const data = await res.json();
    setRooms(data);
    if (selected) {
      const updated = data.find((x: RoomEntry) => x.room.id === selected.room.id) || null;
      setSelected(updated);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const meRes = await fetch("/api/me", { credentials: "include" });
        if (!meRes.ok) {
          window.location.href = "/login?next=" + encodeURIComponent(window.location.pathname);
          return;
        }

        await fetchRooms();
      } catch {
        setMessage("Impossible de charger les rooms de vote.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const refreshRoom = async (roomId: string) => {
    const res = await fetch(`/api/rooms/${roomId}`, { credentials: "include" });
    if (!res.ok) return;
    const data = await res.json();
    setSelected(data);
  };

  const joinByCode = async (e: FormEvent) => {
    e.preventDefault();
    setMessage("");

    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setMessage("Entre un code de room.");
      return;
    }

    const res = await fetch("/api/rooms/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ code }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error || `Erreur ${res.status}`);
      return;
    }

    setSelected(data);
    setJoinCode("");
    setMessage("");
    await fetchRooms();
  };

  const submitVote = async (sessionId: string, optionId: string) => {
    if (!selected) return;
    setMessage("");

    const res = await fetch(`/api/rooms/${selected.room.id}/vote/${sessionId}/ballot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ option_id: optionId }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error || `Erreur ${res.status}`);
      return;
    }

    setMessage("Vote enregistré.");
    await refreshRoom(selected.room.id);
    await fetchRooms();
  };

  if (loading) return <p>Chargement...</p>;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-xl font-semibold text-blue-900">Trouver une room</h2>

        <form onSubmit={joinByCode} className="mb-4 flex flex-col gap-2 sm:flex-row">
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="Code room (ex: AB23CD)"
            className="w-full rounded-xl border border-slate-300 px-3 py-2"
          />
          <button
            type="submit"
            className="rounded-xl bg-blue-900 px-4 py-2 font-semibold text-white hover:bg-blue-800"
          >
            Rejoindre
          </button>
        </form>

        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Rooms accessibles</h3>
        <div className="space-y-2">
          {rooms.length ? (
            rooms.map((entry) => (
              <button
                key={entry.room.id}
                type="button"
                onClick={() => setSelected(entry)}
                className="block w-full rounded-xl border border-slate-200 px-3 py-2 text-left hover:bg-slate-50"
              >
                <p className="font-semibold text-slate-900">{entry.room.title}</p>
                <p className="text-xs text-slate-500">Code: {entry.room.code} - expire: {formatDate(entry.room.expires_at)}</p>
              </button>
            ))
          ) : (
            <p className="text-sm text-slate-500">Aucune room accessible actuellement.</p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-xl font-semibold text-blue-900">Salle de vote</h2>

        {selected ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-lg font-semibold text-slate-900">{selected.room.title}</p>
              <p className="text-sm text-slate-600">Code: {selected.room.code}</p>
              <p className="text-sm text-slate-600">Expire: {formatDate(selected.room.expires_at)}</p>
            </div>

            {selected.active_vote ? (
              <div className="space-y-3 rounded-xl border border-slate-200 p-3">
                <p className="text-base font-semibold text-slate-800">{selected.active_vote.question}</p>
                <div className="grid gap-2">
                  {selected.active_vote.options.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => submitVote(selected.active_vote!.id, option.id)}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-left hover:bg-slate-50"
                    >
                      {option.text}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Aucun vote actif dans cette room.</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Sélectionne une room ou rejoins-la via son code.</p>
        )}

        {message ? <p className="mt-4 text-sm text-blue-800">{message}</p> : null}
      </section>
    </div>
  );
}
