"""Compatibility launcher: always use the authenticated server, never static HTML."""
import os
from pathlib import Path

if __name__ == "__main__":
    os.chdir(Path(__file__).resolve().parent)
    command = "start" if os.environ.get("NODE_ENV") == "production" else "dev"
    os.execvp("npm", ["npm", "run", command])
