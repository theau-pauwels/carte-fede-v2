import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import create_app
from app.models import db, User, Role
from werkzeug.security import generate_password_hash

app = create_app()
with app.app_context():
    db.create_all()  # ok à l'init
    email = "admin@example.com"
    password = "monpass"
    user = User.query.filter_by(email=email.lower()).first()
    if user:
        user.password_hash = generate_password_hash(password)
        user.role = Role.ADMIN
        db.session.commit()
        print("Admin déjà existant, mot de passe réinitialisé:", email, "/", password)
    else:
        u = User(
            email=email.lower(),
            prenom="Admin",
            nom="Root",
            password_hash=generate_password_hash(password),
            role=Role.ADMIN
        )
        db.session.add(u)
        db.session.commit()
        print("Admin créé:", email, "/", password)
