import shutil
import tempfile
from contextlib import ExitStack, asynccontextmanager
from importlib.resources import as_file, files
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .api_app import api_app

load_dotenv()

# Create an ExitStack to manage resources
exit_stack = ExitStack()
temporary_static_dir = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan and cleanup."""
    global temporary_static_dir

    # Setup: Create temporary directory and extract static files
    temporary_static_dir = Path(tempfile.mkdtemp())

    # Extract static files to temporary directory
    static_files = files("pyspur").joinpath("static")
    static_dir = exit_stack.enter_context(as_file(static_files))

    # Copy static files to temporary directory
    if static_dir.exists():
        shutil.copytree(static_dir, temporary_static_dir, dirs_exist_ok=True)

    yield

    # Cleanup: Remove temporary directory and close ExitStack
    exit_stack.close()
    shutil.rmtree(temporary_static_dir, ignore_errors=True)


app = FastAPI(lifespan=lifespan)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount the API routes under /api
app.mount("/api", api_app, name="api")

# Optionally, mount directories for assets that you want served directly:
if temporary_static_dir and Path.joinpath(temporary_static_dir, "images").exists():
    app.mount(
        "/images",
        StaticFiles(directory=str(temporary_static_dir.joinpath("images"))),
        name="images",
    )
if temporary_static_dir and Path.joinpath(temporary_static_dir, "_next").exists():
    app.mount(
        "/_next", StaticFiles(directory=str(temporary_static_dir.joinpath("_next"))), name="_next"
    )


@app.get("/{full_path:path}", include_in_schema=False)
async def serve_frontend(full_path: str):
    if not temporary_static_dir:
        raise RuntimeError("Static directory not initialized")

    # If the request is empty, serve index.html
    if full_path == "":
        return FileResponse(temporary_static_dir.joinpath("index.html"))

    # remove trailing slash
    if full_path[-1] == "/":
        full_path = full_path[:-1]

    # Build a candidate file path from the request.
    candidate = temporary_static_dir.joinpath(full_path)

    # If candidate is a directory, try its index.html.
    if candidate.is_dir():
        candidate_index = candidate.joinpath("index.html")
        if candidate_index.exists():
            return FileResponse(candidate_index)

    # If no direct file, try appending ".html" (for files like dashboard.html)
    candidate_html = temporary_static_dir.joinpath(full_path + ".html")
    if candidate_html.exists():
        return FileResponse(candidate_html)

    # If a file exists at that candidate, serve it.
    if candidate.exists():
        return FileResponse(candidate)

    # Check if the parent directory contains a file named "[id].html"
    parts = full_path.split("/")
    if len(parts) >= 2:
        parent = temporary_static_dir.joinpath(*parts[:-1])
        dynamic_file = parent.joinpath("[id].html")
        if dynamic_file.exists():
            return FileResponse(dynamic_file)

    # Fallback: serve the main index.html for client‑side routing.
    return FileResponse(temporary_static_dir.joinpath("index.html"))
