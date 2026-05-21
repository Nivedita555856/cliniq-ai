'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'

//  Urgency meta 
function urgencyMeta(score) {
  if (score >= 9) return { color:'#dc2626', bg:'#fee2e2', label:'EMERGENCY',        icon:'', action:'Call 911 immediately' }
  if (score >= 7) return { color:'#ea580c', bg:'#fff7ed', label:'URGENT CARE',      icon:'', action:'Go to urgent care now' }
  if (score >= 5) return { color:'#d97706', bg:'#fefce8', label:'SEE DOCTOR SOON',  icon:'', action:'Book appointment today' }
  if (score >= 3) return { color:'#65a30d', bg:'#f7fee7', label:'MONITOR',          icon:'', action:'Watch for changes' }
  return               { color:'#22c55e', bg:'#dcfce7', label:'NORMAL',            icon:'', action:'No immediate action needed' }
}

//  Urgency Meter (arc gauge) 
function UrgencyMeter({ score }) {
  const pct    = score / 10
  const meta   = urgencyMeta(score)
  const cx=60, cy=60, r=50
  const arc    = Math.PI * r
  const filled = arc * pct

  return (
    <div className="flex flex-col items-center gap-2">
      <svg viewBox="0 0 120 75" className="w-44">
        <path d={`M ${cx-r},${cy} A ${r},${r} 0 0 1 ${cx+r},${cy}`}
              fill="none" stroke="#e2e8f0" strokeWidth="12" strokeLinecap="round"/>
        <path d={`M ${cx-r},${cy} A ${r},${r} 0 0 1 ${cx+r},${cy}`}
              fill="none" stroke={meta.color} strokeWidth="12" strokeLinecap="round"
              strokeDasharray={`${filled} ${arc}`}
              style={{transition:'stroke-dasharray 1s ease, stroke 0.5s ease'}}/>
        {(() => {
          const angle = Math.PI * (1 - pct)
          const nx = cx + 42 * Math.cos(angle - Math.PI)
          const ny = cy - 42 * Math.sin(angle - Math.PI)
          return <line x1={cx} y1={cy} x2={nx} y2={ny}
            stroke={meta.color} strokeWidth="3" strokeLinecap="round"
            style={{transition:'all 0.8s ease'}}/>
        })()}
        <circle cx={cx} cy={cy} r="4" fill={meta.color}/>
        <text x={cx} y={cy-8} textAnchor="middle" fontSize="18" fontWeight="700"
              fill={meta.color} style={{transition:'all 0.5s'}}>{score}</text>
        <text x={cx} y={cy+4} textAnchor="middle" fontSize="6.5" fill="#94a3b8">/10</text>
        <text x="10"  y="72" fontSize="6" fill="#94a3b8" textAnchor="middle">Low</text>
        <text x={cx}  y="72" fontSize="6" fill="#94a3b8" textAnchor="middle">Mid</text>
        <text x="110" y="72" fontSize="6" fill="#94a3b8" textAnchor="middle">High</text>
      </svg>
      <span className="text-sm font-bold px-3 py-1 rounded-full"
            style={{background:meta.bg, color:meta.color}}>
        {meta.icon} {meta.label}
      </span>
    </div>
  )
}

//  Mic button with animated rings 
function MicButton({ isListening, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="relative flex items-center justify-center w-24 h-24 rounded-full transition-all"
      style={{
        background: isListening
          ? 'linear-gradient(135deg,#ef4444,#dc2626)'
          : 'linear-gradient(135deg,#22d3ee,#0891b2)',
        boxShadow: isListening
          ? '0 0 0 0 rgba(239,68,68,0.4)'
          : '0 0 0 0 rgba(34,211,238,0.4)',
        animation: isListening ? 'micPulse 1.5s ease-in-out infinite' : 'none',
      }}>
      {/* Pulse rings */}
      {isListening && [1,2,3].map(i => (
        <span key={i} className="absolute inset-0 rounded-full border-2 border-red-400"
          style={{
            animation: `micRing 1.5s ease-out ${i*0.3}s infinite`,
            opacity: 0,
          }}/>
      ))}
      <svg viewBox="0 0 24 24" className="w-10 h-10" fill="white">
        <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z"/>
        <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 19v4M8 23h8" stroke="white" fill="none"
              strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    </button>
  )
}

