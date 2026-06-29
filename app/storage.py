import os
from pathlib import Path

from app.config import get_settings


def save_audio(user_id: str, recording_id: str, ext: str, data: bytes) -> str:
    base = Path(get_settings().storage_dir) / user_id
    base.mkdir(parents=True, exist_ok=True)
    path = base / f"{recording_id}.{ext}"
    # Write atomically so a failed/partial write never leaves an orphan at the final path.
    tmp = path.with_name(path.name + ".tmp")
    try:
        tmp.write_bytes(data)
        os.replace(tmp, path)
    except OSError:
        tmp.unlink(missing_ok=True)
        raise
    return str(path)


def delete_audio(stored_path: str) -> None:
    try:
        os.remove(stored_path)
    except FileNotFoundError:
        pass
