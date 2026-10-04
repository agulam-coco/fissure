import pandas as pd
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
df = pd.read_pickle(SCRIPT_DIR / "processed" / "complaints_chevrolet_silverado.pkl")

# Look for any complaint that cites a specific campaign number directly
import re
campaign_mentions = df["CDESCR"].dropna().str.extractall(r"(\d{2}V\d{3,6})")
print("Campaign numbers mentioned in Silverado complaints:")
print(campaign_mentions[0].value_counts().head(20))

print("\n\nSample narratives:")
for text in df["CDESCR"].dropna().sample(15, random_state=1):
    print("—", text[:300])
    print()