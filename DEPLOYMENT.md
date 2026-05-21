# ClinIQ AI — Deployment Guide

## Local Development

### 1. Backend (FastAPI)

```bash
cd medical_2

# Create .env from example
cp .env.example .env
# Edit .env and add your GROQ_API_KEY

# Install dependencies
pip install -r requirements.txt

# Start Milvus (optional — needs Docker)
# docker-compose up -d milvus

# Run backend
python api.py
# OR
uvicorn api:app --reload --port 8000
```

Backend runs at: http://localhost:8000
API docs:       http://localhost:8000/docs

### 2. Frontend (Next.js)

```bash
cd medical_2/frontend

# Copy env file
cp .env.local.example .env.local
# .env.local already points to http://localhost:8000

# Install dependencies
npm install

# Start dev server
npm run dev
```

Frontend runs at: http://localhost:3000

---

## Production Deployment

### Backend → Render

1. Push your code to GitHub
2. Go to https://render.com → **New → Web Service**
3. Connect your GitHub repo
4. Render auto-detects `render.yaml` and the `Dockerfile`
5. In **Environment → Secret Files**, set:
   - `GROQ_API_KEY` = your Groq key
   - `ALLOWED_ORIGINS` = https://your-app.vercel.app
6. Click **Deploy**
7. Copy the Render URL (e.g. `https://cliniq-backend.onrender.com`)

**Note:** On the free tier, Render spins down after inactivity (~15s cold start).

### Frontend → Vercel

1. Go to https://vercel.com → **New Project**
2. Import your GitHub repo
3. Set **Root Directory** to `frontend`
4. Add environment variable:
   - `NEXT_PUBLIC_BACKEND_URL` = `https://cliniq-backend.onrender.com` (your Render URL)
5. Click **Deploy**

### Frontend → Netlify (alternative)

1. Go to https://netlify.com → **New site from Git**
2. Build command: `npm run build`
3. Publish directory: `.next`  *(or use `npm run export` + `out/` for static)*
4. Add env var: `NEXT_PUBLIC_BACKEND_URL`

---

## Using RAG in Production

By default, `USE_RAG=false` on Render (Milvus not available). To enable:

1. Sign up for **Zilliz Cloud** (free tier): https://cloud.zilliz.com
2. Create a cluster, copy the URI + token
3. Update `rag_system.py` to use Zilliz connection:
   ```python
   connections.connect(
       "default",
       uri=os.getenv("ZILLIZ_CLOUD_URI"),
       token=os.getenv("ZILLIZ_CLOUD_TOKEN")
   )
   ```
4. Add `ZILLIZ_CLOUD_URI` and `ZILLIZ_CLOUD_TOKEN` to Render env vars
5. Set `USE_RAG=true`

---

## Environment Variables Quick Reference

| Variable | Required | Description |
|---|---|---|
| `GROQ_API_KEY` |  | Groq LLM key (get at console.groq.com) |
| `USE_RAG` |  | Enable Milvus RAG (default: false) |
| `MILVUS_HOST` |  | Milvus host (default: localhost) |
| `ALLOWED_ORIGINS` |  | CORS origins (default: *) |
| `OPENAI_API_KEY` |  | OpenAI fallback |
| `PORT` |  | Server port (default: 8000) |
