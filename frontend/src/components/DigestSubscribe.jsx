'use client'
import { useState } from 'react'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'

async function subscribe(email, prefs) {
  const r = await fetch(BACKEND + '/digest/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, prefs }),
  })
  if (!r.ok) { const d = await r.json(); throw new Error(d.detail || 'Failed') }
  return r.json()
}

async function unsubscribe(email) {
  const r = await fetch(BACKEND + '/digest/unsubscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  if (!r.ok) { const d = await r.json(); throw new Error(d.detail || 'Failed') }
  return r.json()
}

const PREFS = [
  { key: 'outbreaks', label: 'Outbreak Alerts',   icon: '', desc: 'Fast-spreading disease alerts by region' },
  { key: 'tips',      label: 'Daily Health Tips',  icon: '', desc: 'Actionable nutrition, exercise & prevention tips' },
  { key: 'spotlight', label: 'Disease Spotlight',  icon: '', desc: 'One disease deep-dive + key facts per day' },
]

export default function DigestSubscribe({ onClose }) {
  const [email,   setEmail]   = useState('')
  const [prefs,   setPrefs]   = useState({ outbreaks: true, tips: true, spotlight: true })
  const [loading, setLoading] = useState(false)
  const [state,   setState]   = useState('form')   // 'form' | 'success' | 'unsubscribed' | 'error'
  const [msg,     setMsg]     = useState('')
  const [unsub,   setUnsub]   = useState(false)    // toggle unsubscribe mode

  const togglePref = k => setPrefs(p => ({ ...p, [k]: !p[k] }))

  const handleSubmit = async () => {
    if (!email.includes('@')) { setMsg('Enter a valid email.'); return }
    setLoading(true); setMsg('')
    try {
      if (unsub) {
        await unsubscribe(email)
        setState('unsubscribed')
      } else {
        await subscribe(email, prefs)
        setState('success')
      }
    } catch (e) {
      setMsg(e.message || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  /* Success state */
  if (state === 'success') return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
         onClick={onClose}>
      <div className="glass-card p-8 max-w-sm w-full text-center animate-slide-up" onClick={e => e.stopPropagation()}>
        <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl mx-auto mb-4"
             style={{ background: '#d9f8fd' }}></div>
        <h3 className="text-lg font-bold text-slate-800 mb-2">You're subscribed!</h3>
        <p className="text-sm text-slate-500 mb-1">Daily digest sent every morning to</p>
        <p className="text-sm font-bold text-cyan-600 mb-4">{email}</p>
        <div className="text-xs text-slate-400 mb-5 space-y-1">
          {PREFS.filter(p => prefs[p.key]).map(p => (
            <div key={p.key}>{p.icon} {p.label}</div>
          ))}
        </div>
        <button onClick={onClose} className="btn-primary w-full">Done</button>
      </div>
    </div>
  )

  if (state === 'unsubscribed') return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
         onClick={onClose}>
      <div className="glass-card p-8 max-w-sm w-full text-center animate-slide-up" onClick={e => e.stopPropagation()}>
        <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl mx-auto mb-4"
             style={{ background: '#fee2e2' }}></div>
        <h3 className="text-lg font-bold text-slate-800 mb-2">Unsubscribed</h3>
        <p className="text-sm text-slate-500 mb-5">{email} has been removed from the daily digest.</p>
        <button onClick={onClose} className="btn-primary w-full">Close</button>
      </div>
    </div>
  )

  /* Main form */
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
         onClick={onClose}>
      <div className="glass-card w-full max-w-md animate-slide-up" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between"
             style={{ background: 'linear-gradient(135deg,#d9f8fd,#f0fdfe)', borderRadius: '16px 16px 0 0' }}>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl"></span>
              <h2 className="text-lg font-bold text-slate-800">Daily Health Digest</h2>
            </div>
            <p className="text-xs text-slate-500">Groq AI generates fresh content every morning</p>
          </div>
          <button onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors text-lg leading-none mt-0.5">x</button>
        </div>

        <div className="px-6 py-5 space-y-5">

          {/* Email input */}
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">Email address</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-cyan-300 bg-white"
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            />
          </div>

          {/* Prefs (only shown in subscribe mode) */}
          {!unsub && (
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-2">Include in digest</label>
              <div className="space-y-2">
                {PREFS.map(p => (
                  <label key={p.key}
                    className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all"
                    style={{
                      background:   prefs[p.key] ? '#d9f8fd' : '#f8fafc',
                      borderColor:  prefs[p.key] ? '#22d3ee' : '#e2e8f0',
                    }}>
                    <input type="checkbox" checked={prefs[p.key]} onChange={() => togglePref(p.key)}
                      className="w-4 h-4 rounded accent-cyan-500" />
                    <span className="text-lg">{p.icon}</span>
                    <div>
                      <div className="text-sm font-semibold text-slate-700">{p.label}</div>
                      <div className="text-xs text-slate-400">{p.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* What's inside preview */}
          {!unsub && (
            <div className="p-3 rounded-xl border border-slate-100 bg-slate-50 text-xs text-slate-500 space-y-1">
              <p className="font-semibold text-slate-600 mb-1">Each digest includes:</p>
              <p> Today's fastest-spreading disease by region</p>
              <p> One actionable health tip</p>
              <p> Disease spotlight + key prevention fact</p>
              <p> Did You Know medical fact</p>
              <p className="text-slate-400 pt-1">Sent daily at 8:00 AM UTC · Powered by Groq Llama 3</p>
            </div>
          )}

          {/* Error */}
          {msg && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{msg}</p>
          )}

          {/* Actions */}
          <button onClick={handleSubmit} disabled={loading || !email}
            className="btn-primary w-full flex items-center justify-center gap-2">
            {loading
              ? <><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Processing…</>
              : unsub ? ' Unsubscribe' : ' Subscribe to Daily Digest'
            }
          </button>

          {/* Toggle unsubscribe */}
          <p className="text-center text-xs text-slate-400">
            {unsub
              ? <><button onClick={() => { setUnsub(false); setMsg('') }} className="text-cyan-600 hover:underline">Back to subscribe</button></>
              : <>Already subscribed? <button onClick={() => { setUnsub(true); setMsg('') }} className="text-red-400 hover:underline">Unsubscribe</button></>
            }
          </p>

        </div>
      </div>
    </div>
  )
}