//  Waveform bars (decorative animation while listening) 
function Waveform({ active }) {
  const bars = [3,5,8,6,9,4,7,5,8,3,6,9,4,7,5,8,6,3,9,5]
  return (
    <div className="flex items-center justify-center gap-0.5 h-10">
      {bars.map((h, i) => (
        <div key={i} className="w-1 rounded-full transition-all"
             style={{
               height:     active ? `${h * 3}px` : '4px',
               background: active ? '#22d3ee' : '#e2e8f0',
               animation:  active ? `wave 0.8s ease-in-out ${(i%5)*0.12}s infinite alternate` : 'none',
               transition: 'height 0.3s ease, background 0.3s ease',
             }}/>
      ))}
    </div>
  )
}

//  Main VoiceSymptomLogger 
export default function VoiceSymptomLogger() {
  const [isListening,  setIsListening]  = useState(false)
  const [transcript,   setTranscript]   = useState('')
  const [interim,      setInterim]      = useState('')
  const [age,          setAge]          = useState('')
  const [gender,       setGender]       = useState('')
  const [analysing,    setAnalysing]    = useState(false)
  const [result,       setResult]       = useState(null)
  const [error,        setError]        = useState('')
  const [supported,    setSupported]    = useState(true)
  const [history,      setHistory]      = useState([])    // past analyses this session

  const recognitionRef = useRef(null)

  // Check browser support
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) setSupported(false)
  }, [])

  // Init speech recognition
  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return

    const rec = new SR()
    rec.continuous     = true
    rec.interimResults = true
    rec.lang           = 'en-US'

    rec.onresult = (e) => {
      let final = '', temp = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript + ' '
        else temp += e.results[i][0].transcript
      }
      if (final) setTranscript(prev => prev + final)
      setInterim(temp)
    }

    rec.onerror = (e) => {
      if (e.error === 'not-allowed') {
        setError('Microphone access denied. Please allow microphone in browser settings.')
      } else if (e.error !== 'aborted') {
        setError('Speech recognition error: ' + e.error)
      }
      setIsListening(false)
    }

    rec.onend = () => {
      setIsListening(false)
      setInterim('')
    }

    recognitionRef.current = rec
    rec.start()
    setIsListening(true)
    setError('')
    setResult(null)
  }, [])

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setIsListening(false)
    setInterim('')
  }, [])

  const toggleMic = () => {
    if (isListening) stopListening()
    else startListening()
  }

  const analyseSymptoms = async () => {
    const text = (transcript + ' ' + interim).trim()
    if (!text) { setError('No symptoms recorded. Tap the mic and speak.'); return }
    setAnalysing(true); setError('')
    try {
      const body = { symptoms: text }
      if (age)    body.age    = parseInt(age)
      if (gender) body.gender = gender

      const r = await fetch(BACKEND + '/symptoms/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) { const d = await r.json(); throw new Error(d.detail || 'Analysis failed') }
      const data = await r.json()
      setResult(data)
      // Save to session history
      setHistory(h => [{
        time:     new Date().toLocaleTimeString(),
        symptoms: text.slice(0, 60) + (text.length > 60 ? '...' : ''),
        urgency:  data.analysis?.urgency || 0,
        label:    data.analysis?.urgency_label || '',
      }, ...h].slice(0, 5))
    } catch (e) {
      setError(e.message || 'Could not connect to backend')
    } finally {
      setAnalysing(false)
    }
  }

  const reset = () => {
    setTranscript(''); setInterim(''); setResult(null); setError('')
  }

  const analysis = result?.analysis || {}
  const meta     = analysis.urgency ? urgencyMeta(analysis.urgency) : null

  if (!supported) return (
    <div className="max-w-xl mx-auto px-4 py-16 text-center">
      <p className="text-4xl mb-4"></p>
      <h2 className="text-lg font-bold text-slate-800 mb-2">Browser not supported</h2>
      <p className="text-sm text-slate-500">Voice input requires Chrome, Edge, or Safari. Please switch browsers.</p>
    </div>
  )

  return (
    <>
      {/* Keyframe styles injected inline */}
      <style>{`
        @keyframes micPulse {
          0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,0.4)}
          50%{box-shadow:0 0 0 20px rgba(239,68,68,0)}
        }
        @keyframes micRing {
          0%{transform:scale(1);opacity:0.6}
          100%{transform:scale(2);opacity:0}
        }
        @keyframes wave {
          from{transform:scaleY(0.4)}
          to{transform:scaleY(1)}
        }
      `}</style>

      <section className="max-w-4xl mx-auto px-4 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/*  LEFT: Input  */}
          <div className="space-y-5">

            {/* Mic panel */}
            <div className="glass-card p-6 flex flex-col items-center gap-4">
              <div className="text-center">
                <h2 className="text-base font-bold text-slate-800">Voice Symptom Logger</h2>
                <p className="text-xs text-slate-400 mt-0.5">Tap the mic and describe how you feel</p>
              </div>

              <MicButton isListening={isListening} onClick={toggleMic} disabled={analysing}/>
              <Waveform active={isListening}/>

              <p className="text-xs font-medium text-center"
                 style={{color: isListening ? '#ef4444' : '#94a3b8'}}>
                {isListening ? ' Recording… speak now' : 'Tap to start recording'}
              </p>
            </div>

            {/* Transcript display */}
            <div className="glass-card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Transcript</span>
                {(transcript || interim) && (
                  <button onClick={reset} className="text-xs text-slate-400 hover:text-red-400 transition-colors">Clear</button>
                )}
              </div>
              <div className="min-h-[80px] text-sm text-slate-700 leading-relaxed bg-slate-50 rounded-xl p-3 border border-slate-100">
                {transcript && <span>{transcript}</span>}
                {interim   && <span className="text-slate-400 italic">{interim}</span>}
                {!transcript && !interim && (
                  <span className="text-slate-300 italic">Your spoken symptoms will appear here…</span>
                )}
              </div>

              {/* Optional manual edit */}
              {(transcript || interim) && (
                <textarea
                  value={transcript}
                  onChange={e => setTranscript(e.target.value)}
                  placeholder="Edit or add to your symptoms..."
                  rows={2}
                  className="w-full mt-2 text-sm border border-slate-200 rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-cyan-300 bg-white"
                />
              )}
            </div>

            {/* Optional patient profile */}
            <div className="glass-card p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Optional — improves accuracy</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Age</label>
                  <input type="number" value={age} onChange={e => setAge(e.target.value)}
                    placeholder="e.g. 35" min="1" max="120"
                    className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Biological sex</label>
                  <select value={gender} onChange={e => setGender(e.target.value)}
                    className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-300 bg-white">
                    <option value="">Not specified</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
                <span className="shrink-0 mt-0.5"></span>{error}
              </div>
            )}

            {/* Analyse button */}
            <button
              onClick={analyseSymptoms}
              disabled={analysing || (!transcript && !interim)}
              className="btn-primary w-full flex items-center justify-center gap-2">
              {analysing
                ? <><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Analysing with AI…</>
                : ' Analyse My Symptoms'
              }
            </button>
          </div>

          {/*  RIGHT: Result  */}
          <div className="space-y-4">
            {!result && !analysing && (
              <div className="glass-card p-8 flex flex-col items-center justify-center gap-4 min-h-[400px] text-center">
                <span className="text-5xl opacity-20"></span>
                <p className="text-slate-400 font-medium text-sm">Speak your symptoms and press Analyse</p>
                <p className="text-xs text-slate-300">Example: "I have a sharp pain in my lower right abdomen since yesterday, along with fever and nausea"</p>
              </div>
            )}

            {analysing && (
              <div className="glass-card p-8 flex flex-col items-center justify-center gap-4 min-h-[400px]">
                <div className="relative w-16 h-16">
                  <div className="absolute inset-0 rounded-full border-4 border-cyan-100"/>
                  <div className="absolute inset-0 rounded-full border-4 border-cyan-500 border-t-transparent animate-spin"/>
                </div>
                <p className="text-sm font-medium text-slate-600">Groq AI is triaging your symptoms…</p>
              </div>
            )}

            {result && meta && (
              <div className="space-y-4 animate-fade-in">

                {/* Urgency card */}
                <div className="glass-card p-5">
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    <UrgencyMeter score={analysis.urgency}/>
                    <div className="flex-1 text-center sm:text-left">
                      <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Triage Assessment</p>
                      <p className="text-lg font-bold text-slate-800 mb-1">{analysis.summary}</p>
                      <div className="inline-flex items-center gap-2 mt-2 px-3 py-2 rounded-xl text-sm font-bold"
                           style={{background:meta.bg, color:meta.color}}>
                        {meta.action}
                      </div>
                      <p className="text-xs text-slate-400 mt-2 font-medium">{analysis.timeframe}</p>
                    </div>
                  </div>
                </div>

                {/* Possible conditions */}
                {(analysis.possible_conditions || []).length > 0 && (
                  <div className="glass-card p-4">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Possible Conditions</h3>
                    <div className="flex flex-wrap gap-2">
                      {analysis.possible_conditions.map((c, i) => (
                        <span key={i} className="px-3 py-1 rounded-full text-xs font-semibold border"
                              style={{background:'#d9f8fd', color:'#0e7490', borderColor:'#a5f3fc'}}>
                          {c}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-slate-400 mt-3 italic">These are possibilities only — not a diagnosis.</p>
                  </div>
                )}

                {/* Red flags */}
                {(analysis.red_flags || []).length > 0 && (
                  <div className="glass-card p-4" style={{background:'#fff7ed', borderColor:'#fed7aa'}}>
                    <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{color:'#c2410c'}}>
                       Watch for these red flags
                    </h3>
                    {analysis.red_flags.map((f, i) => (
                      <p key={i} className="text-xs text-orange-800 flex items-start gap-1.5 mb-1">
                        <span className="shrink-0">•</span>{f}
                      </p>
                    ))}
                  </div>
                )}

                {/* Self care */}
                {analysis.self_care && (
                  <div className="glass-card p-4">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2"> Self Care</h3>
                    <p className="text-sm text-slate-700">{analysis.self_care}</p>
                  </div>
                )}

                {/* Disclaimer */}
                <p className="text-xs text-center text-slate-400">
                   AI triage only — always consult a qualified healthcare provider for medical decisions.
                </p>
              </div>
            )}

            {/* Session history */}
            {history.length > 0 && (
              <div className="glass-card p-4 mt-2">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Recent Checks</h3>
                <div className="space-y-2">
                  {history.map((h, i) => {
                    const m = urgencyMeta(h.urgency)
                    return (
                      <div key={i} className="flex items-center gap-3 text-xs py-1.5 border-b border-slate-100 last:border-0">
                        <span className="text-slate-400 shrink-0">{h.time}</span>
                        <span className="flex-1 text-slate-600 truncate">{h.symptoms}</span>
                        <span className="font-bold shrink-0 px-2 py-0.5 rounded-full"
                              style={{background:m.bg, color:m.color}}>{h.urgency}/10</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

        </div>
      </section>
    </>
  )
}
