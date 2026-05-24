import { useEffect, useMemo, useState, type FormEvent } from "react";

type QuestionType = "single" | "multiple" | "text" | "number";
type FormStatus = "draft" | "open" | "closed";
type AccessType = "public" | "code";

type BuilderQuestion = {
  title: string;
  question_type: QuestionType;
  required: boolean;
  options: string[];
};

type FormOptionResult = {
  id: string;
  text: string;
  count: number;
};

type FormResult = {
  question_id: string;
  question_type: QuestionType;
  title: string;
  total_answers: number;
  options?: FormOptionResult[];
  average?: number | null;
  min?: number | null;
  max?: number | null;
  answers?: { text: string; respondent?: string | null }[];
};

type AdminForm = {
  id: string;
  title: string;
  description: string;
  code: string;
  access_type: AccessType;
  status: FormStatus;
  is_anonymous: boolean;
  created_at?: string | null;
  opened_at?: string | null;
  closed_at?: string | null;
  response_count: number;
  active_count: number;
  results: FormResult[];
};

const emptyQuestion = (): BuilderQuestion => ({
  title: "",
  question_type: "single",
  required: true,
  options: ["", ""],
});

function statusLabel(status: FormStatus) {
  if (status === "open") return "Ouvert";
  if (status === "closed") return "Clôturé";
  return "Brouillon";
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("fr-BE");
}

function questionTypeLabel(type: QuestionType) {
  if (type === "single") return "Choix unique";
  if (type === "multiple") return "Choix multiple";
  if (type === "number") return "Nombre";
  return "Texte libre";
}

