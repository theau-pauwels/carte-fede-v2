import { useEffect, useState } from "react";

type Msg = { type?: "ok" | "err"; text: string };

export default function Carte() {
  const [msg, setMsg] = useState<Msg>({ text: "" });

  // Guard admin (équivalent de ton script guard())
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/me", { credentials: "include" });
        if (!r.ok) {
          location.href =
            "/login?next=" + encodeURIComponent(location.pathname);
          return;
        }
        const me = await r.json();
        if (me.role !== "admin") location.href = "/";
      } catch {
        location.href = "/login?next=" + encodeURIComponent(location.pathname);
      }
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg({ text: "" });

    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries()) as Record<
      string,
      string
    >;

    // Validation member_id OU email
    if (!((data.member_id ?? "").match(/^\d{6}$/) || data.email)) {
      setMsg({
        type: "err",
        text: "Fournis un identifiant à 6 chiffres ou un email.",
      });
      return;
    }

    const prenom = data.prenom?.trim() || "*";
    const nom = data.nom?.trim() || "*";

    // Création de l'utilisateur
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        prenom,
        nom,
        member_id: data.member_id,
        email: data.email,
        role: data.role,
      }),
    });

    if (!res.ok) {
      try {
        const j = await res.json();
        setMsg({ type: "err", text: j.error || `Erreur ${res.status}` });
      } catch {
        setMsg({ type: "err", text: `Erreur ${res.status}` });
      }
      return;
    }

    const user = await res.json();

    // Ajout de la carte si renseignée
    if (data.annee && data.prefix && data.num) {
      const cardRes = await fetch(`/api/admin/users/${user.id}/annees`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          annee: data.annee,
          annee_code: `${data.prefix}-${data.num}`,
        }),
      });
      if (!cardRes.ok) console.warn("Erreur lors de l'ajout de la carte");
    }

    setMsg({
      type: "ok",
      text: "Utilisateur créé. Un email d'invitation a été envoyé.",
    });
    e.currentTarget.reset();
  }

  return (
    <form id="create" onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-700">
            Identifiant (6 chiffres)
          </span>
          <input
            name="member_id"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            placeholder="000123"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </label>

        <div className="flex items-center justify-center pb-2">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            ou
          </span>
        </div>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-700">
            Email
          </span>
          <input
            name="email"
            type="email"
            placeholder="user@example.com"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900">
          Le mot de passe sera choisi par l'utilisateur depuis le lien reçu par
          email.
        </div>
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-700">
            Rôle
          </span>
          <select
            name="role"
            required
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          >
            <option value="en attente">En attente</option>
            <option value="member">Membre</option>
            <option value="verifier">Vérificateur</option>
            <option value="admin">Admin</option>
          </select>
        </label>
      </div>

      <fieldset className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
        <legend className="px-2 text-sm font-semibold text-slate-700">
          Carte à ajouter (facultatif)
        </legend>
        <div className="mt-2 grid gap-4 md:grid-cols-3">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">
              Année
            </span>
            <select
              name="annee"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              <option value="2026-2027">2026-2027</option>
              <option value="2027-2028">2027-2028</option>
              <option value="2025-2026">2025-2026</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">
              Préfixe
            </span>
            <select
              name="prefix"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              <option value="A">A</option>
              <option value="F">F</option>
              <option value="E">E</option>
              <option value="EA">EA</option>
              <option value="MI">MI</option>
              <option value="S">S</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">
              Numéro
            </span>
            <input
              name="num"
              type="number"
              min={1}
              placeholder="12"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </label>
        </div>
      </fieldset>

      <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-xl bg-blue-900 px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-blue-800"
        >
          Créer l'utilisateur
        </button>

        {msg.text ? (
          <div
            className={
              msg.type === "ok"
                ? "rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700"
                : "rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700"
            }
          >
            {msg.text}
          </div>
        ) : null}
      </div>
    </form>
  );
}
