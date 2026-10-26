"""Train a small GraphSAGE encoder over Govroute's reviewed graph.

This dependency-light implementation uses NumPy and manual backpropagation. It
only emits candidate related-to edges for human review; it never changes facts.
"""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
GRAPH_PATH = ROOT / "data" / "generated" / "graph.json"
OUTPUT_PATH = ROOT / "data" / "generated" / "gnn-neighbors.json"
SEED = 41
FEATURE_BUCKETS = 192
KINDS = ["journey", "step", "agency", "source", "program", "requirement"]


def tokens(value: str) -> list[str]:
    return [part for part in "".join(char.lower() if char.isalnum() else " " for char in value).split() if len(part) > 1]


def bucket(value: str) -> int:
    return int(hashlib.sha1(value.encode()).hexdigest()[:8], 16) % FEATURE_BUCKETS


def node_features(nodes: list[dict]) -> np.ndarray:
    width = FEATURE_BUCKETS + len(KINDS) + 4
    matrix = np.zeros((len(nodes), width), dtype=np.float32)
    for index, node in enumerate(nodes):
        text = " ".join([node.get("label", ""), node.get("description", ""), *node.get("params", {}).get("tags", [])])
        node_tokens = tokens(text)
        for token in node_tokens:
            matrix[index, bucket(token)] += 1 / math.sqrt(max(1, len(node_tokens)))
        kind = node.get("kind", "source")
        if kind in KINDS:
            matrix[index, FEATURE_BUCKETS + KINDS.index(kind)] = 1
        status = node.get("params", {}).get("status")
        matrix[index, FEATURE_BUCKETS + len(KINDS) + (0 if status == "verified" else 1)] = 1
        jurisdiction = node.get("params", {}).get("jurisdiction")
        matrix[index, FEATURE_BUCKETS + len(KINDS) + (2 if jurisdiction == "federal" else 3)] = 1
    return matrix


def adjacency(node_count: int, edge_pairs: list[tuple[int, int]]) -> np.ndarray:
    matrix = np.zeros((node_count, node_count), dtype=np.float32)
    for start, end in edge_pairs:
        matrix[start, end] = 1
        matrix[end, start] = 1
    np.fill_diagonal(matrix, 1)
    return matrix / np.maximum(matrix.sum(axis=1, keepdims=True), 1)


@dataclass(frozen=True)
class TrainingGraph:
    nodes: list[dict]
    edge_pairs: list[tuple[int, int]]
    index: dict[str, int]


def load_graph() -> TrainingGraph:
    if not GRAPH_PATH.exists():
        raise SystemExit("Graph export not found. Run: npm run graph:export")
    graph = json.loads(GRAPH_PATH.read_text())
    nodes = graph["nodes"]
    index = {node["id"]: position for position, node in enumerate(nodes)}
    pairs = [(index[edge["from"]], index[edge["to"]]) for edge in graph["edges"] if edge["from"] in index and edge["to"] in index]
    return TrainingGraph(nodes, pairs, index)


class GraphSage:
    """Two message-passing layers with a dot-product link objective."""

    def __init__(self, input_size: int, hidden_size: int = 72, output_size: int = 40):
        rng = np.random.default_rng(SEED)
        scale_one = math.sqrt(2 / input_size)
        scale_two = math.sqrt(2 / hidden_size)
        self.params = {
            "self_one": rng.normal(0, scale_one, (input_size, hidden_size)).astype(np.float32),
            "neighbor_one": rng.normal(0, scale_one, (input_size, hidden_size)).astype(np.float32),
            "self_two": rng.normal(0, scale_two, (hidden_size, output_size)).astype(np.float32),
            "neighbor_two": rng.normal(0, scale_two, (hidden_size, output_size)).astype(np.float32),
        }
        self.m = {name: np.zeros_like(value) for name, value in self.params.items()}
        self.v = {name: np.zeros_like(value) for name, value in self.params.items()}
        self.step = 0

    def forward(self, features: np.ndarray, adj: np.ndarray):
        neighbor_zero = adj @ features
        z_one = features @ self.params["self_one"] + neighbor_zero @ self.params["neighbor_one"]
        hidden = np.maximum(z_one, 0)
        neighbor_one = adj @ hidden
        encoded = hidden @ self.params["self_two"] + neighbor_one @ self.params["neighbor_two"]
        return encoded, (features, adj, neighbor_zero, z_one, hidden, neighbor_one)

    def update(self, gradients: dict[str, np.ndarray], learning_rate: float = 0.006):
        self.step += 1
        for name, gradient in gradients.items():
            gradient = np.clip(gradient, -1, 1)
            self.m[name] = 0.9 * self.m[name] + 0.1 * gradient
            self.v[name] = 0.999 * self.v[name] + 0.001 * gradient * gradient
            corrected_m = self.m[name] / (1 - 0.9 ** self.step)
            corrected_v = self.v[name] / (1 - 0.999 ** self.step)
            self.params[name] -= learning_rate * corrected_m / (np.sqrt(corrected_v) + 1e-8)


