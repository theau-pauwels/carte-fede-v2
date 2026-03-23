from datetime import datetime

from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from .models import Room, VoteBallot, VoteOption, VoteSession, db


bp_rooms = Blueprint("rooms", __name__)


def _room_is_expired(room: Room) -> bool:
    return room.expires_at is not None and room.expires_at <= datetime.utcnow()


def _session_to_dict(session: VoteSession):
    return {
        "id": session.id,
        "room_id": session.room_id,
        "question": session.question,
        "status": session.status,
        "created_at": session.created_at.isoformat() if session.created_at else None,
        "closed_at": session.closed_at.isoformat() if session.closed_at else None,
        "options": [{"id": option.id, "text": option.text} for option in (session.options or [])],
    }


def _room_public_dict(room: Room):
    allowed_member_ids = sorted({row.member_id for row in (room.allowed_members or [])})
    return {
        "id": room.id,
        "title": room.title,
        "code": room.code,
        "created_at": room.created_at.isoformat() if room.created_at else None,
        "expires_at": room.expires_at.isoformat() if room.expires_at else None,
        "access_type": "restricted" if allowed_member_ids else "public",
    }


def _can_access_room(room: Room) -> bool:
    if not current_user.is_authenticated:
        return False

    allowed_member_ids = {row.member_id for row in (room.allowed_members or [])}
    if not allowed_member_ids:
        return True

    current_member_id = (getattr(current_user, "member_id", None) or "").strip()
    return current_member_id in allowed_member_ids


def _get_active_room_by_id(room_id: str):
    room = Room.query.filter_by(id=room_id).first()
    if not room:
        return None, (jsonify({"error": "Room introuvable"}), 404)
    if _room_is_expired(room):
        return None, (jsonify({"error": "Room expirée"}), 410)
    if not _can_access_room(room):
        return None, (jsonify({"error": "Accès refusé"}), 403)
    return room, None


def _get_active_room_by_code(code: str):
    room = Room.query.filter_by(code=code.upper()).first()
    if not room:
        return None, (jsonify({"error": "Room introuvable"}), 404)
    if _room_is_expired(room):
        return None, (jsonify({"error": "Room expirée"}), 410)
    if not _can_access_room(room):
        return None, (jsonify({"error": "Accès refusé"}), 403)
    return room, None


@bp_rooms.route("/api/rooms", methods=["GET"])
@login_required
def list_rooms():
    rooms = Room.query.all()
    result = []
    for room in rooms:
        if _room_is_expired(room):
            continue
        if not _can_access_room(room):
            continue
        session = VoteSession.query.filter_by(room_id=room.id, status="open").first()
        result.append(
            {
                "room": _room_public_dict(room),
                "active_vote": _session_to_dict(session) if session else None,
            }
        )

    result.sort(key=lambda item: item["room"]["created_at"] or "", reverse=True)
    return jsonify(result)


@bp_rooms.route("/api/rooms/join", methods=["POST"])
@login_required
def join_room():
    data = request.get_json() or {}
    code = str(data.get("code") or "").strip().upper()

    if not code:
        return jsonify({"error": "Code requis"}), 400

    room, error = _get_active_room_by_code(code)
    if error:
        return error

    session = VoteSession.query.filter_by(room_id=room.id, status="open").first()
    return jsonify(
        {
            "room": _room_public_dict(room),
            "active_vote": _session_to_dict(session) if session else None,
        }
    )


@bp_rooms.route("/api/rooms/<room_id>", methods=["GET"])
@login_required
def get_room(room_id):
    room, error = _get_active_room_by_id(room_id)
    if error:
        return error

    session = VoteSession.query.filter_by(room_id=room.id, status="open").first()
    return jsonify(
        {
            "room": _room_public_dict(room),
            "active_vote": _session_to_dict(session) if session else None,
        }
    )


@bp_rooms.route("/api/rooms/<room_id>/vote/<session_id>/ballot", methods=["POST"])
@login_required
def submit_ballot(room_id, session_id):
    room, error = _get_active_room_by_id(room_id)
    if error:
        return error

    session = VoteSession.query.filter_by(id=session_id, room_id=room.id).first()
    if not session:
        return jsonify({"error": "Vote introuvable"}), 404
    if session.status != "open":
        return jsonify({"error": "Vote fermé"}), 409

    data = request.get_json() or {}
    option_id = str(data.get("option_id") or "").strip()

    if not option_id:
        return jsonify({"error": "option_id requis"}), 400

    option = VoteOption.query.filter_by(id=option_id, session_id=session.id).first()
    if not option:
        return jsonify({"error": "Option introuvable"}), 404

    voter_token = str(current_user.id)
    existing = VoteBallot.query.filter_by(session_id=session.id, voter_token=voter_token).first()
    if existing:
        return jsonify({"error": "Vote déjà enregistré pour cet utilisateur"}), 409

    ballot = VoteBallot(
        session_id=session.id,
        option_id=option.id,
        voter_token=voter_token,
    )
    db.session.add(ballot)
    db.session.commit()

    return jsonify({"ok": True}), 201
