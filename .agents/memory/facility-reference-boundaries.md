---
name: Facility reference boundaries
description: Durable product boundaries derived from the supplied building, maintenance, automation, utility, and warehouse references.
---

Use the supplied Permen PU 24/PRT/M/2008 copies as the primary reference baseline for building maintenance and repair workflows, while recording source clauses and separately checking current legal applicability before claiming compliance. Treat training decks and academic material as design input, not legal authority.

**Why:** The reference set mixes regulation, teaching material, dated foreign warehouse examples, and duplicate documents. Giving them equal authority would create unsupported rules.

**How to apply:** Build evidence-linked inspection, preventive maintenance, repair, verification, and close-out workflows. Preserve source/version/applicability metadata for every compliance control.

NEXUS-FM governs integrations with BMS/BAS rather than replacing their real-time control, alarm, historian, and safety functions.

**Why:** BMS/BAS sources describe specialist operational technology whose local controllers and safety behavior must continue independently.

**How to apply:** Ingest normalized telemetry, alarms, runtime, meter, and integration-health signals; create governed work from them; require explicit approval and provenance for any permitted command.

Warehouse-building governance belongs in NEXUS-FM, but inventory transactions do not.

**Why:** Facility zoning, racks, docks, capacity, utilities, safety, and handling equipment affect asset governance; SKU, receiving, put-away, picking, packing, and shipping belong to WMS.

**How to apply:** Model warehouse physical zones and assets, and consume summarized WMS capacity/utilization signals through integration when useful.