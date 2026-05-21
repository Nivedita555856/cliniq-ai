# image_analyzer.py
# Medical Image Analyzer - Handles Chest X-rays, CBC reports, Thyroid reports
# torch/torchvision imported lazily — not required when RAG is disabled

from PIL import Image
import numpy as np
import io
import pytesseract
import re
from typing import Dict, List, Optional
import warnings
warnings.filterwarnings('ignore')

# Lazy torch availability flag
_TORCH_AVAILABLE = None

def _check_torch():
    global _TORCH_AVAILABLE
    if _TORCH_AVAILABLE is None:
        try:
            import torch  # noqa
            _TORCH_AVAILABLE = True
        except ImportError:
            _TORCH_AVAILABLE = False
    return _TORCH_AVAILABLE


class MedicalImageAnalyzer:
    """
    Analyze medical images:
    - Chest X-rays (image analysis + embeddings if torch available)
    - CBC/Thyroid report images (OCR text extraction — always works)
    """

    def __init__(self):
        print("Initializing Medical Image Analyzer...")
        self.model = None
        self.transform = None
        self.device = None

        if _check_torch():
            try:
                import torch
                import torchvision.transforms as transforms
                import torchvision.models as models

                self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
                resnet = models.resnet50(weights=models.ResNet50_Weights.IMAGENET1K_V1)
                self.model = torch.nn.Sequential(*list(resnet.children())[:-1])
                self.model.to(self.device)
                self.model.eval()
                self.transform = transforms.Compose([
                    transforms.Resize((224, 224)),
                    transforms.ToTensor(),
                    transforms.Normalize(
                        mean=[0.485, 0.456, 0.406],
                        std=[0.229, 0.224, 0.225]
                    ),
                ])
                print(f"   ResNet50 loaded on {self.device}")
            except Exception as e:
                print(f"   ResNet50 unavailable: {e} — X-ray embeddings disabled")
        else:
            print("   torch not installed — X-ray embeddings disabled, OCR still works")

        print("Medical Image Analyzer ready")

    # ── Image type detection ────────────────────────────────────────────────────

    def detect_image_type(self, text: str = "", image_bytes: bytes = None) -> str:
        if text:
            t = text.lower()
            if any(w in t for w in ['cbc', 'hemoglobin', 'wbc', 'platelet']):
                return 'cbc_report'
            if any(w in t for w in ['tsh', 't3', 't4', 'thyroid']):
                return 'thyroid_report'
        if image_bytes:
            try:
                image = Image.open(io.BytesIO(image_bytes))
                w, h = image.size
                ratio = w / h
                if 0.8 < ratio < 1.3:
                    return 'chest_xray'
            except Exception:
                pass
        return 'unknown'

    # ── OCR ────────────────────────────────────────────────────────────────────

    def extract_text_from_report_image(self, image_bytes: bytes) -> str:
        try:
            image = Image.open(io.BytesIO(image_bytes)).convert('L')
            image = image.point(lambda p: p > 150 and 255)
            if image.width > 2000:
                ratio = 2000 / image.width
                image = image.resize((2000, int(image.height * ratio)))
            return pytesseract.image_to_string(image).strip()
        except Exception as e:
            return f"OCR Error: {e}"

    # ── X-ray embedding ────────────────────────────────────────────────────────

    def extract_xray_embedding(self, image_bytes: bytes) -> np.ndarray:
        if self.model is None or not _check_torch():
            return np.zeros(2048)
        try:
            import torch
            image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            tensor = self.transform(image).unsqueeze(0).to(self.device)
            with torch.no_grad():
                emb = self.model(tensor).squeeze().cpu().numpy()
            norm = np.linalg.norm(emb)
            return emb / norm if norm > 0 else emb
        except Exception as e:
            print(f"Embedding error: {e}")
            return np.zeros(2048)

    # ── X-ray analysis ─────────────────────────────────────────────────────────

    def analyze_xray(self, image_bytes: bytes, clinical_context: str = "") -> Dict:
        try:
            image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            arr = np.array(image.convert('L'))
            brightness, contrast = float(arr.mean()), float(arr.std())
            issues = []
            if brightness < 100: issues.append("Image appears underexposed")
            if brightness > 200: issues.append("Image appears overexposed")
            if contrast < 40:    issues.append("Image has low contrast")
            embedding = self.extract_xray_embedding(image_bytes)
            return {
                'image_type': 'chest_xray',
                'dimensions': image.size,
                'brightness': brightness,
                'contrast': contrast,
                'quality_issues': issues,
                'embedding': embedding.tolist(),
                'embedding_dim': len(embedding),
                'clinical_context': clinical_context,
                'recommendation': (
                    "Image quality may affect analysis." if issues
                    else "Image quality is adequate for analysis."
                ),
            }
        except Exception as e:
            return {'error': str(e), 'image_type': 'unknown'}

    # ── Main entry points ──────────────────────────────────────────────────────

    def analyze_image(self, image_bytes: bytes, clinical_context: str = "") -> Dict:
        return self.analyze(image_bytes, clinical_context)

    def analyze(self, image_bytes: bytes, clinical_context: str = "") -> Dict:
        ocr_text = self.extract_text_from_report_image(image_bytes)
        image_type = self.detect_image_type(ocr_text, image_bytes)

        if image_type == 'chest_xray':
            return self.analyze_xray(image_bytes, clinical_context)
        elif image_type in ('cbc_report', 'thyroid_report'):
            return {
                'image_type': image_type,
                'ocr_text': ocr_text,
                'extracted_text': ocr_text,
                'recommendation': 'Text extracted via OCR. Ready for medical parsing.',
            }
        else:
            return {
                'image_type': 'unknown',
                'ocr_text': ocr_text,
                'extracted_text': ocr_text,
                'recommendation': 'Could not determine image type. Text extraction attempted.',
            }

    def get_supported_formats(self) -> List[str]:
        return ['png', 'jpg', 'jpeg', 'bmp', 'tiff']
