import os
import secrets

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'dada.db')
SECRET_KEY = os.environ.get('JWT_SECRET', secrets.token_hex(32))
JWT_EXPIRY_HOURS = 720  # 30 days

# SMTP email settings (defaults for QQ邮箱)
SMTP_HOST = os.environ.get('SMTP_HOST', 'smtp.qq.com')
SMTP_PORT = int(os.environ.get('SMTP_PORT', '587'))
SMTP_USER = os.environ.get('SMTP_USER', '')
SMTP_PASSWORD = os.environ.get('SMTP_PASSWORD', '')
SMTP_FROM = os.environ.get('SMTP_FROM', '')
