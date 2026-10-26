# Experimental GNN layer

Govroute's reviewed knowledge graph remains authoritative. The optional GraphSAGE encoder learns from graph topology plus hashed text features and proposes `related-to` edges between journeys.

It is intentionally separated from the user-facing answer path:

1. Export the canonical graph with `npm run graph:export`.
2. Install `ml/requirements.txt` in an isolated Python environment.
3. Run `npm run gnn:train`.
4. Review `data/generated/gnn-neighbors.json` manually.

The model is useful for discovering similar pathways, missing cross-links, and future retrieval candidates. A prediction cannot create a verified step or change eligibility, fees, deadlines, forms, or source status.