export default function AdminVotesManager() {
  const [forms, setForms] = useState<AdminForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [accessType, setAccessType] = useState<AccessType>("public");
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [initialStatus, setInitialStatus] = useState<"draft" | "open">("draft");
  const [questions, setQuestions] = useState<BuilderQuestion[]>([
    emptyQuestion(),
  ]);

  const openForms = useMemo(
    () => forms.filter((form) => form.status === "open").length,
    [forms],
  );

  const fetchForms = async () => {
    const res = await fetch("/api/admin/forms", { credentials: "include" });
    if (!res.ok) throw new Error("Impossible de charger les formulaires");
    const data = await res.json();
    setForms(data);
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setError("");
        const meRes = await fetch("/api/me", { credentials: "include" });
        if (!meRes.ok) {
          window.location.href =
            "/login?next=" + encodeURIComponent(window.location.pathname);
          return;
        }
        const me = await meRes.json();
        if (me.role !== "admin") {
          window.location.href = "/";
          return;
        }
        await fetchForms();
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Erreur lors du chargement",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const timer = window.setInterval(() => {
      fetchForms().catch(() => undefined);
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const updateQuestion = (
    index: number,
    patch: Partial<BuilderQuestion>,
  ) => {
    setQuestions((prev) =>
      prev.map((question, currentIndex) => {
        if (currentIndex !== index) return question;
        const next = { ...question, ...patch };
        if (
          patch.question_type &&
          (patch.question_type === "text" || patch.question_type === "number")
        ) {
          next.options = [];
        }
        if (
          patch.question_type &&
          (patch.question_type === "single" ||
            patch.question_type === "multiple") &&
          next.options.length < 2
        ) {
          next.options = ["", ""];
        }
        return next;
      }),
    );
  };

  const updateOption = (
    questionIndex: number,
    optionIndex: number,
    value: string,
  ) => {
    setQuestions((prev) =>
      prev.map((question, currentIndex) => {
        if (currentIndex !== questionIndex) return question;
        return {
          ...question,
          options: question.options.map((option, currentOptionIndex) =>
            currentOptionIndex === optionIndex ? value : option,
          ),
        };
      }),
    );
  };

  const addOption = (questionIndex: number) => {
    setQuestions((prev) =>
      prev.map((question, currentIndex) =>
        currentIndex === questionIndex
          ? { ...question, options: [...question.options, ""] }
          : question,
      ),
    );
  };

  const removeOption = (questionIndex: number, optionIndex: number) => {
    setQuestions((prev) =>
      prev.map((question, currentIndex) => {
        if (currentIndex !== questionIndex || question.options.length <= 2) {
          return question;
        }
        return {
          ...question,
          options: question.options.filter((_, index) => index !== optionIndex),
        };
      }),
    );
  };

  const createForm = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setSaving(true);

    const payload = {
      title,
      description,
      access_type: accessType,
      is_anonymous: isAnonymous,
      status: initialStatus,
      questions: questions.map((question) => ({
        title: question.title,
        question_type: question.question_type,
        required: question.required,
        options: question.options,
      })),
    };

    try {
      const res = await fetch("/api/admin/forms", {
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
      setDescription("");
      setAccessType("public");
      setIsAnonymous(true);
      setInitialStatus("draft");
      setQuestions([emptyQuestion()]);
      await fetchForms();
    } catch {
      setError("Erreur réseau lors de la création du formulaire");
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (formId: string, status: FormStatus) => {
    const res = await fetch(`/api/admin/forms/${formId}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ status }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || `Erreur ${res.status}`);
      return;
    }
    await fetchForms();
  };

  const deleteForm = async (formId: string) => {
    if (!confirm("Supprimer définitivement ce formulaire ?")) return;

    const res = await fetch(`/api/admin/forms/${formId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      alert("Impossible de supprimer le formulaire");
      return;
    }
    await fetchForms();
  };

  if (loading) return <p>Chargement...</p>;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(340px,0.9fr)_1.4fr]">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-blue-900">
              Créer un formulaire de vote
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {forms.length} formulaire{forms.length > 1 ? "s" : ""} dont{" "}
              {openForms} ouvert{openForms > 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {error ? (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <form onSubmit={createForm} className="space-y-4">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Titre
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Assemblée générale, sondage, vote..."
              className="rounded-lg border border-slate-300 px-3 py-2 font-normal"
              required
            />
          </label>

          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Description
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Contexte visible par les votants"
              className="min-h-20 rounded-lg border border-slate-300 px-3 py-2 font-normal"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Accès
              <select
                value={accessType}
                onChange={(event) =>
                  setAccessType(event.target.value as AccessType)
                }
                className="rounded-lg border border-slate-300 px-3 py-2 font-normal"
              >
                <option value="public">Public</option>
                <option value="code">Avec code</option>
              </select>
            </label>

            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Statut initial
              <select
                value={initialStatus}
                onChange={(event) =>
                  setInitialStatus(event.target.value as "draft" | "open")
                }
                className="rounded-lg border border-slate-300 px-3 py-2 font-normal"
              >
                <option value="draft">Brouillon</option>
                <option value="open">Ouvert</option>
              </select>
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={isAnonymous}
              onChange={(event) => setIsAnonymous(event.target.checked)}
              className="h-4 w-4"
            />
            Vote anonyme
          </label>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-slate-900">
                Questions
              </h3>
              <button
                type="button"
                onClick={() => setQuestions((prev) => [...prev, emptyQuestion()])}
                className="rounded-lg border border-blue-900 px-3 py-2 text-sm font-semibold text-blue-900 hover:bg-blue-50"
              >
                Ajouter une question
              </button>
            </div>

            {questions.map((question, questionIndex) => (
              <div
                key={questionIndex}
                className="rounded-lg border border-slate-200 bg-slate-50 p-3"
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-slate-800">
                    Question {questionIndex + 1}
                  </p>
                  {questions.length > 1 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setQuestions((prev) =>
                          prev.filter((_, index) => index !== questionIndex),
                        )
                      }
                      className="text-sm font-semibold text-red-700 hover:underline"
                    >
                      Supprimer
                    </button>
                  ) : null}
                </div>

                <label className="mb-3 grid gap-1 text-sm font-medium text-slate-700">
                  Intitulé
                  <input
                    value={question.title}
                    onChange={(event) =>
                      updateQuestion(questionIndex, { title: event.target.value })
                    }
                    placeholder="Votre question"
                    className="rounded-lg border border-slate-300 px-3 py-2 font-normal"
                    required
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Type
                    <select
                      value={question.question_type}
                      onChange={(event) =>
                        updateQuestion(questionIndex, {
                          question_type: event.target.value as QuestionType,
                        })
                      }
                      className="rounded-lg border border-slate-300 px-3 py-2 font-normal"
                    >
                      <option value="single">Choix unique</option>
                      <option value="multiple">Choix multiple</option>
                      <option value="text">Texte libre</option>
                      <option value="number">Nombre</option>
                    </select>
                  </label>

                  <label className="flex items-end gap-2 pb-2 text-sm font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={question.required}
                      onChange={(event) =>
                        updateQuestion(questionIndex, {
                          required: event.target.checked,
                        })
                      }
                      className="h-4 w-4"
                    />
                    Réponse obligatoire
                  </label>
                </div>

                {question.question_type === "single" ||
                question.question_type === "multiple" ? (
                  <div className="mt-3 space-y-2">
                    {question.options.map((option, optionIndex) => (
                      <div key={optionIndex} className="flex gap-2">
                        <input
                          value={option}
                          onChange={(event) =>
                            updateOption(
                              questionIndex,
                              optionIndex,
                              event.target.value,
                            )
                          }
                          placeholder={`Option ${optionIndex + 1}`}
                          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => removeOption(questionIndex, optionIndex)}
                          disabled={question.options.length <= 2}
                          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Retirer
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addOption(questionIndex)}
                      className="text-sm font-semibold text-blue-900 hover:underline"
                    >
                      Ajouter une option
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-blue-900 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:cursor-wait disabled:opacity-70"
          >
            {saving ? "Création..." : "Créer le formulaire"}
          </button>
        </form>
      </section>

      <section className="space-y-4">
        {forms.length ? (
          forms.map((form) => (
            <article
              key={form.id}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-blue-900">
                    {form.title}
                  </h2>
                  {form.description ? (
                    <p className="mt-1 text-sm text-slate-600">
                      {form.description}
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                      {statusLabel(form.status)}
                    </span>
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-900">
                      {form.is_anonymous ? "Anonyme" : "Nominatif"}
                    </span>
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-800">
                      {form.access_type === "code"
                        ? `Code ${form.code}`
                        : "Public"}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {form.status !== "open" && form.status !== "closed" ? (
                    <button
                      type="button"
                      onClick={() => updateStatus(form.id, "open")}
                      className="rounded-lg bg-blue-900 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800"
                    >
                      Ouvrir
                    </button>
                  ) : null}
                  {form.status !== "closed" ? (
                    <button
                      type="button"
                      onClick={() => updateStatus(form.id, "closed")}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                    >
                      Clôturer
                    </button>
                  ) : null}
                  {form.status !== "draft" && form.status !== "closed" ? (
                    <button
                      type="button"
                      onClick={() => updateStatus(form.id, "draft")}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                    >
                      Brouillon
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => deleteForm(form.id)}
                    className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                  >
                    Supprimer
                  </button>
                </div>
              </div>

              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
                <div className="rounded-lg bg-slate-50 p-3">
                  <dt className="text-slate-500">Réponses</dt>
                  <dd className="text-lg font-semibold text-slate-900">
                    {form.response_count}
                  </dd>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <dt className="text-slate-500">Dans la room</dt>
                  <dd className="text-lg font-semibold text-slate-900">
                    {form.active_count}
                  </dd>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <dt className="text-slate-500">Ouverture</dt>
                  <dd className="font-semibold text-slate-900">
                    {formatDate(form.opened_at)}
                  </dd>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <dt className="text-slate-500">Clôture</dt>
                  <dd className="font-semibold text-slate-900">
                    {formatDate(form.closed_at)}
                  </dd>
                </div>
              </dl>

              <div className="mt-4 space-y-3">
                {form.results.map((result) => (
                  <div
                    key={result.question_id}
                    className="rounded-lg border border-slate-200 p-3"
                  >
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-semibold text-slate-900">
                        {result.title}
                      </h3>
                      <span className="text-xs font-semibold uppercase text-slate-500">
                        {questionTypeLabel(result.question_type)}
                      </span>
                    </div>

                    {result.options ? (
                      <div className="space-y-2">
                        {result.options.map((option) => {
                          const percent = result.total_answers
                            ? Math.round((option.count / result.total_answers) * 100)
                            : 0;
                          return (
                            <div key={option.id}>
                              <div className="mb-1 flex justify-between gap-3 text-sm">
                                <span>{option.text}</span>
                                <span className="font-semibold">
                                  {option.count} ({percent}%)
                                </span>
                              </div>
                              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className="h-full bg-blue-900"
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}

                    {result.question_type === "number" ? (
                      <div className="grid gap-2 text-sm sm:grid-cols-4">
                        <p>Total : {result.total_answers}</p>
                        <p>
                          Moyenne :{" "}
                          {result.average === null ||
                          result.average === undefined
                            ? "-"
                            : result.average.toFixed(2)}
                        </p>
                        <p>Min : {result.min ?? "-"}</p>
                        <p>Max : {result.max ?? "-"}</p>
                      </div>
                    ) : null}

                    {result.answers ? (
                      <div className="space-y-2">
                        {result.answers.length ? (
                          result.answers.map((answer, index) => (
                            <p
                              key={`${result.question_id}-${index}`}
                              className="rounded-lg bg-slate-50 px-3 py-2 text-sm"
                            >
                              {answer.respondent ? (
                                <span className="font-semibold">
                                  {answer.respondent} :{" "}
                                </span>
                              ) : null}
                              {answer.text}
                            </p>
                          ))
                        ) : (
                          <p className="text-sm text-slate-500">
                            Aucune réponse.
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">
            Aucun formulaire créé.
          </div>
        )}
      </section>
    </div>
  );
}
