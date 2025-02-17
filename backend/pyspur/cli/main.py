"""Main module for the PySpur CLI."""

import os
import shutil
from pathlib import Path
from typing import Optional

import typer
from rich import print
from rich.console import Console
import uvicorn

from .utils import copy_template_file, load_environment, run_migrations

app = typer.Typer(
    name="pyspur",
    help="PySpur CLI - A tool for building and deploying AI Agents",
    add_completion=False,
)

console = Console()


@app.command()
def init(
    path: Optional[str] = typer.Argument(
        None,
        help="Path where to initialize PySpur project. Defaults to current directory.",
    )
) -> None:
    """Initialize a new PySpur project in the specified directory."""
    target_dir = Path(path) if path else Path.cwd()

    if not target_dir.exists():
        target_dir.mkdir(parents=True)

    # Copy .env.example
    try:
        copy_template_file(".env.example", target_dir / ".env.example")
        print("[green]✓[/green] Created .env.example")

        # Create .env if it doesn't exist
        env_path = target_dir / ".env"
        if not env_path.exists():
            shutil.copy2(target_dir / ".env.example", env_path)
            print("[green]✓[/green] Created .env from template")

        # Create a data directory
        data_dir = target_dir / "data"
        if not data_dir.exists():
            data_dir.mkdir()
            print("[green]✓[/green] Created data directory")

        print("\n[bold green]PySpur project initialized successfully! 🚀[/bold green]")
        print("\nNext steps:")
        print("1. Review and update the .env file with your configuration")
        print("2. Start the PySpur server with 'pyspur serve'")

    except Exception as e:
        print(f"[red]Error initializing project: {str(e)}[/red]")
        raise typer.Exit(1) from e


@app.command()
def serve(
    host: str = typer.Option(
        None,
        help="Host to bind the server to. Defaults to PYSPUR_HOST from environment or 0.0.0.0",
    ),
    port: int = typer.Option(
        None,
        help="Port to bind the server to. Defaults to PYSPUR_PORT from environment or 6080",
    ),
    sqlite: bool = typer.Option(
        False,
        help="Use SQLite database instead of PostgreSQL. Useful for local development.",
    ),
) -> None:
    """Start the PySpur server."""
    try:
        # Load environment variables
        load_environment()

        # Use environment variables as defaults if not provided via CLI
        host = host or os.getenv("PYSPUR_HOST", "0.0.0.0")
        port = port or int(os.getenv("PYSPUR_PORT", "6080"))

        if sqlite:
            print("[yellow]Using SQLite database for local development...[/yellow]")
            os.environ["SQLITE_OVERRIDE_DATABASE_URL"] = "sqlite:///./pyspur.db"

        # Run database migrations
        print("[yellow]Running database migrations...[/yellow]")
        run_migrations()

        # Start the server
        print(f"\n[green]Starting PySpur server at http://{host}:{port} 🚀[/green]")
        uvicorn.run(
            "pyspur.api.main:app",
            host=host,
            port=port,
        )

    except Exception as e:
        print(f"[red]Error starting server: {str(e)}[/red]")
        raise typer.Exit(1) from e


def main() -> None:
    """PySpur CLI."""
    app()
