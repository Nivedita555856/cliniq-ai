# api.py
# ClinIQ AI — FastAPI Backend  v4.1
# True Multimodal RAG: BioBERT text + ResNet50 image → Milvus → Groq LLM
# Graceful fallback: Groq-only mode when Milvus is unavailable

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv()

# ── Custom modules ─────────────────────────────────────────────────────────────
from parser import MedicalReportParser
from image_analyzer import MedicalImageAnalyzer

# RAG system is imported lazily inside get_rag() to avoid loading
# heavy ML models (BioBERT/ResNet50) when Zilliz Cloud is not configured.
RAG_MODULE_AVAILABLE = True   # will be set False if import fails at runtime

# ── Config ─────────────────────────────────────────────────────────────────────
GROQ_API_KEY    = os.getenv("GROQ_API_KEY", "")
OPENAI_API_KEY  = os.getenv("OPENAI_API_KEY", "")
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",")]

# ── FastAPI ────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="ClinIQ AI API",
    description="Multimodal RAG API — BioBERT + ResNet50 + Milvus + Groq LLM",
    version="4.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Pydantic models ────────────────────────────────────────────────────────────
class TextAnalysisRequest(BaseModel):
    report_text: str = Field(..., description="Medical report text")
    top_k: Optional[int] = Field(5)

class AIAnalysisRequest(BaseModel):
    text: str
    is_xray: Optional[bool] = False
    clinical_context: Optional[str] = ""

class SearchRequest(BaseModel):
    query: str
    top_k: Optional[int] = Field(5)

# ── Lazy singletons ────────────────────────────────────────────────────────────
_parser       = None
_rag_system   = None
_img_analyzer = None
_rag_error    = None   # cached error string — stops repeated reconnect attempts


def get_parser():
    global _parser
    if _parser is None:
        _parser = MedicalReportParser()
    return _parser


def get_rag():
    """
    Return the MultimodalRAGSystem singleton, or None if unavailable.
    Only attempts to load heavy ML models when ZILLIZ_CLOUD_URI is configured.
    Failure is cached so we don't retry on every request.
    """
    global _rag_system, _rag_error, RAG_MODULE_AVAILABLE
    if _rag_system is not None:
        return _rag_system
    if _rag_error is not None:
        return None   # already failed — don't retry
    # Skip entirely if Zilliz not configured — avoids loading BioBERT/ResNet50
    zilliz_uri = os.getenv("ZILLIZ_CLOUD_URI", "")
    milvus_host = os.getenv("MILVUS_HOST", "localhost")
    if not zilliz_uri and milvus_host == "localhost":
        _rag_error = "No vector DB configured — Groq-only mode"
        print("[RAG] No Zilliz Cloud URI set — skipping RAG, running Groq-only mode.")
        return None
    try:
        from rag_system import MultimodalRAGSystem
        _rag_system = MultimodalRAGSystem()
        return _rag_system
    except ImportError as e:
        RAG_MODULE_AVAILABLE = False
        _rag_error = f"RAG packages not installed: {e}"
        print(f"[RAG] ML packages not installed — Groq-only mode.")
        return None
    except Exception as e:
        _rag_error = str(e)
        print(f"[RAG] Milvus unavailable — running in Groq-only mode. ({e})")
        return None


def get_img_analyzer():
    global _img_analyzer
    if _img_analyzer is None:
        _img_analyzer = MedicalImageAnalyzer()
    return _img_analyzer


def get_groq_client():
    if not GROQ_API_KEY:
        return None
    try:
        from groq import Groq
        return Groq(api_key=GROQ_API_KEY)
    except ImportError:
        return None


# ══════════════════════════════════════════════════════════════════════════════
# HELPERS  (all defined here, before any endpoint, to avoid forward-ref issues)
# ══════════════════════════════════════════════════════════════════════════════

def _risk_from_values(values: Dict) -> str:
    """Score-based risk from numeric lab values."""
    score = 0
    if "Hemoglobin" in values:
        h = values["Hemoglobin"]
        score += 4 if h < 7 else 3 if h < 8 else 2 if h < 10 else 1 if h < 12 else 0
    if "WBC" in values:
        w = values["WBC"]
        score += 4 if w > 20 else 3 if w > 15 else 2 if w > 11 else 2 if w < 3 else 0
    if "Platelets" in values:
        p = values["Platelets"]
        score += 3 if p < 50 else 2 if p < 100 else 2 if p > 600 else 0
    if "TSH" in values:
        t = values["TSH"]
        score += 4 if t > 20 else 3 if t > 10 else 2 if t > 4.5 else 3 if t < 0.1 else 2 if t < 0.4 else 0
    if score >= 4: return "HIGH RISK"
    if score >= 2: return "MODERATE RISK"
    if score >= 1: return "LOW TO MODERATE RISK"
    return "LOW RISK"


def _consultation(risk: str) -> str:
    if "HIGH"     in risk: return "Consult Doctor Immediately — Urgent attention required"
    if "MODERATE" in risk: return "Schedule Appointment — See doctor within 1–2 weeks"
    return "Monitor at Home — Routine follow-up as clinically indicated"


