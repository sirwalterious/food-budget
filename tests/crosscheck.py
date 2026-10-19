"""Independent re-implementation of the budget math, used to cross-check the TypeScript calculator.
Reads {"costs": <path>, "cases": [...]} on stdin and prints one total per case."""
import json, sys

req = json.load(sys.stdin)
d = json.load(open(req["costs"]))
ref = d["referenceFamily"]["monthly"]
ak = d["regions"]["anchorageMonthly"] / ref
pct = d["regions"]["alaskaPercentAboveAnchorage"]
ratio = {
    "us": 1.0, "ak-anchorage": ak, "ak-urban": ak * (1 + pct["urban"] / 100),
    "ak-rural1": ak * (1 + pct["ruralI"] / 100), "ak-rural2": ak * (1 + pct["ruralII"] / 100),
    "hi": d["regions"]["hawaiiMonthly"] / ref,
}

def adj(n):
    if n == 1: return 1.20
    if n == 2: return 1.10
    if n == 3: return 1.05
    if n == 4: return 1.00
    if n <= 6: return 0.95
    return 0.90

out = []
for c in req["cases"]:
    total = 0.0
    for sex, age in c["people"]:
        for g in d["plans"][c["plan"]]["groups"]:
            if g["ageMin"] <= age <= g["ageMax"] and g["sex"] in (None, sex):
                total += g[c["view"]] * ratio[c["region"]]
                break
        else:
            raise SystemExit(f"no group for {sex}{age}")
    out.append(round(total * adj(len(c["people"])) + 1e-9, 2))
print(json.dumps(out))
