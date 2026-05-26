from flask import Flask, send_from_directory
from flask_cors import CORS
from config import SECRET_KEY
from models import init_db
from auth import auth_bp
from api import api_bp
import os

def create_app():
    app = Flask(__name__, static_folder=None)
    app.config['SECRET_KEY'] = SECRET_KEY
    CORS(app)

    app.register_blueprint(auth_bp)
    app.register_blueprint(api_bp)

    # Serve frontend static files
    frontend_dir = os.path.normpath(os.path.join(os.path.dirname(__file__), '..'))

    @app.route('/')
    def index():
        return send_from_directory(frontend_dir, 'index.html')

    @app.route('/<path:filename>')
    def static_files(filename):
        if os.path.isfile(os.path.join(frontend_dir, filename)):
            return send_from_directory(frontend_dir, filename)
        return send_from_directory(frontend_dir, 'index.html')

    init_db()
    return app

if __name__ == '__main__':
    app = create_app()
    app.run(host='0.0.0.0', port=5000, debug=False)
