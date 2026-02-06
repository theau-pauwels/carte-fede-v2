import os
from flask import Flask, jsonify
from flask_login import LoginManager, current_user
from .models import db, User
from .routes_auth import bp_auth
from .routes_admin import bp_admin
from .routes_memberships import bp_mem
from .routes_rooms import bp_rooms
from werkzeug.middleware.proxy_fix import ProxyFix

def create_app():
    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = "postgresql://postgres:postgres@db:5432/membres"
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "changeme")
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {"pool_pre_ping": True}
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
    app.config["SESSION_COOKIE_SECURE"] = True
    app.config["SESSION_COOKIE_HTTPONLY"] = True
    app.config["MAIL_ADDRESS"] = os.getenv("MAIL_ADDRESS", "")
    app.config["MAIL_PASSWORD"] = os.getenv("MAIL_PASSWORD", "")
    app.config["MAIL_FROM_NAME"] = os.getenv("MAIL_FROM_NAME", "Commission Web FPMs")
    app.config["SMTP_HOST"] = os.getenv("SMTP_HOST", "smtp.gmail.com")
    app.config["SMTP_PORT"] = int(os.getenv("SMTP_PORT", "587"))
    app.config["SMTP_USE_TLS"] = os.getenv("SMTP_USE_TLS", "true")
    app.config["SMTP_USE_SSL"] = os.getenv("SMTP_USE_SSL", "false")
    app.config["FRONTEND_BASE_URL"] = os.getenv("FRONTEND_BASE_URL", "")
    app.config["PASSWORD_RESET_TOKEN_MAX_AGE"] = int(
        os.getenv("PASSWORD_RESET_TOKEN_MAX_AGE", "3600")
    )

    db.init_app(app)
    login_manager = LoginManager()
    login_manager.init_app(app)

    @login_manager.unauthorized_handler
    def unauthorized():
        # Make APIs return 401 JSON instead of flashing a page then redirecting
        return jsonify({"error": "unauthorized"}), 401

    app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)

    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(user_id)

    @app.get("/api/health")
    def health():
        return {"ok": True}

    app.register_blueprint(bp_auth)
    app.register_blueprint(bp_admin)
    app.register_blueprint(bp_mem)
    app.register_blueprint(bp_rooms)

    # Auto-create tables if missing (no migrations in this project)
    with app.app_context():
        db.create_all()

    return app
