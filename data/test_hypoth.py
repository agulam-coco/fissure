# import pandas as pd
# from pathlib import Path

# # ---- resolve paths relative to this script's own location, not the cwd ----
# SCRIPT_DIR = Path(__file__).resolve().parent
# PROCESSED_PATH = SCRIPT_DIR / "processed" / "complaints_clean.pkl"

# df = pd.read_pickle(PROCESSED_PATH)

# candidates = [
#     ("FORD", "FUSION"),
#     ("TOYOTA", "CAMRY"),
#     ("HONDA", "CIVIC"),
#     ("CHEVROLET", "SILVERADO"),
#     ("JEEP", "GRAND CHEROKEE"),
#     ("NISSAN", "ALTIMA"),
#     ("FORD", "EXPLORER"),
#     ("HYUNDAI", "SONATA"),
# ]

# for make, model in candidates:
#     count = ((df["MAKETXT"] == make) & (df["MODELTXT"] == model)).sum()
#     print(f"{make} {model}: {count:,}")import pandas as pd
import pandas as pd
df = pd.read_pickle("processed/complaints_clean.pkl")
silverado_variants = df[df["MODELTXT"].str.contains("SILVERADO", case=False, na=False)]["MODELTXT"].value_counts()
print(silverado_variants)