def _infer_xray_risk(cases: List[Dict], clinical_ctx: str) -> str:
    """Infer X-ray risk: keyword override from context, then majority vote from cases."""
    ctx = clinical_ctx.lower()
    if "pneumonia" in ctx or "consolidation" in ctx:
        return "HIGH RISK"
    if "cardiomegaly" in ctx and ("heart failure" in ctx or "chf" in ctx):
        return "HIGH RISK"
    if "cardiomegaly" in ctx:
        return "MODERATE RISK"
    if "effusion" in ctx:
        return "MODERATE RISK"
    if "normal" in ctx or "clear" in ctx:
        return "LOW RISK"
    if cases:
        high = sum(1 for c in cases[:3] if "HIGH"     in c.get("risk_level", ""))
        mod  = sum(1 for c in cases[:3] if "MODERATE" in c.get("risk_level", ""))
        if high >= 2:       return "HIGH RISK"
        if high + mod >= 2: return "MODERATE RISK"
    return "UNKNOWN"


def _brief_analysis_text(parsed: Dict, cases: List[Dict], risk: str) -> str:
    """Plain-text summary (used in response.analysis field)."""
    lines = [f"Report: {parsed.get('type','?')}  |  Risk: {risk}"]
    for k, v in parsed.get("values", {}).items():
        lines.append(f"  {k}: {v}")
    for item in parsed.get("interpretation", []):
        lines.append(f"  • {item}")
    if cases:
        lines.append(f"\n{len(cases)} similar case(s) retrieved via RAG:")
        for c in cases[:3]:
            lines.append(f"  – {c.get('report_type','?')}  {round(c.get('score',0)*100)}%  {c.get('risk_level','?')}")
    return "\n".join(lines)


def _rag_augmented_analysis(
    *,
    report_text:      str,
    parsed:           Dict,
    similar_cases:    List[Dict],
    risk_level:       str,
    search_mode:      str,
    is_xray:          bool = False,
    clinical_context: str  = "",
    rag_active:       bool = True,
) -> Optional[str]:
    """
    TRUE RAG PATTERN — Retrieve → Augment → Generate.

    Retrieved Milvus cases are injected into the Groq prompt as grounded
    context. When rag_active=False (Milvus down), runs Groq-only analysis
    on the report text alone — still useful, just not retrieval-augmented.
    """
    client = get_groq_client()
    if not client:
        return None

    # ── Build retrieval context block ─────────────────────────────────────────
    if similar_cases and rag_active:
        rag_block = "\n\n── RETRIEVED SIMILAR CASES (Milvus vector search) ──\n"
        for i, c in enumerate(similar_cases[:4]):
            pct = round(c.get("score", 0) * 100)
            mod = c.get("modality", search_mode)
            rag_block += (
                f"\n[Case {i+1}]  {c.get('report_type','?')}  "
                f"| {pct}% match  | {mod} embedding\n"
                f"  Risk    : {c.get('risk_level','?')}\n"
                f"  Consult : {c.get('consultation','?')}\n"
            )
            if c.get("narrative"):
                rag_block += f"  Notes   : {c['narrative'][:200].replace(chr(10),' ')}…\n"
    else:
        rag_block = (
            "\n\n[Note: Milvus vector database is offline — "
            "analysis is based on the report text alone without retrieved examples.]\n"
        ) if not rag_active else ""

    # ── Build current case block ──────────────────────────────────────────────
    values_str = (
        "  " + "\n  ".join(f"{k}: {v}" for k, v in parsed.get("values", {}).items())
    ) if parsed.get("values") else "  (no numeric values extracted)"

    findings_str = (
        "  " + "\n  ".join(parsed.get("interpretation", []))
    ) if parsed.get("interpretation") else "  (no specific findings)"

    if is_xray:
        current_block = (
            f"\n\n── CURRENT CASE ──\n"
            f"  Report Type     : Chest X-ray\n"
            f"  Clinical Context: {clinical_context or 'Not provided'}\n"
            f"  Initial Risk    : {risk_level}\n"
        )
        task = (
            "Based on the retrieved similar cases (if any) and the clinical context:\n"
            "1. Identify the most likely finding (pneumonia / cardiomegaly / effusion / normal)\n"
            "2. Justify the risk level with specific clinical reasoning\n"
            "3. Give one targeted clinical recommendation\n"
        )
    else:
        current_block = (
            f"\n\n── CURRENT CASE ──\n"
            f"  Report Type : {parsed.get('type','Unknown')}\n"
            f"  Lab Values  :\n{values_str}\n"
            f"  Findings    :\n{findings_str}\n"
            f"  Initial Risk: {risk_level}\n"
        )
        task = (
            "Based on the retrieved similar cases (if any) and the lab values:\n"
            "1. Compare with similar cases — note patterns that match\n"
            "2. Identify key abnormal findings and their clinical significance\n"
            "3. Confirm or adjust the risk level with justification\n"
            "4. Give one specific recommendation\n"
        )

    mode_desc = {
        "text":   "BioBERT semantic text search",
        "image":  "ResNet50 visual feature search",
        "hybrid": "BioBERT + ResNet50 hybrid search",
    }.get(search_mode, search_mode)

    retrieval_note = (
        f"Retrieval method: {mode_desc} → Milvus vector database → Groq Llama 3.\n"
        if rag_active else
        "Running in Groq-only mode (Milvus offline).\n"
    )

    prompt = (
        f"You are a clinical AI assistant using {'Retrieval-Augmented Generation (RAG)' if rag_active else 'direct LLM analysis'}.\n"
        f"{retrieval_note}"
        f"{rag_block}"
        f"{current_block}\n\n"
        f"{task}"
        f"\nKeep response under 200 words. Be concise and professional.\n"
        f"End with: \"️ AI-assisted — confirm with a qualified clinician.\""
    )

    try:
        resp = get_groq_client().chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.25,
            max_tokens=480,
        )
        return resp.choices[0].message.content
    except Exception as e:
        return f"AI analysis error: {e}"


