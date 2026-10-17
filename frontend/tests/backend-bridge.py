"""Integration test bridge: real FastAPI app on isolated SQLite; never touches any real database.

Protocol (one JSON object per line):
  -> {"id": 1, "path": "/api/v1/...", "method": "POST", "headers": {...},
      "body": {...},                                  # JSON body
      "form": {"fields": {...}, "files": [{"name": "file", "filename": "a.png", "type": "image/png", "b64": "..."}]}}
  <- {"ready": true}                                   # once, when the app is up
  <- {"id": 1, "status": 200, "body": "..."}           # one per request
"""
import base64
import json
import os
from pathlib import Path
import sys
import tempfile

sys.dont_write_bytecode = True
root = Path(os.environ.get("PETCARE_BACKEND_ROOT", Path(__file__).resolve().parents[2] / "backend"))
work = Path(tempfile.mkdtemp(prefix="petcare-integration-"))
os.environ["DATABASE_URL"] = f"sqlite+pysqlite:///{work / 'api.sqlite'}"
os.environ["JWT_SECRET_KEY"] = "isolated-frontend-integration-test-key-not-for-production"
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
        kwargs = {
            "headers": request.get("headers", {}),
        }
        if "form" in request:
            kwargs["data"] = request["form"].get("fields", {})
            kwargs["files"] = [
                (item["name"], (item["filename"], base64.b64decode(item["b64"]), item.get("type")))
                for item in request["form"].get("files", [])
            ]
        elif "body" in request:
            kwargs["json"] = request["body"]
        response = client.request(request["method"], request["path"], **kwargs)
        print(json.dumps({"id": request["id"], "status": response.status_code, "body": response.text}), flush=True)
