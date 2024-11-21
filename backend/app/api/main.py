from contextlib import asynccontextmanager
from typing import Any, Dict

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ..execution.dask_cluster_manager import DaskClusterManager
from ..execution.node_executor import NodeExecutor
from ..execution.workflow_executor_dask import WorkflowExecutorDask
from ..schemas.workflow_schemas import WorkflowDefinitionSchema, WorkflowNodeSchema

from .node_management import router as node_management_router
from .workflow_management import router as workflow_management_router
from .workflow_run import router as workflow_run_router
from .dataset_management import router as dataset_management_router
from .run_management import router as run_management_router
from .output_file_management import router as output_file_management_router
from .key_management import router as key_management_router
from .template_management import router as template_management_router

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    DaskClusterManager.get_client()
    yield
    DaskClusterManager.shutdown()


app = FastAPI(lifespan=lifespan, root_path="/api")

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


@app.post("/run_node/")
async def run_node(
    node: WorkflowNodeSchema, input_data: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Runs a node with the given name, configuration, and input data.
    """
    executor = NodeExecutor(node)
    output_data = await executor(input_data)

    return output_data.model_dump()


@app.post("/run_workflow/")
async def run_workflow(
    workflow: WorkflowDefinitionSchema, initial_inputs: Dict[str, Any] = {}
) -> Dict[str, Any]:
    """
    Runs a workflow with the given nodes and edges.
    """
    executor = WorkflowExecutorDask(workflow)
    return await executor(initial_inputs)
