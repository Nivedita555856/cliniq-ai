# image_analyzer.py
# Medical Image Analyzer - Handles Chest X-rays, CBC reports, Thyroid reports

import torch
import torchvision.transforms as transforms
import torchvision.models as models
from PIL import Image
import numpy as np
import io
import pytesseract
import re
from typing import Dict, List, Tuple, Optional
import warnings
warnings.filterwarnings('ignore')

class MedicalImageAnalyzer:
    """
    Analyze medical images:
    - Chest X-rays (image analysis + embeddings)
    - CBC/Thyroid report images (OCR text extraction)
    """
    
    def __init__(self):
        print("Initializing Medical Image Analyzer...")
        
        # Set Tesseract path for Windows (uncomment if needed)
        # pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
        
        # Use device (GPU if available)
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print(f"   Using device: {self.device}")
        
        # Load pre-trained ResNet50 for X-ray feature extraction
        self.model = models.resnet50(weights=models.ResNet50_Weights.IMAGENET1K_V1)
        self.model = torch.nn.Sequential(*list(self.model.children())[:-1])
        self.model.to(self.device)
        self.model.eval()
        
        # Image preprocessing for X-rays
        self.transform = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
        ])
        
        print("Medical Image Analyzer ready")
    
    # ============================================
    # DETECT IMAGE TYPE
    # ============================================
    
    def detect_image_type(self, text: str = "", image_bytes: bytes = None) -> str:
        """
        Detect if image is Chest X-ray or Scanned Report
        """
        # If text is provided (from OCR), check for medical terms
        if text:
            text_lower = text.lower()
            if any(word in text_lower for word in ['cbc', 'hemoglobin', 'wbc', 'platelet']):
                return 'cbc_report'
            if any(word in text_lower for word in ['tsh', 't3', 't4', 'thyroid']):
                return 'thyroid_report'
        
        # If image bytes provided, check image properties
        if image_bytes:
            try:
                image = Image.open(io.BytesIO(image_bytes))
                img_array = np.array(image.convert('L'))
                
                # Chest X-rays typically have:
                # - Larger dimensions
                # - Specific aspect ratio
                # - Dark background with bright lung fields
                width, height = image.size
                aspect_ratio = width / height
                
                # Chest X-ray heuristic
                if aspect_ratio > 0.8 and aspect_ratio < 1.3:
                    return 'chest_xray'
            except:
                pass
        
        return 'unknown'
    
    # ============================================
    # OCR FOR CBC/THYROID REPORT IMAGES
    # ============================================
    
    def extract_text_from_report_image(self, image_bytes: bytes) -> str:
        """
        Extract text from CBC/Thyroid report image using OCR
        """
        try:
            image = Image.open(io.BytesIO(image_bytes))
            
            # Preprocess for better OCR
            image = image.convert('L')  # Grayscale
            # Increase contrast
            image = image.point(lambda p: p > 150 and 255)
            
            # Resize if too large
            if image.width > 2000:
                ratio = 2000 / image.width
                new_size = (2000, int(image.height * ratio))
                image = image.resize(new_size)
            
            # OCR
            text = pytesseract.image_to_string(image)
            return text.strip()
        except Exception as e:
            return f"OCR Error: {e}"
    
    # ============================================
    # CHEST X-RAY ANALYSIS
    # ============================================
    
    def extract_xray_embedding(self, image_bytes: bytes) -> np.ndarray:
        """
        Extract embedding vector from chest X-ray image
        Returns 2048-dimensional embedding vector
        """
        try:
            image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            tensor = self.transform(image).unsqueeze(0).to(self.device)
            
            with torch.no_grad():
                embedding = self.model(tensor)
                embedding = embedding.squeeze().cpu().numpy()
                
                if np.linalg.norm(embedding) > 0:
                    embedding = embedding / np.linalg.norm(embedding)
            
            return embedding
        except Exception as e:
            print(f"Error extracting embedding: {e}")
            return np.zeros(2048)
    
    def analyze_xray(self, image_bytes: bytes, clinical_context: str = "") -> Dict:
        """
        Analyze chest X-ray image
        """
        try:
            image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            
            # Image quality assessment
            img_array = np.array(image.convert('L'))
            brightness = img_array.mean()
            contrast = img_array.std()
            
            quality_issues = []
            if brightness < 100:
                quality_issues.append("Image appears underexposed")
            if brightness > 200:
                quality_issues.append("Image appears overexposed")
            if contrast < 40:
                quality_issues.append("Image has low contrast")
            
            # Extract embedding
            embedding = self.extract_xray_embedding(image_bytes)
            
            return {
                'image_type': 'chest_xray',
                'dimensions': image.size,
                'brightness': float(brightness),
                'contrast': float(contrast),
                'quality_issues': quality_issues,
                'embedding': embedding.tolist(),
                'embedding_dim': len(embedding),
                'clinical_context': clinical_context,
                'recommendation': self._get_xray_recommendation(quality_issues)
            }
            
        except Exception as e:
            return {'error': str(e), 'image_type': 'unknown'}
    
    def _get_xray_recommendation(self, quality_issues: List[str]) -> str:
        """Generate recommendation for X-ray"""
        if quality_issues:
            return "Image quality may affect analysis. Please ensure proper exposure and contrast."
        return "Image quality is adequate for analysis."
    
    # ============================================
    # MAIN ANALYSIS METHOD
    # ============================================
    
    def analyze_image(self, image_bytes: bytes, clinical_context: str = "") -> Dict:
        """Alias for analyze() — used by api.py"""
        return self.analyze(image_bytes, clinical_context)

    def analyze(self, image_bytes: bytes, clinical_context: str = "") -> Dict:
        """
        Main method to analyze any medical image
        Returns appropriate analysis based on image type
        """
        # First, try to extract text via OCR
        ocr_text = self.extract_text_from_report_image(image_bytes)
        
        # Detect image type
        image_type = self.detect_image_type(ocr_text, image_bytes)
        
        if image_type == 'chest_xray':
            # For chest X-rays, use image analysis
            return self.analyze_xray(image_bytes, clinical_context)
        
        elif image_type == 'cbc_report' or image_type == 'thyroid_report':
            # For report images, return OCR text for further parsing
            return {
                'image_type': image_type,
                'ocr_text': ocr_text,
                'extracted_text': ocr_text,
                'recommendation': 'Text extracted via OCR. Ready for medical parsing.'
            }
        
        else:
            # Unknown image type - try OCR anyway
            return {
                'image_type': 'unknown',
                'ocr_text': ocr_text,
                'extracted_text': ocr_text,
                'recommendation': 'Could not determine image type. Text extraction attempted.'
            }
    
    def get_supported_formats(self) -> List[str]:
        """Return list of supported image formats"""
        return ['png', 'jpg', 'jpeg', 'bmp', 'tiff']


