from flask import Blueprint, request, jsonify
from config import SECRET_KEY, JWT_EXPIRY_HOURS
from models import create_user, get_user_by_username, get_user_by_id, get_user_by_email, update_user_password, is_admin, set_admin, get_all_users_stats
from email_service import generate_code, send_verification_email, store_code, verify_code, can_send
import jwt, bcrypt, datetime, re

auth_bp = Blueprint('auth', __name__)

def make_token(user_id):
    exp = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=JWT_EXPIRY_HOURS)
    return jwt.encode({'user_id': user_id, 'exp': exp}, SECRET_KEY, algorithm='HS256')

def require_auth(f):
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        header = request.headers.get('Authorization', '')
        if not header.startswith('Bearer '):
            return jsonify({'error': 'Missing token'}), 401
        try:
            payload = jwt.decode(header[7:], SECRET_KEY, algorithms=['HS256'])
            request.user_id = payload['user_id']
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token'}), 401
        return f(*args, **kwargs)
    return decorated

def is_valid_email(email):
    return re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', email)

@auth_bp.route('/api/auth/send-code', methods=['POST'])
def send_code():
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    purpose = data.get('purpose', 'register')

    if not is_valid_email(email):
        return jsonify({'error': '邮箱格式不正确'}), 400
    if purpose not in ('register', 'reset'):
        return jsonify({'error': 'Invalid purpose'}), 400

    # For registration, check email not already in use
    if purpose == 'register':
        existing = get_user_by_email(email)
        if existing:
            return jsonify({'error': '该邮箱已被注册'}), 409

    # For password reset, check email exists
    if purpose == 'reset':
        existing = get_user_by_email(email)
        if not existing:
            return jsonify({'error': '该邮箱未注册'}), 404

    ok, remaining = can_send(email)
    if not ok:
        return jsonify({'error': f'请 {remaining} 秒后再试'}), 429

    code = generate_code()
    store_code(email, code, purpose)

    try:
        send_verification_email(email, code, purpose)
    except Exception as e:
        return jsonify({'error': f'邮件发送失败: {str(e)}'}), 500

    return jsonify({'ok': True, 'message': '验证码已发送'})

@auth_bp.route('/api/auth/register', methods=['POST'])
def register():
    data = request.get_json(silent=True) or {}
    username = (data.get('username') or '').strip()
    password = (data.get('password') or '').strip()
    email = (data.get('email') or '').strip().lower()
    code = (data.get('code') or '').strip()

    if not username or not password:
        return jsonify({'error': '用户名和密码不能为空'}), 400
    if not email or not code:
        return jsonify({'error': '邮箱和验证码不能为空'}), 400
    if not is_valid_email(email):
        return jsonify({'error': '邮箱格式不正确'}), 400
    if len(username) < 2 or len(username) > 32:
        return jsonify({'error': '用户名长度2-32个字符'}), 400
    if len(password) < 4:
        return jsonify({'error': '密码至少4个字符'}), 400

    if not verify_code(email, code, 'register'):
        return jsonify({'error': '验证码错误或已过期'}), 400

    # Check email uniqueness
    if get_user_by_email(email):
        return jsonify({'error': '该邮箱已被注册'}), 409

    pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    user = create_user(username, pw_hash, email)
    if user is None:
        return jsonify({'error': '用户名已存在'}), 409

    # First user is admin
    if user['id'] == 1:
        set_admin(username)

    token = make_token(user['id'])
    return jsonify({'token': token, 'user': {'id': user['id'], 'username': user['username'], 'email': user['email'], 'is_admin': bool(user['is_admin'])}})

@auth_bp.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get('username') or '').strip()
    password = (data.get('password') or '').strip()
    if not username or not password:
        return jsonify({'error': '用户名和密码不能为空'}), 400
    user = get_user_by_username(username)
    if user is None or not bcrypt.checkpw(password.encode(), user['password_hash'].encode()):
        return jsonify({'error': '用户名或密码错误'}), 401
    token = make_token(user['id'])
    return jsonify({'token': token, 'user': {'id': user['id'], 'username': user['username'], 'email': user['email'], 'is_admin': bool(user['is_admin'])}})

@auth_bp.route('/api/auth/me', methods=['GET'])
@require_auth
def me():
    user = get_user_by_id(request.user_id)
    if user is None:
        return jsonify({'error': 'User not found'}), 404
    return jsonify({'user': {'id': user['id'], 'username': user['username'], 'email': user['email'], 'is_admin': bool(user['is_admin'])}})

@auth_bp.route('/api/auth/forgot-password', methods=['POST'])
def forgot_password():
    """Send a password reset code to the email."""
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    code = (data.get('code') or '').strip()
    new_password = (data.get('newPassword') or '').strip()

    if not email or not code or not new_password:
        return jsonify({'error': '邮箱、验证码和新密码不能为空'}), 400
    if len(new_password) < 4:
        return jsonify({'error': '密码至少4个字符'}), 400

    if not verify_code(email, code, 'reset'):
        return jsonify({'error': '验证码错误或已过期'}), 400

    user = get_user_by_email(email)
    if not user:
        return jsonify({'error': '该邮箱未注册'}), 404

    pw_hash = bcrypt.hashpw(new_password.encode(), bcrypt.gensalt()).decode()
    update_user_password(user['id'], pw_hash)

    return jsonify({'ok': True, 'message': '密码重置成功，请重新登录'})
