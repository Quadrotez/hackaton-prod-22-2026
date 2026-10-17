"""Export the OpenAPI schema and a standalone Swagger UI as static files.

The API schema is generated from the FastAPI app without starting a server, so
CI can attach browsable docs to every branch as pipeline artifacts (see the
``docs:openapi`` job in ``.gitlab-ci.yml``).

Usage:
    python scripts/export_openapi.py [output_dir]

The output directory is self-contained: ``openapi.json``, the Swagger UI
``index.html`` (the schema is inlined, so no ``fetch`` is needed) and the
Swagger UI JS/CSS assets vendored next to it. It can therefore be opened
directly from disk (``file://``) or served from any static host, online or not.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from urllib.request import urlopen

# Allow running this file directly (``python scripts/export_openapi.py``).
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import SWAGGER_REQUEST_INTERCEPTOR, app  # noqa: E402

# Swagger UI assets are vendored locally; these CDN URLs are only a fallback.
SWAGGER_UI_BUNDLE = "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"
SWAGGER_UI_CSS = "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css"

INDEX_TEMPLATE = """<!DOCTYPE html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>__TITLE__ - Swagger UI</title>
    <link rel="stylesheet" href="__CSS__" />
    <link rel="icon" href="data:," />
    <style>
      body { margin: 0; }
      .build-banner {
        font: 13px/1.5 -apple-system, Segoe UI, Roboto, sans-serif;
        background: #1f2937; color: #f9fafb; padding: 8px 16px;
      }
      .build-banner code { color: #93c5fd; }
    </style>
  </head>
  <body>
    __BANNER__
    <div id="swagger-ui"></div>
    <script src="__BUNDLE__"></script>
    <script>
      window.onload = () => {
        window.ui = SwaggerUIBundle({
          spec: __SPEC__,
          dom_id: "#swagger-ui",
          deepLinking: true,
          requestInterceptor: __INTERCEPTOR__,
        });
      };
    </script>
  </body>
</html>
"""


def build(output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)

    schema = app.openapi()
    if server_url := _env("OPENAPI_SERVER_URL"):
        schema["servers"] = [{"url": server_url}]

    (output_dir / "openapi.json").write_text(
        json.dumps(schema, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    bundle, css = _vendor_swagger_assets(output_dir)
    (output_dir / "index.html").write_text(
        _render_index(bundle=bundle, css=css, spec_literal=_spec_literal(schema)),
        encoding="utf-8",
    )

    paths = len(schema.get("paths", {}))
    print(f"Wrote {paths} paths to {output_dir}/openapi.json and {output_dir}/index.html")


def _spec_literal(schema: dict) -> str:
    # Pure ASCII JSON, safe to inline as a JS object literal inside <script>.
    return json.dumps(schema, ensure_ascii=True).replace("<", "\\u003c")


def _vendor_swagger_assets(output_dir: Path) -> tuple[str, str]:
    """Download the Swagger UI JS/CSS next to the HTML so the page works offline
    and when opened directly from disk. Falls back to the CDN on failure."""
    refs: dict[str, str] = {}
    for url, name in ((SWAGGER_UI_BUNDLE, "swagger-ui-bundle.js"), (SWAGGER_UI_CSS, "swagger-ui.css")):
        try:
            (output_dir / name).write_bytes(urlopen(url, timeout=30).read())
            refs[url] = name
        except Exception as exc:  # noqa: BLE001
            print(f"Warning: could not vendor {name} ({exc}); falling back to CDN")
            refs[url] = url
    return refs[SWAGGER_UI_BUNDLE], refs[SWAGGER_UI_CSS]


def _render_index(*, bundle: str, css: str, spec_literal: str) -> str:
    banner = ""
    if label := _env("OPENAPI_DOCS_LABEL"):
        banner = f'<div class="build-banner">PetCare API docs &mdash; <code>{_escape(label)}</code></div>'

    return (
        INDEX_TEMPLATE.replace("__TITLE__", _escape(app.title))
        .replace("__CSS__", css)
        .replace("__BUNDLE__", bundle)
        .replace("__BANNER__", banner)
        .replace("__INTERCEPTOR__", SWAGGER_REQUEST_INTERCEPTOR)
        .replace("__SPEC__", spec_literal)
    )


def _env(name: str) -> str:
    return os.environ.get(name, "").strip()


def _escape(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


if __name__ == "__main__":
    destination = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("openapi-static")
    build(destination)
