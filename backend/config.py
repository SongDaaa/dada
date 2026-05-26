import os
import secrets

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'dada.db')
SECRET_KEY = os.environ.get('JWT_SECRET', secrets.token_hex(32))
JWT_EXPIRY_HOURS = 720  # 30 days
