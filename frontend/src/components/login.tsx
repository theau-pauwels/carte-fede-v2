import React, { useState } from "react";

interface LoginFormProps {
  next?: string;
}

const isSixDigits = (value: string) => /^\d{6}$/.test(value.trim());
const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const LoginForm: React.FC<LoginFormProps> = ({ next = "/" }) => {
  const [ident, setIdent] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    const trimmedIdent = ident.trim();
    if (!trimmedIdent || !password) {
      setError("Identifiant et mot de passe requis.");
      return;
    }

    let payload: Record<string, string> = { password };
    if (isEmail(trimmedIdent)) {
      payload.email = trimmedIdent.toLowerCase();
    } else if (isSixDigits(trimmedIdent)) {
      payload.identifiant = trimmedIdent;
    } else {
      setError("Saisis un email valide.");
      return;
    }

    try {
      setIsLoading(true);
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let data: any = {};
        try {
          data = await res.json();
        } catch (err) {
          console.error(err);
        }
        setError(data.error || `Erreur ${res.status}`);
        return;
      }

      window.location.href = next || "/";
    } catch (err) {
      console.error(err);
      setError("Erreur réseau, réessaie plus tard.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-xl bg-white px-5 py-6 shadow-lg sm:px-8">
      <h1 className="mb-2 bg-white text-xl font-semibold text-bleu sm:text-2xl">Connexion</h1>
      <form onSubmit={handleSubmit} className="stack" noValidate>
        <label htmlFor="ident">Identifiant (email ou matricule UMONS)</label>
        <input
          id="ident"
          name="ident"
          type="text"
          placeholder="email ou matricule UMONS"
          autoComplete="username"
          value={ident}
          onChange={(e) => setIdent(e.target.value)}
          className="border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        />

        <label htmlFor="password">Mot de passe</label>
        <input
          id="password"
          name="password"
          type="password"
          placeholder="••••••••"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        />

        <button
          type="submit"
          disabled={isLoading}
          className="rounded-lg border-2 border-blue-900 bg-blue-900 px-4 py-2 text-white transition duration-150 hover:bg-blue-50 hover:text-blue-50 disabled:opacity-60 disabled:cursor-not-allowed"
        >

          {isLoading ? "Connexion..." : "Se connecter"}
        </button>

        <p aria-live="polite" style={{ color: "#b00" }}>
          {error}
        </p>

        <style>
          {`
            .stack { display:flex; flex-direction:column; gap:.8rem; max-width:380px; }
            input, button { padding:.55rem .7rem; font-size:1rem; }
          `}
        </style>
      </form>
      <a href="/RequestPasswordReset" className="text-sm text-gray-600 hover:underline">
        Mot de passe oublié ?
      </a>
    </div>
  );
};

export default LoginForm;
