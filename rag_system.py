# rag_system.py
# ClinIQ AI — Multimodal RAG System
# Text: BioBERT (768-dim)  |  Images: ResNet50 (2048-dim)  |  Vector DB: Milvus / Zilliz Cloud

import os
import numpy as np
from sentence_transformers import SentenceTransformer
from pymilvus import connections, Collection, utility
import torch
import torchvision.transforms as transforms
import torchvision.models as models
from PIL import Image
import io
from typing import List, Dict, Optional, Tuple
import warnings
warnings.filterwarnings('ignore')
from dotenv import load_dotenv
load_dotenv()

# ── Config from env ────────────────────────────────────────────────────────────
MILVUS_HOST        = os.getenv("MILVUS_HOST", "localhost")
MILVUS_PORT        = os.getenv("MILVUS_PORT", "19530")
ZILLIZ_CLOUD_URI   = os.getenv("ZILLIZ_CLOUD_URI", "")
ZILLIZ_CLOUD_TOKEN = os.getenv("ZILLIZ_CLOUD_TOKEN", "")
COLLECTION_NAME    = os.getenv("MILVUS_COLLECTION", "medical_reports_final")


def _connect_milvus():
    """Connect to local Milvus OR Zilliz Cloud, whichever is configured."""
    if ZILLIZ_CLOUD_URI and ZILLIZ_CLOUD_TOKEN:
        print(f"[Milvus] Connecting to Zilliz Cloud: {ZILLIZ_CLOUD_URI}")
        connections.connect(
            "default",
            uri=ZILLIZ_CLOUD_URI,
            token=ZILLIZ_CLOUD_TOKEN,
        )
        print("[Milvus] Zilliz Cloud connected ")
    else:
        print(f"[Milvus] Connecting to local Milvus {MILVUS_HOST}:{MILVUS_PORT}")
        connections.connect("default", host=MILVUS_HOST, port=MILVUS_PORT)
        print("[Milvus] Local Milvus connected ")


