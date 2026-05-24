import { useEffect, useMemo, useState, type FormEvent } from "react";

type QuestionType = "single" | "multiple" | "text" | "number";
type AccessType = "public" | "code";

type FormQuestion = {
  id: string;
  title: string;
  question_type: QuestionType;
  required: boolean;
  options: { id: string; text: string }[];
};

type VoteForm = {
  id: string;
  title: string;
  description: string;
  access_type: AccessType;
  status: "open";
  is_anonymous: boolean;
  code?: string;
  questions: FormQuestion[];
  has_responded: boolean;
  active_count: number;
};

type Answers = Record<string, string | string[]>;

function questionTypeLabel(type: QuestionType) {
  if (type === "single") return "Choix unique";
  if (type === "multiple") return "Choix multiple";
  if (type === "number") return "Nombre";
  return "Texte libre";
}

export default function VotePortal() {
  const [forms, setForms] = useState<VoteForm[]>([]);
  const [selected, setSelected] = useState<VoteForm | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedIsJoined = useMemo(
    () => selected && !forms.some((form) => form.id === selected.id),
    [forms, selected],
  );

  const fetchForms = async () => {
    const res = await fetch("/api/forms", { credentials: "include" });
    if (!res.ok) throw new Error("Impossible de charger les votes");
    const data = await res.json();
    setForms(data);
    setSelected((current) => {
      if (!current) return null;
      return data.find((form: VoteForm) => form.id === current.id) || current;
    });
  };

  const refreshSelected = async (formId: string) => {
    const res = await fetch(`/api/forms/${formId}`, { credentials: "include" });
    if (!res.ok) return;
    const data = await res.json();
    setSelected(data);
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const meRes = await fetch("/api/me", { credentials: "include" });
        if (!meRes.ok) {
          setAuthenticated(false);
          return;
        }
        setAuthenticated(true);
        await fetchForms();
      } catch {
        if (!cancelled) setMessage("Impossible de charger les votes.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    const timer = window.setInterval(() => {
      fetchForms().catch(() => undefined);
      if (selected) refreshSelected(selected.id).catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [authenticated, selected?.id]);

  useEffect(() => {
    if (!selected || !authenticated) return;

    const sendPresence = async () => {
      const res = await fetch(`/api/forms/${selected.id}/presence`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      if (typeof data.active_count === "number") {
        setSelected((current) =>
          current && current.id === selected.id
            ? { ...current, active_count: data.active_count }
            : current,
        );
      }
    };

    sendPresence().catch(() => undefined);
    const timer = window.setInterval(() => {
      sendPresence().catch(() => undefined);
    }, 10000);

    return () => window.clearInterval(timer);
  }, [authenticated, selected?.id]);

  const selectForm = async (form: VoteForm) => {
    setMessage("");
    setAnswers({});
    setSelected(form);
    await refreshSelected(form.id);
  };

  const joinByCode = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");

    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setMessage("Entre un code de vote.");
      return;
    }

    const res = await fetch("/api/forms/join", {
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
    setAnswers({});
    setJoinCode("");
    setMessage("");
  };

  const setAnswer = (questionId: string, value: string | string[]) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const toggleMultipleAnswer = (questionId: string, optionId: string) => {
    setAnswers((prev) => {
      const current = Array.isArray(prev[questionId])
        ? (prev[questionId] as string[])
        : [];
      const next = current.includes(optionId)
        ? current.filter((id) => id !== optionId)
        : [...current, optionId];
      return { ...prev, [questionId]: next };
    });
  };

  const submitAnswers = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;

    setSubmitting(true);
    setMessage("");

    try {
      const res = await fetch(`/api/forms/${selected.id}/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ answers }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error || `Erreur ${res.status}`);
        return;
      }

      setMessage("Réponses enregistrées. Tu ne peux plus les modifier.");
      await refreshSelected(selected.id);
      await fetchForms();
    } catch {
      setMessage("Erreur réseau lors de l'envoi des réponses.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <p>Chargement...</p>;

  if (authenticated === false) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-blue-900">Votes</h2>
        <p className="mt-2 text-slate-600">
          Connecte-toi pour accéder aux votes et garantir une seule réponse par
          personne.
        </p>
        <a
          href={`/login?next=${encodeURIComponent(window.location.pathname)}`}
          className="mt-4 inline-flex rounded-lg bg-blue-900 px-4 py-2 font-semibold text-white hover:bg-blue-800"
        >
          Se connecter
        </a>
      </div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(280px,0.8fr)_1.4fr]">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-xl font-semibold text-blue-900">
          Votes accessibles
        </h2>

        <form
          onSubmit={joinByCode}
          className="mb-4 flex flex-col gap-2 sm:flex-row lg:flex-col"
        >
          <input
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value)}
            placeholder="Code de vote"
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
          <button
            type="submit"
            className="rounded-lg bg-blue-900 px-4 py-2 font-semibold text-white hover:bg-blue-800"
          >
            Rejoindre
          </button>
        </form>

        <div className="space-y-2">
          {forms.length ? (
            forms.map((form) => (
              <button
                key={form.id}
                type="button"
                onClick={() => selectForm(form)}
                className={`block w-full rounded-lg border px-3 py-2 text-left hover:bg-slate-50 ${
                  selected?.id === form.id
                    ? "border-blue-900 bg-blue-50"
                    : "border-slate-200"
                }`}
              >
                <p className="font-semibold text-slate-900">{form.title}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {form.is_anonymous ? "Anonyme" : "Nominatif"} -{" "}
                  {form.active_count} personne
                  {form.active_count > 1 ? "s" : ""} dans la room
                </p>
              </button>
            ))
          ) : (
            <p className="text-sm text-slate-500">
              Aucun vote public ouvert pour l'instant.
            </p>
          )}
        </div>

        {selectedIsJoined ? (
          <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
            Vote rejoint avec un code.
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        {selected ? (
          <div>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-blue-900">
                  {selected.title}
                </h2>
                {selected.description ? (
                  <p className="mt-1 text-sm text-slate-600">
                    {selected.description}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-900">
                  {selected.is_anonymous ? "Anonyme" : "Nominatif"}
                </span>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-800">
                  {selected.active_count} dans la room
                </span>
              </div>
            </div>

            {selected.has_responded ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
                Réponse déjà enregistrée.
              </div>
            ) : (
              <form onSubmit={submitAnswers} className="space-y-4">
                {selected.questions.map((question, index) => (
                  <fieldset
                    key={question.id}
                    className="rounded-lg border border-slate-200 p-3"
                  >
                    <legend className="px-1 font-semibold text-slate-900">
                      {index + 1}. {question.title}
                      {question.required ? (
                        <span className="text-red-700"> *</span>
                      ) : null}
                    </legend>
                    <p className="mb-3 mt-1 text-xs font-semibold uppercase text-slate-500">
                      {questionTypeLabel(question.question_type)}
                    </p>

                    {question.question_type === "single" ? (
                      <div className="grid gap-2">
                        {question.options.map((option) => (
                          <label
                            key={option.id}
                            className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2"
                          >
                            <input
                              type="radio"
                              name={question.id}
                              checked={answers[question.id] === option.id}
                              onChange={() => setAnswer(question.id, option.id)}
                            />
                            <span>{option.text}</span>
                          </label>
                        ))}
                      </div>
                    ) : null}

                    {question.question_type === "multiple" ? (
                      <div className="grid gap-2">
                        {question.options.map((option) => {
                          const current = Array.isArray(answers[question.id])
                            ? (answers[question.id] as string[])
                            : [];
                          return (
                            <label
                              key={option.id}
                              className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2"
                            >
                              <input
                                type="checkbox"
                                checked={current.includes(option.id)}
                                onChange={() =>
                                  toggleMultipleAnswer(question.id, option.id)
                                }
                              />
                              <span>{option.text}</span>
                            </label>
                          );
                        })}
                      </div>
                    ) : null}

                    {question.question_type === "text" ? (
                      <textarea
                        value={(answers[question.id] as string) || ""}
                        onChange={(event) =>
                          setAnswer(question.id, event.target.value)
                        }
                        className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2"
                        placeholder="Ta réponse"
                      />
                    ) : null}

                    {question.question_type === "number" ? (
                      <input
                        type="number"
                        value={(answers[question.id] as string) || ""}
                        onChange={(event) =>
                          setAnswer(question.id, event.target.value)
                        }
                        className="w-full rounded-lg border border-slate-300 px-3 py-2"
                        placeholder="Nombre"
                      />
                    ) : null}
                  </fieldset>
                ))}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-lg bg-blue-900 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:cursor-wait disabled:opacity-70"
                >
                  {submitting ? "Validation..." : "Valider mes réponses"}
                </button>
              </form>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            Sélectionne un vote public ou rejoins une room avec un code.
          </p>
        )}

        {message ? (
          <p className="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900">
            {message}
          </p>
        ) : null}
      </section>
    </div>
  );
}
