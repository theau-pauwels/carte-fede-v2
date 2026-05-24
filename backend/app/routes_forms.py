from datetime import datetime, timedelta
import hashlib

from flask import Blueprint, current_app, jsonify, request, session
from flask_login import current_user, login_required
from sqlalchemy.orm import joinedload

from .models import (
    db,
    Form,
    FormAnswer,
    FormOption,
    FormPresence,
    FormQuestion,
    FormResponse,
    Role,
)


bp_forms = Blueprint("forms", __name__)

QUESTION_TYPES = {"single", "multiple", "text", "number"}


def _is_admin():
    return current_user.is_authenticated and current_user.role == Role.ADMIN


def _voter_hash(form_id: str) -> str:
    secret = current_app.config.get("SECRET_KEY", "")
    raw = f"{form_id}:{current_user.id}:{secret}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _joined_form_ids():
    joined = session.get("joined_form_ids")
    if not isinstance(joined, list):
        joined = []
    return set(str(item) for item in joined)


def _remember_joined_form(form_id: str):
    joined = _joined_form_ids()
    joined.add(form_id)
    session["joined_form_ids"] = sorted(joined)


def _question_to_dict(question: FormQuestion):
    options = sorted(question.options or [], key=lambda option: option.position)
    return {
        "id": question.id,
        "title": question.title,
        "question_type": question.question_type,
        "required": question.required,
        "position": question.position,
        "options": [
            {"id": option.id, "text": option.text, "position": option.position}
            for option in options
        ],
    }


def _form_public_dict(form: Form, include_code=False):
    data = {
        "id": form.id,
        "title": form.title,
        "description": form.description or "",
        "access_type": form.access_type,
        "status": form.status,
        "is_anonymous": form.is_anonymous,
        "created_at": form.created_at.isoformat() if form.created_at else None,
        "opened_at": form.opened_at.isoformat() if form.opened_at else None,
        "closed_at": form.closed_at.isoformat() if form.closed_at else None,
        "questions": [
            _question_to_dict(question)
            for question in sorted(form.questions or [], key=lambda item: item.position)
        ],
    }
    if include_code:
        data["code"] = form.code
    return data


def _active_count(form_id: str) -> int:
    threshold = datetime.utcnow() - timedelta(seconds=45)
    return FormPresence.query.filter(
        FormPresence.form_id == form_id,
        FormPresence.last_seen_at >= threshold,
    ).count()


def _has_responded(form: Form) -> bool:
    if form.is_anonymous:
        return (
            FormResponse.query.filter_by(
                form_id=form.id,
                voter_hash=_voter_hash(form.id),
            ).first()
            is not None
        )
    return (
        FormResponse.query.filter_by(form_id=form.id, user_id=current_user.id).first()
        is not None
    )


def _form_can_be_seen(form: Form) -> bool:
    if form.status != "open":
        return False
    if form.access_type == "public":
        return True
    return form.id in _joined_form_ids()


def _form_voter_dict(form: Form):
    data = _form_public_dict(form)
    data["has_responded"] = _has_responded(form)
    data["active_count"] = _active_count(form.id)
    return data


def _result_for_question(question: FormQuestion, responses_by_id):
    answers = FormAnswer.query.filter_by(question_id=question.id).all()
    if question.question_type in ("single", "multiple"):
        option_counts = {option.id: 0 for option in question.options or []}
        total = 0
        for answer in answers:
            if answer.option_id in option_counts:
                option_counts[answer.option_id] += 1
                total += 1
        return {
            "question_id": question.id,
            "question_type": question.question_type,
            "title": question.title,
            "total_answers": total,
            "options": [
                {
                    "id": option.id,
                    "text": option.text,
                    "count": option_counts.get(option.id, 0),
                }
                for option in sorted(question.options or [], key=lambda item: item.position)
            ],
        }

    if question.question_type == "number":
        values = [answer.number_value for answer in answers if answer.number_value is not None]
        return {
            "question_id": question.id,
            "question_type": question.question_type,
            "title": question.title,
            "total_answers": len(values),
            "average": sum(values) / len(values) if values else None,
            "min": min(values) if values else None,
            "max": max(values) if values else None,
            "values": values,
        }

    text_answers = []
    for answer in answers:
        response = responses_by_id.get(answer.response_id)
        text_answers.append(
            {
                "text": answer.text_value or "",
                "respondent": _respondent_label(response),
            }
        )
    return {
        "question_id": question.id,
        "question_type": question.question_type,
        "title": question.title,
        "total_answers": len(text_answers),
        "answers": text_answers,
    }


def _respondent_label(response: FormResponse | None):
    if not response or not response.user:
        return None
    user = response.user
    identifiant = user.member_id or user.email or ""
    full_name = f"{user.prenom or ''} {user.nom or ''}".strip()
    return f"{full_name} ({identifiant})" if full_name else identifiant


