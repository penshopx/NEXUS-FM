---
name: PostgreSQL bitmap plan assertions
description: How to assert GIN index usage correctly in JSON query plans.
---

When checking `EXPLAIN (FORMAT JSON)`, identify a GIN-backed `Bitmap Index Scan` by its `Index Name`; do not require the same node to include `Relation Name`. Check unwanted sequential scans separately on nodes that identify the target relation.

**Why:** PostgreSQL puts the relation on a parent bitmap heap node while the child bitmap index node can contain only the index identity. Requiring both properties on one node rejects valid indexed plans.

**How to apply:** Use this split assertion for registry query-plan coverage and any future PostgreSQL GIN or bitmap plan tests.