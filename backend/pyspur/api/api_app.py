from fastapi import FastAPI

from ..nodes.registry import NodeRegistry

NodeRegistry.discover_nodes()

from ..integrations.google.auth import router as google_auth_router
from .dataset_management import router as dataset_management_router
from .evals_management import router as evals_management_router
from .file_management import router as file_management_router
from .key_management import router as key_management_router
from .node_management import router as node_management_router
from .openai_compatible_api import router as openai_compatible_api_router
from .output_file_management import router as output_file_management_router
from .rag_management import router as rag_management_router
from .run_management import router as run_management_router
from .template_management import router as template_management_router
from .workflow_management import router as workflow_management_router
from .workflow_run import router as workflow_run_router

# Create a sub-application for API routes
api_app = FastAPI(
    docs_url="/docs",
    redoc_url="/redoc",
    title="PySpur API",
    version="1.0.0",
)

api_app.include_router(node_management_router, prefix="/node")
api_app.include_router(workflow_management_router, prefix="/wf")
api_app.include_router(workflow_run_router, prefix="/wf")
api_app.include_router(dataset_management_router, prefix="/ds")
api_app.include_router(run_management_router, prefix="/run")
api_app.include_router(output_file_management_router, prefix="/of")
api_app.include_router(key_management_router, prefix="/env-mgmt")
api_app.include_router(template_management_router, prefix="/templates")
api_app.include_router(openai_compatible_api_router, prefix="/api")
api_app.include_router(evals_management_router, prefix="/evals")
api_app.include_router(google_auth_router, prefix="/google")
api_app.include_router(rag_management_router, prefix="/rag")
api_app.include_router(file_management_router, prefix="/files")
