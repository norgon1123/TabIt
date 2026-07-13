import os
import shutil
from pathlib import Path

from app.config import get_settings

# Guest audio is written under its own owner directory so it can be swept wholesale: a guest
# upload is scratch space for the analysis job, never a library.
GUEST_OWNER = "_guest"


def save_audio(owner_id: str, recording_id: str, ext: str, data: bytes) -> str:
    base = Path(get_settings().storage_dir) / owner_id
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


def purge_guest_audio() -> None:
    """Empty the guest scratch directory.

    Each job deletes its own file as analysis ends, so this only ever finds leftovers from a
    process that died mid-analysis. Run at startup: guest recordings live in memory and did
    not survive the restart, so any file still here is orphaned — and a guest's audio must
    never outlive the processing it was uploaded for.
    """
    shutil.rmtree(Path(get_settings().storage_dir) / GUEST_OWNER, ignore_errors=True)
