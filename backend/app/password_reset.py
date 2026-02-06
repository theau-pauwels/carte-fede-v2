from itsdangerous import URLSafeTimedSerializer
from flask import current_app


def _get_serializer():
    secret = current_app.config["SECRET_KEY"]
    return URLSafeTimedSerializer(secret, salt="password-reset")


def generate_reset_token(user):
    serializer = _get_serializer()
    payload = {"uid": user.id, "ph": user.password_hash}
    return serializer.dumps(payload)


def verify_reset_token(token: str, max_age: int):
    serializer = _get_serializer()
    return serializer.loads(token, max_age=max_age)