# ══════════════════════════════════════════════════════════════════════════════
# ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/")
async def root():
    rag = get_rag()
    return {
        "app":     "ClinIQ AI",
        "version": "4.1.0",
        "rag":     "active" if rag else "offline (Groq-only mode)",
        "groq":    "configured" if GROQ_API_KEY else "missing",
        "docs":    "/docs",
    }


@app.get("/health")
async def health():
    rag      = get_rag()
    rag_ok   = rag is not None
    records  = 0
    rag_msg  = _rag_error or "not initialised"
    if rag_ok:
        try:
            records = rag.get_stats()["total_records"]
            rag_msg = f"{records} vectors"
        except Exception as e:
            rag_msg = str(e)
    return {
        "status":         "healthy",
        "milvus":         rag_ok,
        "milvus_message": rag_msg,
        "rag_active":     rag_ok,
        "groq":           bool(GROQ_API_KEY),
        "total_records":  records,
        "mode":           "full RAG" if rag_ok else "Groq-only",
        "timestamp":      datetime.now().isoformat(),
    }


# ── /analyze/text — BioBERT RAG (or Groq-only) ────────────────────────────────
@app.post("/analyze/text")
async def analyze_text(req: TextAnalysisRequest):
    """
    Text report analysis (CBC / Thyroid / Chest X-ray text).
    With Milvus: BioBERT embed → search → RAG-augmented Groq.
    Without Milvus: parse + Groq-only analysis.
    """
    try:
        parser = get_parser()
        rag    = get_rag()

        # 1. Parse report
        parsed     = parser.parse(req.report_text)
        risk_level = parsed.get("risk_level", "UNKNOWN")
        if parsed.get("values"):
            calc = _risk_from_values(parsed["values"])
            if calc != "LOW RISK":
                risk_level = calc

        # 2. BioBERT search (skipped if Milvus down)
        similar_cases = []
        if rag:
            try:
                similar_cases = rag.search_by_text(req.report_text, top_k=req.top_k)
            except Exception as e:
                print(f"[RAG search] {e}")

        # 3. RAG-augmented (or Groq-only) generation
        groq_analysis = _rag_augmented_analysis(
            report_text=req.report_text,
            parsed=parsed,
            similar_cases=similar_cases,
            risk_level=risk_level,
            search_mode="text",
            is_xray="Chest" in parsed.get("type", ""),
            clinical_context="",
            rag_active=bool(similar_cases),
        )

        return {
            "success":          True,
            "report_type":      parsed.get("type", "Unknown"),
            "extracted_values": parsed.get("values", {}),
            "interpretation":   parsed.get("interpretation", []),
            "risk_level":       risk_level,
            "consultation":     _consultation(risk_level),
            "similar_cases":    similar_cases,
            "search_mode":      "text",
            "search_model":     "BioBERT (768-dim)" if rag else "N/A",
            "rag_active":       bool(rag),
            "groq_analysis":    groq_analysis,
            "analysis":         _brief_analysis_text(parsed, similar_cases, risk_level),
            "timestamp":        datetime.now().isoformat(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── /analyze/image — ResNet50 RAG (or Groq-only) ──────────────────────────────
@app.post("/analyze/image")
async def analyze_image(
    file: UploadFile = File(...),
    clinical_context: Optional[str] = Form(None),
):
    """
    Chest X-ray image analysis.
    With Milvus: ResNet50 embed → image search (+ optional BioBERT hybrid).
    Without Milvus: image quality check + Groq-only from clinical context.
    """
    try:
        if file.content_type not in ("image/png", "image/jpeg", "image/jpg"):
            raise HTTPException(status_code=400, detail="Only PNG/JPG images are supported")

        image_bytes  = await file.read()
        rag          = get_rag()
        similar_cases = []
        search_mode  = "image"

        if rag:
            try:
                # ResNet50 image search
                img_cases = rag.search_by_image_bytes(image_bytes, top_k=6)
                # Hybrid if clinical context provided
                if clinical_context and clinical_context.strip():
                    similar_cases = rag.hybrid_search(
                        text_query=clinical_context,
                        image_bytes=image_bytes,
                        top_k=5,
                        text_weight=0.45,
                    )
                    search_mode = "hybrid"
                else:
                    similar_cases = img_cases[:5]
            except Exception as e:
                print(f"[RAG image search] {e}")

        risk_level   = _infer_xray_risk(similar_cases, clinical_context or "")
        img_analyzer = get_img_analyzer()
        image_analysis = img_analyzer.analyze_image(image_bytes, clinical_context or "")

        parsed = {"type": "Chest X-ray", "values": {}, "interpretation": []}
        groq_analysis = _rag_augmented_analysis(
            report_text=clinical_context or "",
            parsed=parsed,
            similar_cases=similar_cases,
            risk_level=risk_level,
            search_mode=search_mode,
            is_xray=True,
            clinical_context=clinical_context or "",
            rag_active=bool(similar_cases),
        )

        return {
            "success":          True,
            "report_type":      "Chest X-ray",
            "extracted_values": {},
            "interpretation":   [],
            "risk_level":       risk_level,
            "consultation":     _consultation(risk_level),
            "similar_cases":    similar_cases,
            "search_mode":      search_mode,
            "search_model":     (
                "BioBERT + ResNet50 hybrid" if search_mode == "hybrid"
                else "ResNet50 (2048-dim)" if rag
                else "N/A"
            ),
            "rag_active":       bool(rag),
            "image_analysis":   image_analysis,
            "groq_analysis":    groq_analysis,
            "timestamp":        datetime.now().isoformat(),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── /analyze/complete — unified (text + file + image) ─────────────────────────
@app.post("/analyze/complete")
async def analyze_complete(
    file: Optional[UploadFile] = File(None),
    text: Optional[str] = Form(None),
    clinical_context: Optional[str] = Form(None),
):
    """
    Unified endpoint — handles plain text, PDF, DOCX, TXT, and images.
    Picks the right RAG modality automatically. Falls back to Groq-only
    if Milvus is unavailable.
    """
    try:
        parser         = get_parser()
        rag            = get_rag()
        extracted_text = text or ""
        is_image       = False
        image_bytes_   = None

        # ── Determine input ──────────────────────────────────────────────────
        if file:
            raw = await file.read()
            ext = (file.filename or "").rsplit(".", 1)[-1].lower()
            if ext in ("png", "jpg", "jpeg"):
                is_image     = True
                image_bytes_ = raw
            elif ext == "pdf":
                extracted_text, _ = parser.extract_from_pdf(raw)
            elif ext == "docx":
                extracted_text, _ = parser.extract_from_docx(raw)
            elif ext == "txt":
                extracted_text, _ = parser.extract_from_txt(raw)
            else:
                raise HTTPException(status_code=400, detail=f"Unsupported file type: .{ext}")

        # ── Image path ───────────────────────────────────────────────────────
        if is_image and image_bytes_:
            similar_cases = []
            search_mode   = "image"

            if rag:
                try:
                    img_cases = rag.search_by_image_bytes(image_bytes_, top_k=6)
                    if clinical_context and clinical_context.strip():
                        similar_cases = rag.hybrid_search(
                            clinical_context, image_bytes_, top_k=5, text_weight=0.45
                        )
                        search_mode = "hybrid"
                    else:
                        similar_cases = img_cases[:5]
                except Exception as e:
                    print(f"[RAG image] {e}")

            risk_level    = _infer_xray_risk(similar_cases, clinical_context or "")
            img_analyzer  = get_img_analyzer()
            image_analysis = img_analyzer.analyze_image(image_bytes_, clinical_context or "")
            parsed         = {"type": "Chest X-ray", "values": {}, "interpretation": []}

            groq_analysis = _rag_augmented_analysis(
                report_text=clinical_context or "",
                parsed=parsed,
                similar_cases=similar_cases,
                risk_level=risk_level,
                search_mode=search_mode,
                is_xray=True,
                clinical_context=clinical_context or "",
                rag_active=bool(similar_cases),
            )

            return {
                "success":          True,
                "report_type":      "Chest X-ray",
                "extracted_values": {},
                "interpretation":   [],
                "risk_level":       risk_level,
                "consultation":     _consultation(risk_level),
                "similar_cases":    similar_cases,
                "search_mode":      search_mode,
                "search_model":     "BioBERT + ResNet50 hybrid" if search_mode == "hybrid" else ("ResNet50 (2048-dim)" if rag else "N/A"),
                "rag_active":       bool(rag),
                "image_analysis":   image_analysis,
                "groq_analysis":    groq_analysis,
                "analysis":         "Chest X-ray analysed. See AI analysis for details.",
                "timestamp":        datetime.now().isoformat(),
            }

        # ── Text path ────────────────────────────────────────────────────────
        if not extracted_text.strip():
            raise HTTPException(status_code=400, detail="No text or valid file provided")

        parsed     = parser.parse(extracted_text)
        risk_level = parsed.get("risk_level", "UNKNOWN")
        if parsed.get("values"):
            calc = _risk_from_values(parsed["values"])
            if calc != "LOW RISK":
                risk_level = calc

        similar_cases = []
        if rag:
            try:
                similar_cases = rag.search_by_text(extracted_text, top_k=5)
            except Exception as e:
                print(f"[RAG text] {e}")

        is_xray_text  = "Chest" in parsed.get("type", "")
        groq_analysis = _rag_augmented_analysis(
            report_text=extracted_text,
            parsed=parsed,
            similar_cases=similar_cases,
            risk_level=risk_level,
            search_mode="text",
            is_xray=is_xray_text,
            clinical_context=clinical_context or "",
            rag_active=bool(similar_cases),
        )

        return {
            "success":          True,
            "report_type":      parsed.get("type", "Unknown"),
            "extracted_values": parsed.get("values", {}),
            "interpretation":   parsed.get("interpretation", []),
            "risk_level":       risk_level,
            "consultation":     _consultation(risk_level),
            "similar_cases":    similar_cases,
            "search_mode":      "text",
            "search_model":     "BioBERT (768-dim)" if rag else "N/A",
            "rag_active":       bool(rag),
            "groq_analysis":    groq_analysis,
            "analysis":         _brief_analysis_text(parsed, similar_cases, risk_level),
            "timestamp":        datetime.now().isoformat(),
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── /analyze/ai ───────────────────────────────────────────────────────────────
@app.post("/analyze/ai")
async def get_ai_analysis(req: AIAnalysisRequest):
    """Groq analysis — with RAG context if Milvus available, without if not."""
    try:
        parser = get_parser()
        rag    = get_rag()

        parsed        = parser.parse(req.text) if req.text else {"type": "?", "values": {}, "interpretation": []}
        similar_cases = []
        if rag and req.text:
            try:
                similar_cases = rag.search_by_text(req.text, top_k=4)
            except Exception:
                pass

        analysis = _rag_augmented_analysis(
            report_text=req.text,
            parsed=parsed,
            similar_cases=similar_cases,
            risk_level="UNKNOWN",
            search_mode="text",
            is_xray=req.is_xray or False,
            clinical_context=req.clinical_context or "",
            rag_active=bool(similar_cases),
        )
        return {
            "success":     True,
            "analysis":    analysis or "AI analysis not available — check GROQ_API_KEY",
            "search_mode": "text",
            "rag_active":  bool(rag),
            "cases_used":  len(similar_cases),
            "timestamp":   datetime.now().isoformat(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── /search ───────────────────────────────────────────────────────────────────
@app.post("/search")
async def search(req: SearchRequest):
    rag = get_rag()
    if not rag:
        return {
            "success":       False,
            "query":         req.query,
            "results":       [],
            "total_results": 0,
            "message":       "Milvus offline — search unavailable",
            "rag_active":    False,
            "timestamp":     datetime.now().isoformat(),
        }
    try:
        results = rag.search_by_text(req.query, top_k=req.top_k)
        return {
            "success":       True,
            "query":         req.query,
            "results":       results,
            "total_results": len(results),
            "search_mode":   "text (BioBERT)",
            "rag_active":    True,
            "timestamp":     datetime.now().isoformat(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



# ── /parse/file ───────────────────────────────────────────────────────────────
@app.post("/parse/file")
async def parse_file(file: UploadFile = File(...)):
    """Parse uploaded file and return extracted text."""
    try:
        content     = await file.read()
        parser      = get_parser()
        text, ftype = parser.parse_file(content, file.filename)
        return {
            "success":        True,
            "filename":       file.filename,
            "file_type":      ftype,
            "extracted_text": text[:5000],
            "text_length":    len(text),
            "timestamp":      datetime.now().isoformat(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── /stats ────────────────────────────────────────────────────────────────────
@app.get("/stats")
async def get_stats():
    """System stats — collection info and RAG status."""
    rag = get_rag()
    if not rag:
        return {
            "success":      True,
            "collection":   {"message": "Milvus offline", "total_records": 0},
            "report_types": {},
            "groq":         bool(GROQ_API_KEY),
            "rag_active":   False,
            "mode":         "Groq-only",
            "timestamp":    datetime.now().isoformat(),
        }
    try:
        return {
            "success":      True,
            "collection":   rag.get_stats(),
            "report_types": rag.get_report_types(),
            "groq":         bool(GROQ_API_KEY),
            "rag_active":   True,
            "mode":         "full RAG",
            "timestamp":    datetime.now().isoformat(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── entry ─────────────────────────────────────────────────────────────────────

# ══════════════════════════════════════════════════════════════════════════════
# DISEASE ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

try:
    from disease_data import get_all_diseases, get_disease_by_id, CATEGORIES, SEVERITY
    DISEASE_MODULE_AVAILABLE = True
except ImportError as _de:
    print(f"[Disease] module import failed: {_de}")
    DISEASE_MODULE_AVAILABLE = False


@app.get("/diseases")
async def list_diseases():
    """Return all 20 diseases with full structured data."""
    if not DISEASE_MODULE_AVAILABLE:
        raise HTTPException(status_code=500, detail="Disease module unavailable")
    return {
        "success":    True,
        "diseases":   get_all_diseases(),
        "total":      20,
        "categories": CATEGORIES,
        "severity":   SEVERITY,
        "timestamp":  datetime.now().isoformat(),
    }


@app.get("/diseases/{disease_id}")
async def get_disease(disease_id: str):
    """Return full details for a single disease by id slug."""
    if not DISEASE_MODULE_AVAILABLE:
        raise HTTPException(status_code=500, detail="Disease module unavailable")
    disease = get_disease_by_id(disease_id)
    if not disease:
        raise HTTPException(status_code=404, detail=f"Disease '{disease_id}' not found")
    return {"success": True, "disease": disease, "timestamp": datetime.now().isoformat()}


@app.get("/diseases/outbreaks/current")
async def get_current_outbreaks():
    """
    Groq-powered disease outbreak intelligence.
    Returns current fast-spreading diseases by world region with trend,
    severity, and patient advice — based on Groq Llama 3 knowledge.
    """
    client = get_groq_client()
    if not client:
        raise HTTPException(status_code=503, detail="Groq API key not configured")

    prompt = """You are a public health intelligence AI. Based on your most recent knowledge, 
provide a structured JSON report of diseases currently spreading rapidly in different world regions.

Return ONLY valid JSON in this exact format (no markdown, no explanation, just JSON):
{
  "outbreaks": [
    {
      "region": "Region name",
      "country_examples": "2-3 specific countries",
      "disease": "Disease name",
      "trend": "rising" | "stable" | "declining",
      "severity": "critical" | "high" | "moderate",
      "cases_context": "brief context about scale",
      "patient_advice": "one specific action patients should take",
      "icon": "single emoji representing the disease"
    }
  ],
  "global_alerts": ["brief alert 1", "brief alert 2", "brief alert 3"],
  "last_updated_note": "brief note about data currency"
}

Include 8 different outbreaks across different regions. Focus on real, current patterns.
Be specific about regions. Make patient_advice actionable and short (under 15 words)."""

    try:
        resp = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=1200,
        )
        raw = resp.choices[0].message.content.strip()

        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = "\n".join(raw.split("\n")[1:])
        if raw.endswith("```"):
            raw = "\n".join(raw.split("\n")[:-1])

        import json
        data = json.loads(raw)
        return {
            "success":   True,
            "data":      data,
            "powered_by": "Groq Llama 3.3-70B",
            "timestamp": datetime.now().isoformat(),
        }
    except Exception as e:
        # Return fallback static data if Groq fails
        return {
            "success": True,
            "data": {
                "outbreaks": [
                    {"region": "Central Africa (DRC)", "country_examples": "DRC, Congo", "disease": "Mpox (Clade Ib)", "trend": "rising", "severity": "critical", "cases_context": "Major outbreak, WHO emergency declared", "patient_advice": "Avoid skin contact with infected; get vaccinated if eligible", "icon": ""},
                    {"region": "South & Southeast Asia", "country_examples": "India, Bangladesh, Thailand", "disease": "Dengue Fever", "trend": "rising", "severity": "high", "cases_context": "Record cases in multiple countries", "patient_advice": "Use mosquito repellent and eliminate standing water", "icon": ""},
                    {"region": "Sub-Saharan Africa", "country_examples": "Ethiopia, Somalia, Nigeria", "disease": "Cholera", "trend": "rising", "severity": "high", "cases_context": "Ongoing humanitarian crisis areas", "patient_advice": "Drink only boiled or bottled water", "icon": ""},
                    {"region": "Global", "country_examples": "Northern hemisphere", "disease": "Influenza", "trend": "seasonal", "severity": "moderate", "cases_context": "Seasonal flu activity", "patient_advice": "Get annual flu vaccine before peak season", "icon": ""},
                    {"region": "South Asia", "country_examples": "Pakistan, India", "disease": "Typhoid", "trend": "stable", "severity": "high", "cases_context": "Drug-resistant strains increasing", "patient_advice": "Vaccinate before travel; drink safe water only", "icon": "️"},
                    {"region": "Europe & Americas", "country_examples": "Multiple countries", "disease": "Measles", "trend": "rising", "severity": "high", "cases_context": "Outbreaks due to vaccination gaps", "patient_advice": "Check MMR vaccination status for all family members", "icon": ""},
                    {"region": "West Africa", "country_examples": "Ghana, Ivory Coast", "disease": "Malaria", "trend": "stable", "severity": "high", "cases_context": "Endemic with seasonal spikes", "patient_advice": "Use bed nets and antimalarial prophylaxis when travelling", "icon": ""},
                    {"region": "Global", "country_examples": "All countries", "disease": "COVID-19", "trend": "stable", "severity": "moderate", "cases_context": "Ongoing circulation with new variants", "patient_advice": "Stay up to date with recommended boosters", "icon": ""},
                ],
                "global_alerts": [
                    "Mpox Clade Ib: WHO public health emergency — Central Africa",
                    "Dengue at record levels in Asia and Americas in 2024",
                    "Measles resurgence globally due to vaccination gaps"
                ],
                "last_updated_note": "Static fallback data — Groq AI analysis temporarily unavailable"
            },
            "powered_by": "Static fallback",
            "error":     str(e),
            "timestamp": datetime.now().isoformat(),
        }


# ── entry ─────────────────────────────────────────────────────────────────────

# =============================================================================
# DIGEST ENDPOINTS + APSCHEDULER
# =============================================================================

try:
    from digest_service import (
        add_subscriber, remove_subscriber, get_subscribers,
        send_daily_digest, send_digest_to_one,
        generate_digest_content, render_html_email, subscriber_count,
    )
    DIGEST_AVAILABLE = True
except ImportError as _de:
    print(f"[Digest] module not found: {_de}")
    DIGEST_AVAILABLE = False


# -- APScheduler: run daily digest at 08:00 -----------------------------------
try:
    from apscheduler.schedulers.background import BackgroundScheduler
    from apscheduler.triggers.cron import CronTrigger

    _scheduler = BackgroundScheduler(timezone="UTC")

    if DIGEST_AVAILABLE:
        DIGEST_HOUR = int(os.getenv("DIGEST_HOUR", "8"))
        DIGEST_MIN  = int(os.getenv("DIGEST_MINUTE", "0"))
        _scheduler.add_job(
            send_daily_digest,
            CronTrigger(hour=DIGEST_HOUR, minute=DIGEST_MIN),
            id="daily_digest",
            replace_existing=True,
        )
        print(f"[Scheduler] Daily digest scheduled at {DIGEST_HOUR:02d}:{DIGEST_MIN:02d} UTC")

    _scheduler.start()
    print("[Scheduler] APScheduler started")

    import atexit
    atexit.register(lambda: _scheduler.shutdown(wait=False))

except Exception as _se:
    print(f"[Scheduler] Could not start APScheduler: {_se}")
    _scheduler = None


# -- Pydantic models ----------------------------------------------------------
class SubscribeRequest(BaseModel):
    email: str = Field(..., description="Subscriber email address")
    prefs: Optional[Dict] = Field(default_factory=lambda: {
        "outbreaks": True, "tips": True, "spotlight": True
    })

class UnsubscribeRequest(BaseModel):
    email: str


# -- /digest/subscribe --------------------------------------------------------
@app.post("/digest/subscribe")
async def digest_subscribe(req: SubscribeRequest):
    """Subscribe an email to the daily health digest."""
    if not DIGEST_AVAILABLE:
        raise HTTPException(status_code=503, detail="Digest service unavailable")
    import re
    if not re.match(r"[^@]+@[^@]+\.[^@]+", req.email):
        raise HTTPException(status_code=400, detail="Invalid email address")
    result = add_subscriber(req.email, req.prefs or {})
    return {**result, "message": "You will receive the daily digest every morning.", "timestamp": datetime.now().isoformat()}


# -- /digest/unsubscribe ------------------------------------------------------
@app.post("/digest/unsubscribe")
async def digest_unsubscribe(req: UnsubscribeRequest):
    """Unsubscribe an email from the digest."""
    if not DIGEST_AVAILABLE:
        raise HTTPException(status_code=503, detail="Digest service unavailable")
    result = remove_subscriber(req.email)
    return {**result, "timestamp": datetime.now().isoformat()}


# -- /digest/preview ----------------------------------------------------------
@app.get("/digest/preview")
async def digest_preview():
    """
    Preview today's digest as HTML in the browser.
    Visit http://localhost:8000/digest/preview to see the email.
    """
    if not DIGEST_AVAILABLE:
        raise HTTPException(status_code=503, detail="Digest service unavailable")
    from fastapi.responses import HTMLResponse
    content = generate_digest_content()
    html    = render_html_email(content, "preview@cliniqai.com")
    return HTMLResponse(content=html)


# -- /digest/send-now ---------------------------------------------------------
@app.post("/digest/send-now")
async def digest_send_now(email: Optional[str] = None):
    """
    Manually trigger the digest.
    Pass ?email=x@y.com to send to one address only (for testing).
    No email = sends to ALL subscribers.
    """
    if not DIGEST_AVAILABLE:
        raise HTTPException(status_code=503, detail="Digest service unavailable")
    if not GROQ_API_KEY:
        raise HTTPException(status_code=503, detail="GROQ_API_KEY not configured")
    if email:
        result = send_digest_to_one(email)
    else:
        result = send_daily_digest()
    return {**result, "timestamp": datetime.now().isoformat()}


# -- /digest/status -----------------------------------------------------------
@app.get("/digest/status")
async def digest_status():
    """Return digest service status and subscriber count."""
    subs = get_subscribers() if DIGEST_AVAILABLE else []
    next_run = None
    if _scheduler:
        job = _scheduler.get_job("daily_digest")
        if job and job.next_run_time:
            next_run = job.next_run_time.isoformat()
    return {
        "digest_available":  DIGEST_AVAILABLE,
        "smtp_configured":   bool(os.getenv("SMTP_USER") and os.getenv("SMTP_PASS")),
        "subscriber_count":  len(subs),
        "scheduler_running": _scheduler is not None and _scheduler.running if _scheduler else False,
        "next_scheduled_run": next_run,
        "digest_hour_utc":   int(os.getenv("DIGEST_HOUR", "8")),
        "timestamp":         datetime.now().isoformat(),
    }


# -- entry --------------------------------------------------------------------

# =============================================================================
# VOICE SYMPTOM LOGGER ENDPOINT
# =============================================================================

class SymptomRequest(BaseModel):
    symptoms: str = Field(..., description="Spoken or typed symptom description")
    age: Optional[int] = Field(None, description="Patient age")
    gender: Optional[str] = Field(None, description="Patient gender")


@app.post("/symptoms/analyze")
async def analyze_symptoms(req: SymptomRequest):
    """
    Symptom triage endpoint — used by the Voice Symptom Logger.
    Returns urgency score (1-10), possible conditions, recommended action.
    """
    client = get_groq_client()
    if not client:
        raise HTTPException(status_code=503, detail="Groq API key not configured")

    age_info    = f"Patient age: {req.age}" if req.age else ""
    gender_info = f"Patient gender: {req.gender}" if req.gender else ""
    profile     = " | ".join(filter(None, [age_info, gender_info]))

    prompt = (
        "You are a medical triage AI. A patient has described their symptoms.\n"
        + (f"Patient profile: {profile}\n" if profile else "")
        + f"Symptoms: {req.symptoms}\n\n"
        "Return ONLY valid JSON (no markdown):\n"
        "{\n"
        '  "urgency": <1-10 integer>,\n'
        '  "urgency_label": "<Emergency|Urgent|See Doctor Soon|Monitor|Normal>",\n'
        '  "summary": "<1 sentence summary of the symptom presentation>",\n'
        '  "possible_conditions": ["<condition 1>", "<condition 2>", "<condition 3>"],\n'
        '  "recommended_action": "<clear next step in plain English, max 20 words>",\n'
        '  "timeframe": "<e.g. Call 911 now | Within 2 hours | Within 24 hours | This week | Monitor at home>",\n'
        '  "red_flags": ["<symptom that would make this more serious>"],\n'
        '  "self_care": "<brief home care tip if applicable, or empty string>",\n'
        '  "time_sensitive": <true|false>\n'
        "}\n\n"
        "Urgency scale: 1-2=normal, 3-4=monitor, 5-6=see doctor soon, 7-8=urgent care, 9-10=emergency.\n"
        "Be conservative — when in doubt, score higher."
    )

    try:
        resp = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=600,
        )
        raw = resp.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = "\n".join(raw.split("\n")[1:])
        if raw.endswith("```"):
            raw = "\n".join(raw.split("\n")[:-1])

        import json
        data = json.loads(raw)

        return {
            "success":   True,
            "symptoms":  req.symptoms,
            "analysis":  data,
            "disclaimer": "AI triage only — always seek professional medical advice for health concerns.",
            "timestamp": datetime.now().isoformat(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# -- entry --------------------------------------------------------------------

# =============================================================================
# APPOINTMENT SMS ENDPOINT
# =============================================================================

class AppointmentBookRequest(BaseModel):
    patient_name:   str
    patient_phone:  str
    doctor_name:    str
    specialization: str
    hospital:       str
    address:        str
    date:           str
    slot:           str
    fee:            Optional[int] = None


def _send_sms_twilio(to_number: str, message: str) -> bool:
    try:
        from twilio.rest import Client
        client = Client(os.getenv("TWILIO_ACCOUNT_SID"), os.getenv("TWILIO_AUTH_TOKEN"))
        client.messages.create(body=message, from_=os.getenv("TWILIO_FROM_NUMBER"), to=to_number)
        return True
    except Exception as e:
        print(f"[SMS Twilio] {e}")
        return False


def _send_sms_msg91(to_number: str, message: str) -> bool:
    try:
        import requests as req
        url = "https://api.msg91.com/api/v5/flow/"
        payload = {
            "authkey":   os.getenv("MSG91_AUTH_KEY"),
            "mobiles":   to_number.replace("+","").replace(" ",""),
            "flow_id":   os.getenv("MSG91_FLOW_ID",""),
            "sender":    os.getenv("MSG91_SENDER_ID","CLINIQ"),
            "OTP":       message[:160],
        }
        r = req.post(url, json=payload, timeout=10)
        return r.status_code == 200
    except Exception as e:
        print(f"[SMS MSG91] {e}")
        return False


@app.post("/appointments/book")
async def book_appointment_sms(req: AppointmentBookRequest):
    """Send SMS confirmation after appointment booking."""
    sms_text = (
        f"ClinIQ AI - Appointment Confirmed!\n"
        f"Doctor: {req.doctor_name} ({req.specialization})\n"
        f"Date: {req.date} at {req.slot}\n"
        f"Hospital: {req.hospital}\n"
        f"Address: {req.address}\n"
        + (f"Fee: Rs.{req.fee}\n" if req.fee else "")
        + f"Thank you, {req.patient_name}. Please arrive 10 min early."
    )

    sms_sent = False
    if req.patient_phone and req.patient_phone.strip():
        # Try Twilio first, then MSG91
        if os.getenv("TWILIO_ACCOUNT_SID"):
            sms_sent = _send_sms_twilio(req.patient_phone, sms_text)
        elif os.getenv("MSG91_AUTH_KEY"):
            sms_sent = _send_sms_msg91(req.patient_phone, sms_text)

    return {
        "success":   True,
        "sms_sent":  sms_sent,
        "message":   sms_text,
        "timestamp": datetime.now().isoformat(),
    }


# -- entry --------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("api:app", host="0.0.0.0", port=port, reload=False, log_level="info")
