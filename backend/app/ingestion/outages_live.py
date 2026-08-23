"""
Live power-outage orchestrator.

This module is the single owner of the live outage SNAPSHOT — the one dict
the API serves from. It never talks to a utility directly; the per-utility
fetchers do:

    outages_nipsco.fetch_nipsco()  — outage points + city/ZIP rollups
    outages_comed.fetch_comed()    — Kubra summary + cluster points

Call graph (who talks to whom):

    scheduler.run_outage_poll()  ──every OUTAGE_POLL_SECONDS──▶ poll_live_outages()
    api/outages.get_live_outages() ──cold-boot warmup only────▶ poll_live_outages()
    api/outages.get_live_outages() ──every request────────────▶ get_snapshot()

Design rules:
  * NIPSCO is the primary feed: if it fails, the poll fails (and the health
    endpoint shows it). ComEd rides along: its failure only logs a warning.
  * Each successful poll REPLACES the snapshot wholesale, so restored areas
    disappear without any delete logic.
  * A lock serializes polls so a burst of cold-boot requests can't stampede
    the utilities with duplicate fetches.
"""
import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

import httpx

from app.ingestion.outages_comed import fetch_comed
from app.ingestion.outages_common import BROWSER_UA
from app.ingestion.outages_nipsco import fetch_nipsco

logger = logging.getLogger(__name__)

#: Latest normalized snapshot; None until the first successful poll.
#: (Tests monkeypatch this directly — keep the name stable.)
_snapshot: Optional[dict] = None

#: Serializes polls; see module docstring.
_poll_lock = asyncio.Lock()


def get_snapshot() -> Optional[dict]:
    """The API's read path: cheap, no I/O, may be None right after boot."""
    return _snapshot


async def poll_live_outages() -> dict:
    """Refresh the snapshot from both utilities. See module docstring."""
    global _snapshot

    async with _poll_lock:
        async with httpx.AsyncClient(
            timeout=90, headers={"User-Agent": BROWSER_UA}
        ) as client:
            # Primary feed — an exception here fails the whole poll on purpose
            nipsco = await fetch_nipsco(client)

            # Secondary feed — best-effort
            comed = None
            try:
                comed = await fetch_comed(client)
            except Exception as exc:
                logger.warning(f"ComEd feed unavailable this scan: {exc}")

        features = nipsco["features"]
        total_affected = nipsco["total_affected"]
        utilities = [{
            "name": "NIPSCO (NiSource)",
            "customers_out": total_affected,
            "outage_count": len(features),
            # NIPSCO's feed carries no served total; ~500k electric customers
            # is the utility's published figure, so the share reads as
            # approximate in the UI.
            "customers_served": 500000,
            "served_approximate": True,
        }]
        if comed:
            utilities.append({
                "name": comed["name"],
                "customers_out": comed["customers_out"],
                "outage_count": comed["outage_count"],
                "customers_served": comed["customers_served"],
            })
            features = features + comed["features"]
            total_affected += comed["customers_out"]

        top_cities = sorted(
            nipsco["by_city"].items(), key=lambda kv: kv[1], reverse=True
        )[:25]

        _snapshot = {
            "utilities": utilities,
            "zip_index": nipsco["zip_index"],
            "as_of": datetime.now(timezone.utc).isoformat(),
            "utility": "NIPSCO (NiSource)",
            "outage_count": len(features),
            "customers_out": total_affected,
            "top_cities": [{"city": c, "affected": n} for c, n in top_cities],
            "features": features,
        }

    logger.info(
        f"Live outages: {len(features)} points, {total_affected} customers out "
        f"({'NIPSCO+ComEd' if comed else 'NIPSCO only'})"
    )
    return {"outages": len(features), "customers_out": total_affected}
