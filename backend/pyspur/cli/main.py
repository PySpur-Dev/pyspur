"""Main module for the PySpur CLI."""

import os
import shutil
from importlib.metadata import version as get_version
from pathlib import Path
from typing import Optional

import typer
import uvicorn
from rich import print
from rich.console import Console

from .utils import copy_template_file, load_environment, run_migrations

app = typer.Typer(
    name="pyspur",
    help="PySpur CLI - A tool for building and deploying AI Agents",
    add_completion=False,
)

console = Console()


@app.command(name="version")
def show_version() -> None:
    """Display the current version of PySpur."""
    try:
        ver = get_version("pyspur")
        print(f"PySpur version: [bold green]{ver}[/bold green]")
    except ImportError:
        print("[yellow]PySpur version: unknown (package not installed)[/yellow]")


@app.command()
def init(
    path: Optional[str] = typer.Argument(
        None,
        help="Path where to initialize PySpur project. Defaults to current directory.",
    ),
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

        # add PROJECT_ROOT to .env
        # Check if PROJECT_ROOT is already defined in .env
        with open(env_path, "r") as f:
            if "PROJECT_ROOT=" not in f.read():
                with open(env_path, "a") as f:
                    f.write("\n# ================================")
                    f.write("\n# PROJECT_ROOT: DO NOT CHANGE THIS VALUE")
                    f.write("\n# ================================")
                    f.write("\nPROJECT_ROOT=" + str(target_dir) + "\n")

        # add __init__.py to the project directory
        init_file_path = target_dir / "__init__.py"
        if not init_file_path.exists():
            with open(init_file_path, "w") as f:
                f.write("# This is an empty __init__.py file")
            print("[green]✓[/green] Created __init__.py")

        custom_dirs = {
            "data": target_dir / "data",
            "tools": target_dir / "tools",
            "spurs": target_dir / "spurs",
        }
        # Create custom directories
        for dir_name, dir_path in custom_dirs.items():
            if not dir_path.exists():
                dir_path.mkdir()
                print(f"[green]✓[/green] Created {dir_name} directory")

        # add __init__.py to the tools and spurs directories
        for dir_name, dir_path in custom_dirs.items():
            if dir_name in ["tools", "spurs"]:
                init_file_path = dir_path / "__init__.py"
                if not init_file_path.exists():
                    with open(init_file_path, "w") as f:
                        f.write("# This is an empty __init__.py file")
                    print(f"[green]✓[/green] Created {dir_name}/__init__.py")

        # add .gitignore to the project, if it doesn't exist
        # if it exists, add data/ and .env to it
        gitignore_path = target_dir / ".gitignore"
        if not gitignore_path.exists():
            with open(gitignore_path, "w") as f:
                f.write("# PySpur project\n")
                f.write("data/\n")
                f.write(".env\n")
        else:
            with open(gitignore_path, "a") as f:
                f.write("data/\n")
                f.write(".env\n")
        print("[green]✓[/green] Created a .gitignore file")

        print("\n[bold green]PySpur project initialized successfully! 🚀[/bold green]")
        print("\nNext steps:")
        print("1. Review and update the .env file with your configuration")
        print("2. For quick protoype: start the PySpur server with 'pyspur serve --sqlite'")
        print(
            "3. For production:\n"
            "    a. Provide a PostgreSQL database details in the .env file\n"
            "    b. Start the server with 'pyspur serve'"
        )

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


if __name__ == "__main__":
    main()
