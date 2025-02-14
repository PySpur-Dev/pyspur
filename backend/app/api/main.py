from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from ..nodes.registry import NodeRegistry
NodeRegistry.discover_nodes()

from .node_management import router as node_management_router
from .workflow_management import router as workflow_management_router
from .workflow_run import router as workflow_run_router
from .dataset_management import router as dataset_management_router
from .run_management import router as run_management_router
from .output_file_management import router as output_file_management_router
from .key_management import router as key_management_router
from .template_management import router as template_management_router
from .openai_compatible_api import router as openai_compatible_api_router
from .evals_management import router as evals_management_router
from ..integrations.google.auth import router as google_auth_router
from .rag_management import router as rag_management_router
from .file_management import router as file_management_router
from .library_management import router as library_management_router

load_dotenv()



app = FastAPI(root_path="/api")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Update with your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(node_management_router, prefix="/node")
app.include_router(workflow_management_router, prefix="/wf")
app.include_router(workflow_run_router, prefix="/wf")
app.include_router(dataset_management_router, prefix="/ds")
app.include_router(run_management_router, prefix="/run")
app.include_router(output_file_management_router, prefix="/of")
app.include_router(key_management_router, prefix="/env-mgmt")
app.include_router(template_management_router, prefix="/templates")
app.include_router(openai_compatible_api_router, prefix="/api")
app.include_router(evals_management_router, prefix="/evals")
app.include_router(google_auth_router, prefix="/google")
app.include_router(rag_management_router, prefix="/rag")
app.include_router(file_management_router, prefix="/files")
app.include_router(library_management_router, prefix="/library")