# ============================================
# TEST FUNCTION
# ============================================

def test_analyzer():
    """Test the Medical Image Analyzer"""
    print("\n" + "="*60)
    print("TESTING MEDICAL IMAGE ANALYZER")
    print("="*60)
    
    analyzer = MedicalImageAnalyzer()
    print(f"\nSupported formats: {analyzer.get_supported_formats()}")
    
    # Test with a synthetic CBC report image
    from PIL import ImageDraw, ImageFont
    
    # Create a synthetic CBC report image
    img = Image.new('RGB', (800, 400), color='white')
    draw = ImageDraw.Draw(img)
    
    cbc_text = """CBC REPORT
Patient: John Doe
Hemoglobin: 10.2 g/dL
WBC: 14.5 x10^3/uL
Platelets: 180 x10^3/uL"""
    
    draw.text((50, 50), cbc_text, fill='black')
    
    # Save to bytes
    img_bytes = io.BytesIO()
    img.save(img_bytes, format='PNG')
    img_bytes = img_bytes.getvalue()
    
    # Analyze
    result = analyzer.analyze(img_bytes)
    print(f"\nCBC Report Image Analysis:")
    print(f"   Image Type: {result.get('image_type')}")
    print(f"   OCR Text: {result.get('ocr_text', '')[:100]}...")
    
    return analyzer


if __name__ == "__main__":
    test_analyzer()