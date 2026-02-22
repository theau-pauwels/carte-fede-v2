import { useEffect, useMemo, useState } from "react";

type Membership = {
  annee: number;
  annee_code?: string;
};

function formatAcademicYear(start: number): string {
  return `${start}-${start + 1}`;
}

function padCode(code?: string): string {
  if (!code) return "-";
  return code.replace(/-/g, " - ");
}

export default function AppCartes() {
  const [loading, setLoading] = useState(true);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [copyMessage, setCopyMessage] = useState<string>("");

  useEffect(() => {
    const load = async () => {
      try {
        const me = await fetch("/api/me", { credentials: "include" });
        if (!me.ok) {
          window.location.href = "/login?next=" + encodeURIComponent(window.location.pathname);
          return;
        }

        const res = await fetch("/api/memberships", { credentials: "include" });
        if (!res.ok) {
          setMemberships([]);
          return;
        }

        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        list.sort((a: Membership, b: Membership) => b.annee - a.annee);
        setMemberships(list);
      } catch {
        setMemberships([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const updatedLabel = useMemo(() => {
    return new Intl.DateTimeFormat("fr-BE", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date());
  }, []);

  const copyIdentifier = async (value?: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopyMessage(`Identifiant ${value} copié.`);
    } catch {
      setCopyMessage("Copie impossible sur ce navigateur.");
    }
    window.setTimeout(() => setCopyMessage(""), 2200);
  };

  if (loading) {
    return <p className="mx-auto max-w-5xl p-8 text-slate-500">Chargement des cartes...</p>;
  }

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-5 sm:px-8 sm:py-8">
      <header className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm sm:p-8">
        <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-start">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-slate-900">Mes cartes</h1>
            <p className="mt-2 max-w-xl text-base leading-relaxed text-slate-500">
              Retrouvez ici l&apos;ensemble de vos cartes d&apos;adhésion actives. Présentez l&apos;identifiant pour prouver
              votre statut lors des événements et contrôles.
            </p>
          </div>
          <a
            href="/app/qr"
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-indigo-500 px-6 py-3 text-base font-bold text-white shadow-sm transition hover:from-blue-700 hover:to-indigo-600"
          >
            Générer mon QR
          </a>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-500">Cartes actives</p>
            <p className="mt-1 text-4xl font-black text-slate-900">{memberships.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-500">Dernière mise à jour</p>
            <p className="mt-1 text-3xl font-black text-slate-900">{updatedLabel}</p>
          </div>
        </div>
      </header>

      {!memberships.length ? (
        <article className="rounded-3xl border border-slate-200 bg-white p-8 text-slate-500 shadow-sm">
          Aucune carte active disponible.
        </article>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {memberships.map((item) => (
            <article key={item.annee} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-500">Période</p>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
                  Active
                </span>
              </div>

              <h2 className="mt-1 text-3xl font-black text-slate-900">{formatAcademicYear(item.annee)}</h2>

              <p className="mt-6 text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Identifiant</p>
              <div className="mt-2 rounded-xl bg-slate-100 px-4 py-3 text-2xl font-extrabold tracking-wide text-slate-700">
                {padCode(item.annee_code)}
              </div>

              <button
                type="button"
                onClick={() => copyIdentifier(item.annee_code)}
                className="mt-5 inline-flex items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-indigo-500 px-5 py-2 text-sm font-bold text-white transition hover:from-blue-700 hover:to-indigo-600"
              >
                Copier l&apos;identifiant
              </button>
            </article>
          ))}
        </div>
      )}

      {copyMessage ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">{copyMessage}</p>
      ) : null}
    </section>
  );
}
