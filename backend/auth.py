from flask import Blueprint, request, jsonify
from config import SECRET_KEY, JWT_EXPIRY_HOURS
from models import create_user, get_user_by_username, get_user_by_id, is_admin, set_admin, get_all_users_stats
import jwt, bcrypt, datetime

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

@auth_bp.route('/api/auth/register', methods=['POST'])
def register():
    data = request.get_json(silent=True) or {}
    username = (data.get('username') or '').strip()
    password = (data.get('password') or '').strip()
    if not username or not password:
        return jsonify({'error': '用户名和密码不能为空'}), 400
    if len(username) < 2 or len(username) > 32:
        return jsonify({'error': '用户名长度2-32个字符'}), 400
    if len(password) < 4:
        return jsonify({'error': '密码至少4个字符'}), 400
    pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    user = create_user(username, pw_hash)
    if user is None:
        return jsonify({'error': '用户名已存在'}), 409
    # First user is admin
    if user['id'] == 1:
        set_admin(username)
    token = make_token(user['id'])
    return jsonify({'token': token, 'user': {'id': user['id'], 'username': user['username'], 'is_admin': bool(user['is_admin'])}})

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
    return jsonify({'token': token, 'user': {'id': user['id'], 'username': user['username'], 'is_admin': bool(user['is_admin'])}})
@auth_bp.route('/api/auth/me', methods=['GET'])
@require_auth
def me():
    user = get_user_by_id(request.user_id)
    if user is None:
        return jsonify({'error': 'User not found'}), 404
    return jsonify({'user': {'id': user['id'], 'username': user['username'], 'is_admin': bool(user['is_admin'])}})