def _form_admin_dict(form: Form, include_results=True):
    data = _form_public_dict(form, include_code=True)
    responses = FormResponse.query.options(joinedload(FormResponse.user)).filter_by(form_id=form.id).all()
    responses_by_id = {response.id: response for response in responses}
    data["response_count"] = len(responses)
    data["active_count"] = _active_count(form.id)

    if include_results:
      data["results"] = [
          _result_for_question(question, responses_by_id)
          for question in sorted(form.questions or [], key=lambda item: item.position)
      ]
      if not form.is_anonymous:
          data["responses"] = [
              {
                  "id": response.id,
                  "created_at": response.created_at.isoformat() if response.created_at else None,
                  "respondent": _respondent_label(response),
              }
              for response in responses
          ]
    return data


def _generate_form_code():
    for _ in range(20):
        code = Form.generate_code(6)
        if not Form.query.filter_by(code=code).first():
            return code
    return None


def _validate_questions(raw_questions):
    if not isinstance(raw_questions, list) or not raw_questions:
        raise ValueError("Ajoute au moins une question.")

    questions = []
    for index, raw in enumerate(raw_questions):
        title = str(raw.get("title") or "").strip()
        question_type = str(raw.get("question_type") or "").strip()
        required = bool(raw.get("required", True))
        raw_options = raw.get("options") or []

        if not title:
            raise ValueError("Chaque question doit avoir un titre.")
        if question_type not in QUESTION_TYPES:
            raise ValueError("Type de question invalide.")

        options = []
        if question_type in ("single", "multiple"):
            if not isinstance(raw_options, list):
                raise ValueError("Les options doivent être une liste.")
            options = [str(item).strip() for item in raw_options if str(item).strip()]
            if len(options) < 2:
                raise ValueError("Les questions à choix doivent avoir au moins 2 options.")

        questions.append(
            {
                "title": title,
                "question_type": question_type,
                "required": required,
                "options": options,
                "position": index,
            }
        )
    return questions


@bp_forms.route("/api/admin/forms", methods=["GET", "POST"])
@login_required
def admin_forms_collection():
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403

    if request.method == "POST":
        data = request.get_json() or {}
        title = str(data.get("title") or "").strip()
        description = str(data.get("description") or "").strip()
        access_type = str(data.get("access_type") or "public").strip()
        status = str(data.get("status") or "draft").strip()
        is_anonymous = bool(data.get("is_anonymous", True))

        if not title:
            return jsonify({"error": "Titre requis"}), 400
        if access_type not in ("public", "code"):
            return jsonify({"error": "Type d'accès invalide"}), 400
        if status not in ("draft", "open"):
            return jsonify({"error": "Statut invalide"}), 400

        try:
            questions = _validate_questions(data.get("questions") or [])
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

        code = _generate_form_code()
        if not code:
            return jsonify({"error": "Impossible de générer un code"}), 500

        now = datetime.utcnow()
        form = Form(
            title=title,
            description=description,
            code=code,
            access_type=access_type,
            status=status,
            is_anonymous=is_anonymous,
            opened_at=now if status == "open" else None,
            created_by=current_user.id,
        )
        db.session.add(form)
        db.session.flush()

        for question_data in questions:
            question = FormQuestion(
                form_id=form.id,
                title=question_data["title"],
                question_type=question_data["question_type"],
                required=question_data["required"],
                position=question_data["position"],
            )
            db.session.add(question)
            db.session.flush()

            for option_index, option_text in enumerate(question_data["options"]):
                db.session.add(
                    FormOption(
                        question_id=question.id,
                        text=option_text,
                        position=option_index,
                    )
                )

        db.session.commit()
        return jsonify(_form_admin_dict(form)), 201

    forms = (
        Form.query.options(joinedload(Form.questions).joinedload(FormQuestion.options))
        .order_by(Form.created_at.desc())
        .all()
    )
    return jsonify([_form_admin_dict(form) for form in forms])


@bp_forms.route("/api/admin/forms/<form_id>/status", methods=["PUT"])
@login_required
def admin_update_form_status(form_id):
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403

    form = Form.query.get(form_id)
    if not form:
        return jsonify({"error": "Formulaire introuvable"}), 404

    status = str((request.get_json() or {}).get("status") or "").strip()
    if status not in ("draft", "open", "closed"):
        return jsonify({"error": "Statut invalide"}), 400
    if form.status == "closed" and status != "closed":
        return jsonify({"error": "Un formulaire clôturé ne peut pas être rouvert"}), 409

    form.status = status
    if status == "open" and not form.opened_at:
        form.opened_at = datetime.utcnow()
    if status == "closed":
        form.closed_at = datetime.utcnow()
        if form.is_anonymous:
            FormResponse.query.filter_by(form_id=form.id).update({"voter_hash": None})

    db.session.commit()
    return jsonify(_form_admin_dict(form))


@bp_forms.route("/api/admin/forms/<form_id>", methods=["DELETE"])
@login_required
def admin_delete_form(form_id):
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403

    form = Form.query.get(form_id)
    if not form:
        return jsonify({"error": "Formulaire introuvable"}), 404
    db.session.delete(form)
    db.session.commit()
    return jsonify({"ok": True})


