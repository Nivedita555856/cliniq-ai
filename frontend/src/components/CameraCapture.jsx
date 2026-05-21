'use client'
import { useState, useRef, useCallback, useEffect } from 'react'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'

export default function CameraCapture({ onResult, onClose }) {
  const videoRef    = useRef(null)
  const canvasRef   = useRef(null)
  const streamRef   = useRef(null)

  const [mode,        setMode]        = useState('setup')  // 'setup'|'preview'|'captured'|'analysing'|'result'
  const [facingMode,  setFacingMode]  = useState('environment')  // 'environment'=back 'user'=front
  const [capturedImg, setCapturedImg] = useState(null)
  const [clinCtx,     setClinCtx]     = useState('')
  const [result,      setResult]      = useState(null)
  const [error,       setError]       = useState('')
  const [supported,   setSupported]   = useState(true)

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setSupported(false); return
    }
    startCamera()
    return () => stopCamera()
  }, [facingMode])

  const startCamera = async () => {
    stopCamera()
    setMode('preview'); setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }
    } catch (e) {
      setError('Camera access denied. Allow camera permission in your browser.')
      setMode('setup')
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }

  const capture = useCallback(() => {
    const video  = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    canvas.width  = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
    setCapturedImg(dataUrl)
    stopCamera()
    setMode('captured')
  }, [])

  const retake = () => {
    setCapturedImg(null); setResult(null); setError('')
    startCamera()
  }

  const analyse = async () => {
    if (!capturedImg) return
    setMode('analysing'); setError('')
    try {
      // Convert data URL to blob
      const res   = await fetch(capturedImg)
      const blob  = await res.blob()
      const file  = new File([blob], 'camera_capture.jpg', {type:'image/jpeg'})
      const fd    = new FormData()
      fd.append('file', file)
      if (clinCtx) fd.append('clinical_context', clinCtx)

      const r = await fetch(BACKEND + '/analyze/image', { method:'POST', body:fd })
      if (!r.ok) throw new Error('Analysis failed')
      const data = await r.json()
      setResult(data)
      setMode('result')
      onResult && onResult(data)
    } catch (e) {
      setError(e.message || 'Analysis failed')
      setMode('captured')
    }
  }

  const getRiskStyle = (risk) => {
    if (!risk) return { bg:'#f1f5f9', color:'#64748b' }
    const r = risk.toUpperCase()
    if (r.includes('HIGH'))     return { bg:'#fee2e2', color:'#dc2626' }
    if (r.includes('MODERATE')) return { bg:'#fef3c7', color:'#d97706' }
    return { bg:'#dcfce7', color:'#22c55e' }
  }

  if (!supported) return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center" onClick={onClose}>
      <div className="text-white text-center p-8">
        <p className="text-4xl mb-4"></p>
        <p className="text-lg font-bold mb-2">Camera not supported</p>
        <p className="text-sm text-slate-400">Use Chrome or Safari with camera permission</p>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3"
           style={{background:'rgba(0,0,0,0.7)'}}>
        <div>
          <p className="text-white font-bold text-sm"> Camera Scan</p>
          <p className="text-xs text-slate-400">
            {mode === 'preview'   && 'Position X-ray or document in frame'}
            {mode === 'captured'  && 'Review capture — add context if needed'}
            {mode === 'analysing' && 'Analysing with AI…'}
            {mode === 'result'    && 'Analysis complete'}
          </p>
        </div>
        <button onClick={() => { stopCamera(); onClose() }}
          className="text-white text-xl w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/20"></button>
      </div>

      {/* Camera / image view */}
      <div className="flex-1 relative overflow-hidden bg-black flex items-center justify-center">
        {/* Live video */}
        {mode === 'preview' && (
          <>
            <video ref={videoRef} className="w-full h-full object-contain" playsInline muted autoPlay/>
            {/* Guide overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="border-2 border-cyan-400 rounded-2xl opacity-70"
                   style={{width:'80%', height:'70%', boxShadow:'0 0 0 9999px rgba(0,0,0,0.35)'}}/>
            </div>
            {/* Scan line animation */}
            <div className="absolute pointer-events-none"
                 style={{top:'15%', left:'10%', right:'10%', height:'70%', overflow:'hidden'}}>
              <div className="w-full h-0.5 bg-cyan-400 opacity-70"
                   style={{animation:'scanLine 2.5s ease-in-out infinite'}}/>
            </div>
          </>
        )}

        {/* Captured / result image */}
        {(mode === 'captured' || mode === 'analysing' || mode === 'result') && capturedImg && (
          <img src={capturedImg} alt="Captured" className="w-full h-full object-contain"/>
        )}

        {/* Analysing overlay */}
        {mode === 'analysing' && (
          <div className="absolute inset-0 flex items-center justify-center"
               style={{background:'rgba(0,0,0,0.6)'}}>
            <div className="text-center text-white">
              <div className="w-14 h-14 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
              <p className="text-sm font-bold">Analysing with AI…</p>
              <p className="text-xs text-slate-400 mt-1">ResNet50 + Groq Llama 3</p>
            </div>
          </div>
        )}

        <canvas ref={canvasRef} className="hidden"/>
      </div>

      {/* Bottom controls */}
      <div className="px-4 py-4 space-y-3" style={{background:'rgba(0,0,0,0.85)'}}>

        {error && (
          <div className="bg-red-900/50 border border-red-700 rounded-xl px-4 py-2 text-sm text-red-300 text-center">
            {error}
          </div>
        )}

        {/* Clinical context input (captured state) */}
        {mode === 'captured' && (
          <input value={clinCtx} onChange={e => setClinCtx(e.target.value)}
            placeholder="Clinical context: e.g. 65-year-old male, chest pain, cough…"
            className="w-full text-sm bg-white/10 border border-white/20 rounded-xl px-3 py-2.5 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"/>
        )}

        {/* Result summary */}
        {mode === 'result' && result && (
          <div className="rounded-xl p-3 text-center"
               style={getRiskStyle(result.risk_level)}>
            <p className="text-sm font-bold">{result.risk_level || 'Unknown'}</p>
            <p className="text-xs mt-1 opacity-80">{result.consultation || ''}</p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-3">
          {mode === 'preview' && (
            <>
              {/* Flip camera */}
              <button
                onClick={() => setFacingMode(m => m === 'environment' ? 'user' : 'environment')}
                className="w-12 h-12 rounded-full border-2 border-white/30 flex items-center justify-center text-white text-xl hover:bg-white/20">
                
              </button>

              {/* Capture button */}
              <button onClick={capture}
                className="flex-1 h-16 rounded-full flex items-center justify-center border-4 border-white"
                style={{background:'linear-gradient(135deg,#22d3ee,#0891b2)'}}>
                <div className="w-12 h-12 rounded-full bg-white/30"/>
              </button>

              {/* Spacer */}
              <div className="w-12 h-12"/>
            </>
          )}

          {mode === 'captured' && (
            <>
              <button onClick={retake}
                className="flex-1 py-3 rounded-xl border border-white/30 text-white text-sm font-semibold hover:bg-white/10 transition-colors">
                 Retake
              </button>
              <button onClick={analyse}
                className="flex-1 py-3 rounded-xl text-white text-sm font-bold"
                style={{background:'linear-gradient(135deg,#22d3ee,#0891b2)'}}>
                 Analyse
              </button>
            </>
          )}

          {mode === 'result' && (
            <>
              <button onClick={retake}
                className="flex-1 py-3 rounded-xl border border-white/30 text-white text-sm font-semibold hover:bg-white/10 transition-colors">
                 New Scan
              </button>
              <button onClick={() => { stopCamera(); onClose() }}
                className="flex-1 py-3 rounded-xl text-white text-sm font-bold"
                style={{background:'linear-gradient(135deg,#22d3ee,#0891b2)'}}>
                 Done
              </button>
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes scanLine {
          0%   { transform: translateY(0); opacity: 1; }
          45%  { opacity: 1; }
          50%  { transform: translateY(100%); opacity: 0; }
          51%  { transform: translateY(0); opacity: 0; }
          55%  { opacity: 1; }
          100% { transform: translateY(100%); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
