import pandas as pd
from nhtsa_columns import COLUMNS
from pathlib import Path


print(f"Loaded {len(COLUMNS)} column names")
assert len(COLUMNS) == 51, f"Expected 51 columns, got {len(COLUMNS)}"


SCRIPT_DIR = Path(__file__).resolve().parent   # this is the data/ folder
PROJECT_ROOT = SCRIPT_DIR.parent                # one level up = fissure/

RAW_PATH = SCRIPT_DIR / "raw" / "FLAT_CMPL.txt"
COLUMNS_PATH = SCRIPT_DIR / "reference" / "nhtsa_columns.py"
PROCESSED_DIR = SCRIPT_DIR / "processed"

# There is one row (line 555887) that gets skipped: a legitimate complaint whose
# narrative/trailing fields push it past the standard 51-field layout. Confirmed
# by inspecting the raw line directly — not a sign of a column-mapping problem.
df = pd.read_csv(
    RAW_PATH,
    sep="\t",
    header=None,          # no header row in the file
    names=COLUMNS,        # apply our column names
    dtype=str,            # force everything to load as text, no type guessing
    encoding="latin-1",   # NHTSA's file isn't strict UTF-8; this avoids decode errors
    on_bad_lines="skip",  # drop malformed rows instead of crashing
    low_memory=False,     # avoid pandas' chunked dtype-guessing on a file this size
)

print(f"Loaded {len(df):,} rows")

print("\nColumn names:")
print(df.columns.tolist())

print("\nFirst 3 rows:")
print(df.head(3).to_string())

# De-dup on the FULL row, not just CMPLID. A single complaint can legitimately
# span multiple rows that share one CMPLID but describe different component
# codes (confirmed: e.g. CMPLID 8007904 appears 65 times, each a different
# COMPDESC). De-duping on CMPLID alone would silently destroy that multi-
# component structure, which is exactly the signal the project depends on.
before = len(df)
df = df.drop_duplicates()
after = len(df)

print(f"\nRows before de-dup: {before:,}")
print(f"Rows after de-dup:  {after:,}")
print(f"Duplicates removed: {before - after:,}")

PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

output_path = PROCESSED_DIR / "complaints_clean.pkl"
df.to_pickle(output_path)

print(f"\nSaved cleaned data to {output_path}")
print(f"File size: {output_path.stat().st_size / 1e6:.1f} MB")


# pick your demo vehicle here
test_make = "FORD"
test_model = "FUSION"

test_filter = (df["MAKETXT"] == test_make) & (df["MODELTXT"] == test_model)
test_count = test_filter.sum()

print(f"\n{test_make} {test_model} complaints: {test_count:,}")