from datetime import datetime
import secrets

from flask import Blueprint, jsonify, request

from .models import Room, VoteBallot, VoteOption, VoteSession, db


bp_rooms = Blueprint("rooms", __name__)


def _room_is_expired(room: Room) -> bool:
    return room.expires_at is not None and room.expires_at <= datetime.utcnow()


def _room_public_dict(room: Room):
    return {
        "id": room.id,
        "title": room.title,
        "code": room.code,
        "created_at": room.created_at.isoformat() if room.created_at else None,
        "expires_at": room.expires_at.isoformat() if room.expires_at else None,
    }


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


def _get_active_room_by_code(code: str):
    room = Room.query.filter_by(code=code.upper()).first()
    if not room:
        return None, (jsonify({"error": "Room introuvable"}), 404)
    if _room_is_expired(room):
        return None, (jsonify({"error": "Room expirée"}), 410)
    return room, None


@bp_rooms.route("/api/rooms/join", methods=["POST"])
def join_room():
    data = request.get_json() or {}
    code = str(data.get("code") or "").strip().upper()
    password = str(data.get("password") or "").strip()

    if not code or not password:
        return jsonify({"error": "Code et mot de passe requis"}), 400

    room, error = _get_active_room_by_code(code)
    if error:
        return error

    if room.password != password:
        return jsonify({"error": "Mot de passe invalide"}), 401

    session = VoteSession.query.filter_by(room_id=room.id, status="open").first()
    return jsonify(
        {
            "room": _room_public_dict(room),
            "active_vote": _session_to_dict(session) if session else None,
        }
    )


@bp_rooms.route("/api/rooms/<code>", methods=["GET"])
def get_room(code):
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


@bp_rooms.route("/api/rooms/<code>/vote/<session_id>/ballot", methods=["POST"])
def submit_ballot(code, session_id):
    room, error = _get_active_room_by_code(code)
    if error:
        return error

    session = VoteSession.query.filter_by(id=session_id, room_id=room.id).first()
    if not session:
        return jsonify({"error": "Vote introuvable"}), 404
    if session.status != "open":
        return jsonify({"error": "Vote fermé"}), 409

    data = request.get_json() or {}
    option_id = str(data.get("option_id") or "").strip()
    voter_token = str(data.get("voter_token") or "").strip() or secrets.token_urlsafe(24)

    if not option_id:
        return jsonify({"error": "option_id requis"}), 400

    option = VoteOption.query.filter_by(id=option_id, session_id=session.id).first()
    if not option:
        return jsonify({"error": "Option introuvable"}), 404

    existing = VoteBallot.query.filter_by(session_id=session.id, voter_token=voter_token).first()
    if existing:
        return jsonify({"error": "Vote déjà enregistré pour ce participant"}), 409

    ballot = VoteBallot(
        session_id=session.id,
        option_id=option.id,
        voter_token=voter_token,
    )
    db.session.add(ballot)
    db.session.commit()

    return jsonify({"ok": True, "voter_token": voter_token}), 201
