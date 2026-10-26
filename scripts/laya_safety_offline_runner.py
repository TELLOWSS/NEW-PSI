#!/usr/bin/env python3
"""Local-only Laya safety classification benchmark. NEVER deploy this in Vercel Functions.

Usage:
    # Download/checkpoint must already be cached; do not run with real worker data.
    python scripts/laya_safety_offline_runner.py --input <completed_template.json> \
      --output <local_result.json> --checkpoint-revision <actual-hf-revision>

Install laya locally in a separate PC environment only after dependency/license review.
The script forces Hugging Face offline mode to avoid downloading a checkpoint or
sending private data when called.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

# Must be set before importing Laya / transformers.
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["HF_DATASETS_OFFLINE"] = "1"

SCHEMA = "psi.laya.offline-hazard-benchmark.v1"
LABELS = {
    "fall": "A person could fall from height or into an opening",
    "struck_by": "A worker could be struck by a dropped or moving object",
    "caught_in": "A person could be caught, crushed or pinched by machinery",
    "electrical": "A person could suffer electric shock or electrocution",
    "fire": "Fire, ignition, flames or explosion risk is described",
    "none": "No specific accident hazard is described; procedural context only",
}
QUESTIONS = {
    "hazard_type": {
        "type": "choice",
        "instructions": "Classify the single specific construction accident hazard explicitly described. "
                        "Do not infer hazards not mentioned in the text.",
        "criteria": LABELS,
    }
}


def main() -> int:
    parser = argparse.ArgumentParser(description="PSI Laya local-only research runner")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--checkpoint-revision", required=True,
                        help="The real model revision you separately verified; no dummy or 'latest' values")
    args = parser.parse_args()
    if not args.checkpoint_revision.strip() or args.checkpoint_revision.strip().lower() in {"latest", "unknown", "main"}:
        parser.error("Specify the actual pinned checkpoint revision (not latest/main/unknown)")
    if args.input.stat().st_size > 512 * 1024:
        parser.error("Input exceeds the synthetic test fixture size cap")
    if args.input.resolve() == args.output.resolve():
        parser.error("Input and output must be different files")
    raw = json.loads(args.input.read_text(encoding="utf-8"))
    if raw.get("schema") != SCHEMA or raw.get("purpose") != "synthetic-research-only":
        parser.error("Only a PSI synthetic research template may be used")
    cases = raw.get("cases")
    if not isinstance(cases, list) or len(cases) != 33:
        parser.error("Expected the 33-case PSI synthetic template")
    if any(not isinstance(item, dict) for item in cases):
        parser.error("Case entries must be objects")

    candidates = [case for case in cases
                  if case.get("translationReview") == "reviewed"
                  and isinstance(case.get("text"), str) and len(case["text"].strip()) >= 10]
    if not candidates:
        parser.error("No reviewed synthetic reference sentences; have native speakers validate translations")

    try:
        from laya import Router
    except ImportError as error:
        raise SystemExit("Laya is not installed in this local Python environment. "
                         "Install separately after license and dependency review.") from error

    try:
        router = Router()
    except Exception as error:
        raise SystemExit("Local Laya checkpoint was not available under HF_HUB_OFFLINE=1. "
                         "Do not upload real site data or auto-download on Vercel.") from error

    predictions: list[dict[str, object]] = []
    for case in candidates:
        try:
            answer = router.predict(case["text"], QUESTIONS, model="multilingual")
            label = answer["answers"]["hazard_type"]["choice"]
        except Exception as error:
            raise SystemExit("Local inference failed on synthetic case " + str(case.get("id"))) from error
        if label not in LABELS:
            raise SystemExit("Unknown model label for case " + str(case.get("id")))
        predictions.append({
            "caseId": case["id"],
            "predictedLabel": label,
            # Confidence is unavailable without selecting a version-specific
            # calibrated probability field; never invent it.
            "confidence": None,
        })

    result = {
        "schema": SCHEMA,
        "engine": "laya",
        "checkpoint": "convaiinnovations/laya-multilingual",
        "checkpointRevision": args.checkpoint_revision.strip(),
        "runtime": "local-offline",
        "cases": cases,
        "predictions": predictions,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print("Research-only synthetic predictions saved:", len(predictions))
    print("No accuracy or safety approval is claimed; review in PSI developer lab.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
