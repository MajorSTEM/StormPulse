#!/usr/bin/env python3
"""
StormPulse V2 — Scoring validation harness.

Replays the 20-event historical fixture set (scripts/fixtures/
historical_events.json) through the weighted T1/T2/T3 tier model in
backend/app/scoring/confidence.py and reports tier alignment.

Acceptance criterion (capstone implementation plan): >= 85% alignment.

Usage:
    python scripts/validate_scoring.py

Exit code 0 if alignment >= 85%, 1 otherwise — safe to wire into CI.
"""
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend"))

from app.scoring.confidence import Signal, assign_tier  # noqa: E402

FIXTURES = REPO_ROOT / "scripts" / "fixtures" / "historical_events.json"
ACCEPTANCE_THRESHOLD = 85.0


def main() -> int:
    data = json.loads(FIXTURES.read_text(encoding="utf-8"))
    events = data["events"]

    aligned = 0
    rows = []
    for event in events:
        signals = {Signal(s) for s in event["signals"]}
        result = assign_tier(signals)
        ok = result.tier == event["expected_tier"]
        aligned += ok
        rows.append((event, result, ok))

    name_w = max(len(e["name"]) for e in events) + 2
    print(f"\nStormPulse scoring validation — {len(events)} historical NWS events")
    print("=" * (name_w + 46))
    print(f"{'Event':<{name_w}}{'Date':<12}{'Expected':<10}{'Model':<8}{'Score':<7}Match")
    print("-" * (name_w + 46))
    for event, result, ok in rows:
        print(
            f"{event['name']:<{name_w}}{event['date']:<12}"
            f"{event['expected_tier']:<10}{result.tier:<8}"
            f"{result.score:<7.2f}{'PASS' if ok else 'FAIL'}"
        )

    pct = 100.0 * aligned / len(events)
    print("-" * (name_w + 46))
    print(f"Tier alignment: {aligned}/{len(events)} = {pct:.1f}% "
          f"(acceptance: >= {ACCEPTANCE_THRESHOLD:.0f}%)")
    verdict = "PASSED" if pct >= ACCEPTANCE_THRESHOLD else "FAILED"
    print(f"Result: {verdict}\n")
    return 0 if pct >= ACCEPTANCE_THRESHOLD else 1


if __name__ == "__main__":
    sys.exit(main())
