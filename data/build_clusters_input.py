import pandas as pd
from nhtsa_columns import COLUMNS
from pathlib import Path


print(f"Loaded {len(COLUMNS)} column names")
assert len(COLUMNS) == 51, f"Expected 49 columns, got {len(COLUMNS)}"


SCRIPT_DIR = Path(__file__).resolve().parent   # this is the data/ folder
PROJECT_ROOT = SCRIPT_DIR.parent                # one level up = fissure/

RAW_PATH = SCRIPT_DIR / "raw" / "FLAT_CMPL.txt"
COLUMNS_PATH = SCRIPT_DIR / "reference" / "nhtsa_columns.py"
PROCESSED_DIR = SCRIPT_DIR / "processed"

# There is one row on line 555887 that is skipped. This is because the data there is inconsistent
df = pd.read_csv(
    RAW_PATH,
    sep="\t",
    header=None,          # no header row in the file
    names=COLUMNS,        # apply our column names
    dtype=str,            # force everything to load as text, no type guessing
    encoding="latin-1",   # NHTSA's file isn't strict UTF-8; this avoids decode errors
    on_bad_lines="skip",  # flag malformed rows instead of silently dropping or crashing
    low_memory=False,     # avoid pandas' chunked dtype-guessing on a file this size
)

print(f"Loaded {len(df):,} rows")
