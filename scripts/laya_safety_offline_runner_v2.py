#!/usr/bin/env python3
"""PSI offline ONLY Laya v2 expansion (132 synthetic cases, six hazard labels).

Do NOT run in Vercel Functions or on real worker/accident records.
Local, manually installed and pre-cached Laya checkpoint required.

python scripts/laya_safety_offline_runner_v2.py \
    --input PSI_Laya_V2_11lang_132cases.json \
    --output local_laya_v2_predictions.json \
    --checkpoint-revision <pinned_actual_huggingface_commit>

This is a research harness, not an authentication/provenance authority.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["HF_DATASETS_OFFLINE"] = "1"

SCHEMA = "psi.laya.offline-hazard-benchmark.v2"
LABELS = {
    "fall": "Person falling from height or into an opening",
    "struck_by": "Worker struck by a dropped, moving, lifted or swung object",
    "caught_in": "Worker body or clothing caught, crushed or pinched by machinery",
    "electrical": "Electric shock or electrocution from current or exposed wiring",
    "fire": "Flames, ignition, welding sparks, combustible materials or fire",
    "none": "Only administrative paperwork and inventory; no accident hazard described",
}
QUESTION = {
    "hazard_type": {
        "type": "choice",
        "instructions": "Select only the single explicitly described primary construction hazard. "
                        "Do not infer a risk absent from the sentence. "
                        "Do not confuse safety instructions with an accident occurrence.",
        "criteria": LABELS,
    }
}


def validate_case_list(raw: object) -> list[dict]:
    if not isinstance(raw, dict) or raw.get("schema") != SCHEMA or raw.get("purpose") != "synthetic-research-only":
        raise ValueError("Expected PSI Laya v2 synthetic-only fixture.")
    cases = raw.get("cases")
    if not isinstance(cases, list) or len(cases) != 132:
        raise ValueError("Expected the full 132-case synthetic fixture (11 languages x 12).")
    if any(not isinstance(row, dict) for row in cases):
        raise ValueError("Invalid case entry.")
    ids = [r.get("id") for r in cases]
    if any(not isinstance(r, str) for r in ids) or len(set(ids)) != 132:
        raise ValueError("Duplicate or invalid case IDs.")
    # Fixed source/label integrity and reviewer authenticity are additionally
    # evaluated by PSI TypeScript reference validator after import.
    return cases


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--input", required=True, type=Path)
    p.add_argument("--output", required=True, type=Path)
    p.add_argument("--checkpoint-revision", required=True)
    p.add_argument("--validate-only", action="store_true", help="Check the local fixture; do not load any model")
    args = p.parse_args()
    if args.input.resolve() == args.output.resolve():
        p.error("Input and output must differ")
    if not args.checkpoint_revision.strip() or args.checkpoint_revision.lower() in {"latest", "main", "unknown"}:
        p.error("Use a real pinned checkpoint revision, not main/latest/unknown")
    if args.input.stat().st_size > 1024 * 1024:
        p.error("Synthetic file exceeds 1 MB cap")
    cases = validate_case_list(json.loads(args.input.read_text(encoding="utf-8")))
    reviewed = [row for row in cases if row.get("translationReview") == "reviewed"
                and isinstance(row.get("text"), str) and len(row["text"].strip()) >= 10
                and (row.get("language") == "ko-KR" or
                     (isinstance(row.get("reviewerCode"), str) and len(row["reviewerCode"].strip()) >= 3
                      and isinstance(row.get("reviewedAt"), str) and row["reviewedAt"].endswith("Z")))]
    print(f"V2 fixture: 132 cases, reviewed candidates: {len(reviewed)}")
    if args.validate_only:
        print("Validate-only: model not loaded, no predictions emitted.")
        return 0
    if not reviewed:
        p.error("No manually reviewed synthetic cases")
    try:
        from laya import Router
    except ImportError as err:
        raise SystemExit("Install Laya separately on the authorized offline PC (not on Vercel).") from err
    try:
        router = Router()
    except Exception as err:
        raise SystemExit("Local cached checkpoint unavailable. Keep HF_HUB_OFFLINE=1 and do not upload site data.") from err
    predictions = []
    for row in reviewed:
        try:
            response = router.predict(row["text"], QUESTION, model="multilingual")
            label = response["answers"]["hazard_type"]["choice"]
        except Exception as err:
            raise SystemExit(f"Local Laya classification failed for synthetic {row['id']}") from err
        if label not in LABELS:
            raise SystemExit(f"Unknown hazard label for {row['id']}")
        predictions.append({
            "caseId": row["id"],
            "predictedLabel": label,
            "confidence": None,  # Never fabricate a calibrated probability
        })
    result = {
        "schema": SCHEMA, "purpose": "synthetic-research-only",
        "engine": "laya", "runtime": "local-offline",
        "checkpoint": "convaiinnovations/laya-multilingual",
        "checkpointRevision": args.checkpoint_revision,
        "cases": cases, "predictions": predictions,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(predictions)} unverified local research predictions; never approve operational safety from these.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
