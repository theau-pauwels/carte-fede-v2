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
          location.href = "/login?next=" + encodeURIComponent(location.pathname);
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
    const data = Object.fromEntries(formData.entries()) as Record<string, string>;

    // Validation member_id OU email
    if (!(((data.member_id ?? "").match(/^\d{6}$/)) || data.email)) {
      setMsg({ type: "err", text: "Fournir member_id (6 chiffres) OU email." });
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
        password: data.password,
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

    setMsg({ type: "ok", text: "Utilisateur créé ✅" });
    e.currentTarget.reset();
  }

  return (
    <form id="create" onSubmit={handleSubmit}>
        {/* <div className="row">
          <label>Prénom<br/>
            <input name="prenom" required className="border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"></input>
          </label>
          <label>Nom<br/>
            <input name="nom" required className="border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"></input>
          </label>
        </div> */}

      <label>
        Identifiant (6 chiffres) — option 1<br />
        <input
          name="member_id"
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          placeholder="000123"
          className="border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </label>

      <div className="muted">OU</div>

      <label>
        Email — option 2<br />
        <input
          name="email"
          type="email"
          placeholder="user@example.com"
          className="border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </label><br/>

      <label>
        Mot de passe initial<br />
        <input
          name="password"
          type="password"
          minLength={8}
          required
          className="border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </label><br/>

      <label>
        Rôle<br />
        <select
          name="role"
          required
          className="border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="en attente">En attente</option>
          <option value="member">Member</option>
          <option value="verifier">Verifier</option>
          <option value="admin">Admin</option>
        </select>
      </label><br/><br/>

      <fieldset>
        <legend className="muted">Ajouter directement une carte (optionnel)</legend>
        <div className="row">
          <label>
            Année<br />
            <select
              name="annee"
              className="border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="2025-2026">2025-2026</option>
              <option value="2026-2027">2026-2027</option>
              <option value="2027-2028">2027-2028</option>
            </select>
          </label>

          <label>
            Préfixe<br />
            <select
              name="prefix"
              className="border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="A">A</option>
              <option value="F">F</option>
              <option value="E">E</option>
              <option value="EA">EA</option>
              <option value="MI">MI</option>
              <option value="S">S</option>
            </select>
          </label>

          <label>
            Numéro<br />
            <input
              name="num"
              type="number"
              min={1}
              placeholder="12"
              className="border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
        </div>
      </fieldset><br/>

      <button
        type="submit"
        className="rounded-lg border-2 border-blue-900 bg-blue-900 px-4 py-2 text-white transition duration-150 hover:bg-blue-50 hover:text-blue-900"
      >
        Créer
      </button>

      <div className={msg.type}>{msg.text}</div>
    </form>
  );
}
