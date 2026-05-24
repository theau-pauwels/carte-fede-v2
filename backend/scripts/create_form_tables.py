from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import create_app
from app.models import db


app = create_app()

with app.app_context():
    db.create_all()
    print("Tables de formulaires créées ou déjà présentes.")