def train(graph: TrainingGraph, epochs: int = 320) -> tuple[np.ndarray, float]:
    rng = np.random.default_rng(SEED)
    features = node_features(graph.nodes)
    adj = adjacency(len(graph.nodes), graph.edge_pairs)
    model = GraphSage(features.shape[1])
    positives = np.array(graph.edge_pairs, dtype=np.int32)
    existing = {tuple(sorted(pair)) for pair in graph.edge_pairs}
    final_loss = 0.0

    for _ in range(epochs):
        negatives: list[tuple[int, int]] = []
        while len(negatives) < len(graph.edge_pairs):
            pair = tuple(sorted(rng.choice(len(graph.nodes), 2, replace=False).tolist()))
            if pair not in existing:
                negatives.append(pair)
        pairs = np.concatenate([positives, np.array(negatives, dtype=np.int32)])
        labels = np.concatenate([np.ones(len(positives)), np.zeros(len(negatives))]).astype(np.float32)

        encoded, cache = model.forward(features, adj)
        logits = np.sum(encoded[pairs[:, 0]] * encoded[pairs[:, 1]], axis=1)
        clipped = np.clip(logits, -20, 20)
        probabilities = 1 / (1 + np.exp(-clipped))
        final_loss = float(-np.mean(labels * np.log(probabilities + 1e-8) + (1 - labels) * np.log(1 - probabilities + 1e-8)))
        d_logits = (probabilities - labels) / len(labels)
        d_encoded = np.zeros_like(encoded)
        np.add.at(d_encoded, pairs[:, 0], d_logits[:, None] * encoded[pairs[:, 1]])
        np.add.at(d_encoded, pairs[:, 1], d_logits[:, None] * encoded[pairs[:, 0]])

        x, matrix, neighbor_zero, z_one, hidden, neighbor_one = cache
        gradients = {"self_two": hidden.T @ d_encoded, "neighbor_two": neighbor_one.T @ d_encoded}
        d_hidden = d_encoded @ model.params["self_two"].T + matrix.T @ (d_encoded @ model.params["neighbor_two"].T)
        d_z_one = d_hidden * (z_one > 0)
        gradients["self_one"] = x.T @ d_z_one
        gradients["neighbor_one"] = neighbor_zero.T @ d_z_one
        model.update(gradients)

    encoded, _ = model.forward(features, adj)
    norms = np.linalg.norm(encoded, axis=1, keepdims=True)
    return encoded / np.maximum(norms, 1e-8), final_loss


def recommend(graph: TrainingGraph, embeddings: np.ndarray, limit: int = 30) -> list[dict]:
    journey_indexes = [index for index, node in enumerate(graph.nodes) if node.get("kind") == "journey"]
    suggestions = []
    for offset, left in enumerate(journey_indexes):
        for right in journey_indexes[offset + 1:]:
            suggestions.append({
                "from": graph.nodes[left]["id"],
                "to": graph.nodes[right]["id"],
                "relation": "related-to",
                "score": round(float(np.dot(embeddings[left], embeddings[right])), 5),
                "status": "human-review-required"
            })
    return sorted(suggestions, key=lambda item: item["score"], reverse=True)[:limit]


def main() -> None:
    graph = load_graph()
    embeddings, loss = train(graph)
    payload = {
        "model": "two-layer-graphsage-link-discovery",
        "implementation": "numpy-manual-backprop",
        "seed": SEED,
        "trainingLoss": round(loss, 6),
        "inputGraph": str(GRAPH_PATH.relative_to(ROOT)),
        "nodeCount": len(graph.nodes),
        "policy": "Suggestions never enter the verified graph without human review.",
        "suggestions": recommend(graph, embeddings)
    }
    OUTPUT_PATH.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"Wrote {len(payload['suggestions'])} review-only suggestions to {OUTPUT_PATH.relative_to(ROOT)} (loss {loss:.4f})")


if __name__ == "__main__":
    main()