class MultimodalRAGSystem:
    """
    Multimodal RAG System for Medical Reports.

    Modalities
    ----------
    • Text   → BioBERT (dmis-lab/biobert-v1.1) → 768-dim cosine search
    • Image  → ResNet50 (ImageNet pretrained)   → 2048-dim cosine search
    • Hybrid → weighted combination of both scores with re-ranking
    """

    def __init__(self, collection_name: str = COLLECTION_NAME):
        print("=" * 70)
        print("MULTIMODAL RAG SYSTEM — INITIALISING")
        print("  Text   : BioBERT (768-dim)")
        print("  Image  : ResNet50 (2048-dim)")
        print("  Vector DB: Milvus / Zilliz Cloud")
        print("=" * 70)

        self.collection_name = collection_name

        # ── 1. Connect to Milvus ─────────────────────────────────────────────
        print("\n[1/4] Connecting to vector database…")
        _connect_milvus()
        self.collection = Collection(collection_name)
        self.collection.load()
        print(f"[1/4] Collection loaded — {self.collection.num_entities} vectors")

        # ── 2. BioBERT text model ────────────────────────────────────────────
        print("\n[2/4] Loading BioBERT for text embeddings…")
        self.text_model = SentenceTransformer("dmis-lab/biobert-v1.1")
        self.text_dim   = 768
        print(f"[2/4] BioBERT ready (dim={self.text_dim})")

        # ── 3. ResNet50 image model ──────────────────────────────────────────
        print("\n[3/4] Loading ResNet50 for image embeddings…")
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print(f"      Device: {self.device}")

        resnet = models.resnet50(weights=models.ResNet50_Weights.IMAGENET1K_V1)
        # Remove the final FC layer → feature extractor
        self.image_model = torch.nn.Sequential(*list(resnet.children())[:-1])
        self.image_model.to(self.device)
        self.image_model.eval()
        self.image_dim = 2048

        self.image_transform = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],
                std =[0.229, 0.224, 0.225],
            ),
        ])
        print(f"[3/4] ResNet50 ready (dim={self.image_dim})")

        # ── 4. Search config ─────────────────────────────────────────────────
        self.search_params = {"metric_type": "COSINE", "params": {"nprobe": 16}}
        print("\n[4/4] Search parameters configured (COSINE, nprobe=16)")
        print("\n" + "=" * 70)
        print("MULTIMODAL RAG SYSTEM READY")
        print("=" * 70)

    # ─────────────────────────────────────────────────────────────────────────
    # Embedding helpers
    # ─────────────────────────────────────────────────────────────────────────

    def get_text_embedding(self, text: str) -> np.ndarray:
        """BioBERT embedding for any medical text."""
        emb = self.text_model.encode([text])[0]
        norm = np.linalg.norm(emb)
        return emb / norm if norm > 0 else emb

    def get_image_embedding(self, image_bytes: bytes) -> np.ndarray:
        """ResNet50 embedding from raw image bytes."""
        try:
            image  = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            tensor = self.image_transform(image).unsqueeze(0).to(self.device)
            with torch.no_grad():
                feat = self.image_model(tensor).squeeze().cpu().numpy()
            norm = np.linalg.norm(feat)
            return feat / norm if norm > 0 else feat
        except Exception as e:
            print(f"[RAG] image embedding error: {e}")
            return np.zeros(self.image_dim)

    def get_image_embedding_from_path(self, path: str) -> np.ndarray:
        with open(path, "rb") as f:
            return self.get_image_embedding(f.read())

    # ─────────────────────────────────────────────────────────────────────────
    # Search methods
    # ─────────────────────────────────────────────────────────────────────────

    def search_by_text(self, query: str, top_k: int = 5) -> List[Dict]:
        """BioBERT text search — used for CBC / Thyroid / X-ray report text."""
        emb = self.get_text_embedding(query)
        results = self.collection.search(
            data=[emb.tolist()],
            anns_field="text_embedding",
            param=self.search_params,
            limit=top_k,
            output_fields=["report_type", "narrative", "risk_level",
                           "consultation", "image_path"],
        )
        return self._format_results(results, modality="text")

    def search_by_image_bytes(self, image_bytes: bytes, top_k: int = 5) -> List[Dict]:
        """ResNet50 image search — used for chest X-ray images."""
        emb = self.get_image_embedding(image_bytes)
        results = self.collection.search(
            data=[emb.tolist()],
            anns_field="image_embedding",
            param=self.search_params,
            limit=top_k,
            output_fields=["report_type", "narrative", "risk_level",
                           "consultation", "image_path"],
        )
        return self._format_results(results, modality="image")

    def search_by_image_path(self, path: str, top_k: int = 5) -> List[Dict]:
        with open(path, "rb") as f:
            return self.search_by_image_bytes(f.read(), top_k)

    def hybrid_search(
        self,
        text_query: str,
        image_bytes: Optional[bytes] = None,
        top_k: int = 5,
        text_weight: float = 0.5,
    ) -> List[Dict]:
        """
        True multimodal hybrid search.

        Runs BioBERT text search AND ResNet50 image search in parallel,
        normalises both score lists to [0, 1], fuses them with weighted sum,
        then returns the top-k re-ranked results.
        """
        image_weight = 1.0 - text_weight

        # -- Text branch --
        text_results = self.search_by_text(text_query, top_k=top_k * 2)

        if image_bytes is None:
            # No image — text-only path
            return text_results[:top_k]

        # -- Image branch --
        image_results = self.search_by_image_bytes(image_bytes, top_k=top_k * 2)

        # -- Fuse by narrative key (dedup) --
        fused: Dict[str, Dict] = {}

        for r in text_results:
            key = r["narrative"][:120]
            fused[key] = {**r, "_ts": r["score"], "_is": 0.0}

        for r in image_results:
            key = r["narrative"][:120]
            if key in fused:
                fused[key]["_is"] = r["score"]
            else:
                fused[key] = {**r, "_ts": 0.0, "_is": r["score"]}

        # -- Score normalisation (min-max per branch) --
        all_ts = [v["_ts"] for v in fused.values()]
        all_is = [v["_is"] for v in fused.values()]
        ts_min, ts_max = min(all_ts), max(all_ts) if all_ts else (0, 1)
        is_min, is_max = min(all_is), max(all_is) if all_is else (0, 1)

        def norm(val, lo, hi):
            return (val - lo) / (hi - lo + 1e-9)

        for v in fused.values():
            ts_norm = norm(v["_ts"], ts_min, ts_max)
            is_norm = norm(v["_is"], is_min, is_max)
            v["score"] = text_weight * ts_norm + image_weight * is_norm
            v["modality"] = (
                "hybrid" if v["_ts"] > 0 and v["_is"] > 0
                else ("image" if v["_is"] > 0 else "text")
            )

        ranked = sorted(fused.values(), key=lambda x: x["score"], reverse=True)

        # Clean up private keys
        for r in ranked:
            r.pop("_ts", None)
            r.pop("_is", None)

        return ranked[:top_k]

    # ─────────────────────────────────────────────────────────────────────────
    # Formatting
    # ─────────────────────────────────────────────────────────────────────────

    def _format_results(self, results, modality: str = "text") -> List[Dict]:
        formatted = []
        for hits in results:
            for hit in hits:
                formatted.append({
                    "score":       float(hit.score),
                    "report_type": hit.entity.get("report_type", "Unknown"),
                    "narrative":   hit.entity.get("narrative",   "")[:500],
                    "risk_level":  hit.entity.get("risk_level",  "Unknown"),
                    "consultation": hit.entity.get("consultation", "Monitor"),
                    "image_path":  hit.entity.get("image_path",  ""),
                    "modality":    modality,
                })
        return formatted

    # ─────────────────────────────────────────────────────────────────────────
    # Utility
    # ─────────────────────────────────────────────────────────────────────────

    def get_stats(self) -> Dict:
        return {
            "collection_name": self.collection_name,
            "total_records":   self.collection.num_entities,
            "text_model":      "BioBERT (768-dim)",
            "image_model":     "ResNet50 (2048-dim)",
            "search_metric":   "Cosine Similarity",
            "backend":         "Zilliz Cloud" if ZILLIZ_CLOUD_URI else "Local Milvus",
        }

    def get_report_types(self) -> Dict:
        records = self.collection.query(
            expr="id >= 0",
            limit=self.collection.num_entities,
            output_fields=["report_type"],
        )
        counts: Dict[str, int] = {}
        for r in records:
            t = r.get("report_type", "unknown")
            counts[t] = counts.get(t, 0) + 1
        return counts

    def get_random_samples(self, n: int = 5) -> List[Dict]:
        return self.collection.query(
            expr="id >= 0",
            limit=n,
            output_fields=["report_type", "narrative", "risk_level", "consultation"],
        )

    def close(self):
        try:
            connections.disconnect("default")
        except Exception:
            pass
