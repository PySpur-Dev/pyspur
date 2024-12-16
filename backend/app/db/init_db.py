import os
import sys

# Add the parent directory to Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from app.database import engine
from app.models.base_model import Base
from app.models.dataset_model import DatasetModel
from app.models.eval_run_model import EvalRunModel
from app.models.output_file_model import OutputFileModel
from app.models.run_model import RunModel
from app.models.task_model import TaskModel
from app.models.workflow_model import WorkflowModel
from app.models.workflow_version_model import WorkflowVersionModel

def init_db():
    """Initialize the database by creating all tables."""
    print("Creating database tables...")
    Base.metadata.create_all(bind=engine)
    print("Database tables created successfully!")

if __name__ == "__main__":
    init_db()