@bp_forms.route("/api/forms", methods=["GET"])
@login_required
def list_forms():
    forms = (
        Form.query.options(joinedload(Form.questions).joinedload(FormQuestion.options))
        .filter_by(status="open", access_type="public")
        .order_by(Form.opened_at.desc(), Form.created_at.desc())
        .all()
    )
    return jsonify([_form_voter_dict(form) for form in forms])


@bp_forms.route("/api/forms/join", methods=["POST"])
@login_required
def join_form():
    code = str((request.get_json() or {}).get("code") or "").strip().upper()
    if not code:
        return jsonify({"error": "Code requis"}), 400

    form = (
        Form.query.options(joinedload(Form.questions).joinedload(FormQuestion.options))
        .filter_by(code=code)
        .first()
    )
    if not form:
        return jsonify({"error": "Formulaire introuvable"}), 404
    if form.status != "open":
        return jsonify({"error": "Formulaire fermé"}), 409

    _remember_joined_form(form.id)
    return jsonify(_form_voter_dict(form))


@bp_forms.route("/api/forms/<form_id>", methods=["GET"])
@login_required
def get_form(form_id):
    form = (
        Form.query.options(joinedload(Form.questions).joinedload(FormQuestion.options))
        .filter_by(id=form_id)
        .first()
    )
    if not form:
        return jsonify({"error": "Formulaire introuvable"}), 404
    if not _form_can_be_seen(form):
        return jsonify({"error": "Accès refusé"}), 403
    return jsonify(_form_voter_dict(form))


@bp_forms.route("/api/forms/<form_id>/presence", methods=["POST"])
@login_required
def update_presence(form_id):
    form = Form.query.get(form_id)
    if not form:
        return jsonify({"error": "Formulaire introuvable"}), 404
    if not _form_can_be_seen(form):
        return jsonify({"error": "Accès refusé"}), 403

    presence = FormPresence.query.filter_by(form_id=form.id, user_id=current_user.id).first()
    if presence:
        presence.last_seen_at = datetime.utcnow()
    else:
        db.session.add(FormPresence(form_id=form.id, user_id=current_user.id))
    db.session.commit()
    return jsonify({"active_count": _active_count(form.id)})


@bp_forms.route("/api/forms/<form_id>/responses", methods=["POST"])
@login_required
def submit_form_response(form_id):
    form = (
        Form.query.options(joinedload(Form.questions).joinedload(FormQuestion.options))
        .filter_by(id=form_id)
        .first()
    )
    if not form:
        return jsonify({"error": "Formulaire introuvable"}), 404
    if not _form_can_be_seen(form):
        return jsonify({"error": "Accès refusé"}), 403
    if _has_responded(form):
        return jsonify({"error": "Réponse déjà enregistrée"}), 409

    payload_answers = (request.get_json() or {}).get("answers") or {}
    if not isinstance(payload_answers, dict):
        return jsonify({"error": "Réponses invalides"}), 400

    response = FormResponse(
        form_id=form.id,
        user_id=None if form.is_anonymous else current_user.id,
        voter_hash=_voter_hash(form.id) if form.is_anonymous else None,
    )
    db.session.add(response)
    db.session.flush()

    for question in sorted(form.questions or [], key=lambda item: item.position):
        raw_value = payload_answers.get(question.id)

        if question.required:
            empty = raw_value is None or raw_value == "" or raw_value == []
            if empty:
                db.session.rollback()
                return jsonify({"error": f"Question obligatoire : {question.title}"}), 400

        if raw_value is None or raw_value == "" or raw_value == []:
            continue

        option_ids = {option.id for option in question.options or []}
        if question.question_type == "single":
            option_id = str(raw_value)
            if option_id not in option_ids:
                db.session.rollback()
                return jsonify({"error": "Option invalide"}), 400
            db.session.add(FormAnswer(response_id=response.id, question_id=question.id, option_id=option_id))
        elif question.question_type == "multiple":
            if not isinstance(raw_value, list):
                db.session.rollback()
                return jsonify({"error": "Réponse multiple invalide"}), 400
            for option_id in [str(item) for item in raw_value]:
                if option_id not in option_ids:
                    db.session.rollback()
                    return jsonify({"error": "Option invalide"}), 400
                db.session.add(FormAnswer(response_id=response.id, question_id=question.id, option_id=option_id))
        elif question.question_type == "number":
            try:
                number_value = float(raw_value)
            except Exception:
                db.session.rollback()
                return jsonify({"error": "Nombre invalide"}), 400
            db.session.add(FormAnswer(response_id=response.id, question_id=question.id, number_value=number_value))
        else:
            db.session.add(
                FormAnswer(
                    response_id=response.id,
                    question_id=question.id,
                    text_value=str(raw_value).strip(),
                )
            )

    db.session.commit()
    return jsonify({"ok": True}), 201
