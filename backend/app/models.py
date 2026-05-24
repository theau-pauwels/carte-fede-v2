from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from datetime import datetime
from enum import Enum
from sqlalchemy.orm import relationship
import uuid
import secrets

db = SQLAlchemy()

class Role(Enum):
    MEMBER = "member"
    ADMIN  = "admin"
    VERIFIER = "verifier"
    ATTENTE = "en attente"
    

class User(UserMixin, db.Model):
    __tablename__ = "user"
    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    nom = db.Column(db.String, nullable=False)
    prenom = db.Column(db.String, nullable=False)

    # Identifiant au choix : id 6 chiffres OU email (au moins l'un des deux)
    member_id = db.Column(db.String(6), unique=True, nullable=True)  # 6 chiffres
    email = db.Column(db.String, unique=True, nullable=True)

    password_hash = db.Column(db.String, nullable=False)
    role = db.Column(db.Enum(Role, name="role_enum"), default=Role.MEMBER, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    memberships = relationship("Membership", backref="user", cascade="all, delete-orphan")

    __table_args__ = (
        db.CheckConstraint("(member_id IS NOT NULL) OR (email IS NOT NULL)", name="user_id_or_email_required"),
        db.CheckConstraint("(member_id ~ '^[0-9]{6}$') OR (member_id IS NULL)", name="member_id_six_digits"),
    )

class Membership(db.Model):
    __tablename__ = "membership"
    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(db.String, db.ForeignKey("user.id", ondelete="CASCADE"), nullable=False)
    annee = db.Column(db.Integer, nullable=False)       # année de début (2025 => 2025-2026)
    annee_code = db.Column(db.String, nullable=False)   # ex: EA-23

    __table_args__ = (
        db.UniqueConstraint("user_id", "annee", name="uq_user_annee"),        # 1 carte max par user et par année
        db.UniqueConstraint("annee", "annee_code", name="uq_annee_code_year") # code unique dans une même année
    )

class Room(db.Model):
    __tablename__ = "room"
    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title = db.Column(db.String, nullable=False)
    code = db.Column(db.String(12), unique=True, nullable=False, index=True)
    password = db.Column(db.String, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    expires_at = db.Column(db.DateTime, nullable=True)
    created_by = db.Column(db.String, db.ForeignKey("user.id", ondelete="SET NULL"), nullable=True)
    allowed_members = relationship("RoomAllowedMember", backref="room", cascade="all, delete-orphan")

    @staticmethod
    def generate_code(length=6):
        alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        return "".join(secrets.choice(alphabet) for _ in range(length))

    @staticmethod
    def generate_password(length=10):
        alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        return "".join(secrets.choice(alphabet) for _ in range(length))

class VoteSession(db.Model):
    __tablename__ = "vote_session"
    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    room_id = db.Column(db.String, db.ForeignKey("room.id", ondelete="CASCADE"), nullable=False, index=True)
    question = db.Column(db.String, nullable=False)
    status = db.Column(db.String, nullable=False, default="open")  # open | closed
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    closed_at = db.Column(db.DateTime, nullable=True)

    options = relationship("VoteOption", backref="session", cascade="all, delete-orphan")

class VoteOption(db.Model):
    __tablename__ = "vote_option"
    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = db.Column(db.String, db.ForeignKey("vote_session.id", ondelete="CASCADE"), nullable=False, index=True)
    text = db.Column(db.String, nullable=False)

class VoteBallot(db.Model):
    __tablename__ = "vote_ballot"
    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = db.Column(db.String, db.ForeignKey("vote_session.id", ondelete="CASCADE"), nullable=False, index=True)
    option_id = db.Column(db.String, db.ForeignKey("vote_option.id", ondelete="CASCADE"), nullable=False, index=True)
    voter_token = db.Column(db.String, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        db.UniqueConstraint("session_id", "voter_token", name="uq_vote_once_per_session"),
    )


class RoomAllowedMember(db.Model):
    __tablename__ = "room_allowed_member"
    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    room_id = db.Column(db.String, db.ForeignKey("room.id", ondelete="CASCADE"), nullable=False, index=True)
    member_id = db.Column(db.String(6), nullable=False, index=True)

    __table_args__ = (
        db.UniqueConstraint("room_id", "member_id", name="uq_room_allowed_member"),
        db.CheckConstraint("member_id ~ '^[0-9]{6}$'", name="room_allowed_member_id_six_digits"),
    )


class Form(db.Model):
    __tablename__ = "form"
    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title = db.Column(db.String, nullable=False)
    description = db.Column(db.Text, nullable=True)
    code = db.Column(db.String(12), unique=True, nullable=False, index=True)
    access_type = db.Column(db.String, nullable=False, default="public")  # public | code
    status = db.Column(db.String, nullable=False, default="draft")  # draft | open | closed
    is_anonymous = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    opened_at = db.Column(db.DateTime, nullable=True)
    closed_at = db.Column(db.DateTime, nullable=True)
    created_by = db.Column(db.String, db.ForeignKey("user.id", ondelete="SET NULL"), nullable=True)

    questions = relationship("FormQuestion", backref="form", cascade="all, delete-orphan")
    responses = relationship("FormResponse", backref="form", cascade="all, delete-orphan")

    @staticmethod
    def generate_code(length=6):
        alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        return "".join(secrets.choice(alphabet) for _ in range(length))


class FormQuestion(db.Model):
    __tablename__ = "form_question"
    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    form_id = db.Column(db.String, db.ForeignKey("form.id", ondelete="CASCADE"), nullable=False, index=True)
    title = db.Column(db.String, nullable=False)
    question_type = db.Column(db.String, nullable=False)  # single | multiple | text | number
    required = db.Column(db.Boolean, nullable=False, default=True)
    position = db.Column(db.Integer, nullable=False, default=0)

    options = relationship("FormOption", backref="question", cascade="all, delete-orphan")


class FormOption(db.Model):
    __tablename__ = "form_option"
    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    question_id = db.Column(db.String, db.ForeignKey("form_question.id", ondelete="CASCADE"), nullable=False, index=True)
    text = db.Column(db.String, nullable=False)
    position = db.Column(db.Integer, nullable=False, default=0)


class FormResponse(db.Model):
    __tablename__ = "form_response"
    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    form_id = db.Column(db.String, db.ForeignKey("form.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = db.Column(db.String, db.ForeignKey("user.id", ondelete="SET NULL"), nullable=True, index=True)
    voter_hash = db.Column(db.String, nullable=True, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User")
    answers = relationship("FormAnswer", backref="response", cascade="all, delete-orphan")


class FormAnswer(db.Model):
    __tablename__ = "form_answer"
    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    response_id = db.Column(db.String, db.ForeignKey("form_response.id", ondelete="CASCADE"), nullable=False, index=True)
    question_id = db.Column(db.String, db.ForeignKey("form_question.id", ondelete="CASCADE"), nullable=False, index=True)
    option_id = db.Column(db.String, db.ForeignKey("form_option.id", ondelete="CASCADE"), nullable=True, index=True)
    text_value = db.Column(db.Text, nullable=True)
    number_value = db.Column(db.Float, nullable=True)

    question = relationship("FormQuestion")
    option = relationship("FormOption")


class FormPresence(db.Model):
    __tablename__ = "form_presence"
    id = db.Column(db.String, primary_key=True, default=lambda: str(uuid.uuid4()))
    form_id = db.Column(db.String, db.ForeignKey("form.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = db.Column(db.String, db.ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True)
    last_seen_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        db.UniqueConstraint("form_id", "user_id", name="uq_form_presence_user"),
    )
