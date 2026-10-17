"""API contract test on isolated SQLite; never touches the user's database."""
import json
import os
from pathlib import Path
import sys
import tempfile

sys.dont_write_bytecode = True
root = Path(os.environ.get("PETCARE_BACKEND_ROOT", Path(__file__).resolve().parents[2] / "backend"))
work = Path(tempfile.mkdtemp(prefix="petcare-health-pages-"))
os.environ["DATABASE_URL"] = f"sqlite+pysqlite:///{work / 'api.sqlite'}"
os.environ["JWT_SECRET_KEY"] = "isolated-health-pages-test-key-not-for-production"
os.environ["MEDIA_DIR"] = str(work / "media")
os.chdir(root)
sys.path.insert(0, str(root))
from fastapi.testclient import TestClient
from app.main import app
from app.db.base import Base
from app.db.session import engine

Base.metadata.create_all(engine)
with TestClient(app) as client:
    print(json.dumps({"ready": True}), flush=True)
    for line in sys.stdin:
        request = json.loads(line)
        response = client.request(request["method"], request["path"], headers=request.get("headers", {}), json=request.get("body"))
        print(json.dumps({"id": request["id"], "status": response.status_code, "body": response.text}), flush=True)
