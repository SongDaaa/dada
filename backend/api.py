from flask import Blueprint, request, jsonify
from auth import require_auth
from models import save_user_words, get_user_words, save_user_stats, get_user_stats

api_bp = Blueprint('api', __name__)

@api_bp.route('/api/words/sync', methods=['POST'])
@require_auth
def sync_words():
    data = request.get_json(silent=True) or {}
    client_words = data.get('words', {})
    client_stats = data.get('stats', {})

    # Merge words
    if client_words:
        save_user_words(request.user_id, client_words)

    # Merge stats
    if client_stats:
        save_user_stats(request.user_id, client_stats)

    # Return full merged data
    merged_words = get_user_words(request.user_id)
    merged_stats = get_user_stats(request.user_id)
    return jsonify({'words': merged_words, 'stats': merged_stats})

@api_bp.route('/api/words/export', methods=['GET'])
@require_auth
def export_words():
    words = get_user_words(request.user_id)
    stats = get_user_stats(request.user_id)
    return jsonify({'words': words, 'stats': stats})

@api_bp.route('/api/stats', methods=['GET'])
@require_auth
def get_stats():
    stats = get_user_stats(request.user_id)
    return jsonify({'stats': stats})

@api_bp.route('/api/stats', methods=['PUT'])
@require_auth
def put_stats():
    data = request.get_json(silent=True) or {}
    save_user_stats(request.user_id, data)
    return jsonify({'ok': True})
