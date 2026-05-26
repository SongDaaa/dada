import smtplib
import time
import random
import string
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from config import SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM

# In-memory code storage: { email: { code, expires_at, purpose, last_send } }
_pending_codes = {}

CODE_EXPIRY = 600       # 10 minutes
RATE_LIMIT = 60         # 60 seconds between sends
CODE_LENGTH = 6

def _clean_expired():
    now = time.time()
    expired = [e for e, v in _pending_codes.items() if v['expires_at'] < now]
    for e in expired:
        del _pending_codes[e]

def generate_code():
    return ''.join(random.choices(string.digits, k=CODE_LENGTH))

def can_send(email):
    _clean_expired()
    entry = _pending_codes.get(email)
    if entry and time.time() - entry.get('last_send', 0) < RATE_LIMIT:
        remaining = int(RATE_LIMIT - (time.time() - entry['last_send']))
        return False, remaining
    return True, 0

def store_code(email, code, purpose):
    _pending_codes[email] = {
        'code': code,
        'expires_at': time.time() + CODE_EXPIRY,
        'purpose': purpose,
        'last_send': time.time()
    }

def verify_code(email, code, purpose):
    _clean_expired()
    entry = _pending_codes.get(email)
    if not entry:
        return False
    if entry['code'] != code:
        return False
    if entry['purpose'] != purpose:
        return False
    # Code is valid — consume it
    del _pending_codes[email]
    return True

def send_verification_email(to_email, code, purpose):
    if purpose == 'register':
        subject = 'DADA 背单词 - 注册验证码'
        body_html = f'''
        <div style="max-width:480px;margin:0 auto;padding:24px;font-family:Arial,sans-serif;">
            <h2 style="color:#e07b5a;">DADA 背单词</h2>
            <p>你的注册验证码是：</p>
            <div style="font-size:32px;font-weight:bold;color:#e07b5a;padding:16px 24px;background:#fdf5f1;border-radius:10px;text-align:center;letter-spacing:6px;margin:16px 0;">{code}</div>
            <p style="color:#888;font-size:13px;">验证码 10 分钟内有效，请勿转发给他人。</p>
        </div>'''
    else:
        subject = 'DADA 背单词 - 密码重置验证码'
        body_html = f'''
        <div style="max-width:480px;margin:0 auto;padding:24px;font-family:Arial,sans-serif;">
            <h2 style="color:#e07b5a;">DADA 背单词</h2>
            <p>你的密码重置验证码是：</p>
            <div style="font-size:32px;font-weight:bold;color:#e07b5a;padding:16px 24px;background:#fdf5f1;border-radius:10px;text-align:center;letter-spacing:6px;margin:16px 0;">{code}</div>
            <p style="color:#888;font-size:13px;">验证码 10 分钟内有效。如果你未请求重置密码，请忽略此邮件。</p>
        </div>'''

    if SMTP_HOST and SMTP_USER and SMTP_PASSWORD:
        msg = MIMEMultipart()
        msg['From'] = SMTP_FROM or SMTP_USER
        msg['To'] = to_email
        msg['Subject'] = subject
        msg.attach(MIMEText(body_html, 'html', 'utf-8'))

        server = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10)
        server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.sendmail(msg['From'], to_email, msg.as_string())
        server.quit()
        return True
    else:
        # Dev mode: print to console
        print(f'[DEV EMAIL] To: {to_email}, Code: {code}, Purpose: {purpose}')
        return True
