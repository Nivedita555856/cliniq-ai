'use client'
import { useState } from 'react'
import { signIn, signUp, signInWithGoogle } from '../lib/supabase'

export default function AuthModal({ onClose, onSuccess }) {
  const [tab,      setTab]      = useState('login')   // 'login' | 'signup'
  const [role,     setRole]     = useState('patient')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [name,     setName]     = useState('')
  const [phone,    setPhone]    = useState('')
  const [city,     setCity]     = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState('')

  const CITIES = ['Mumbai','Delhi','Bangalore','Chennai','Hyderabad','Pune',
                  'Kolkata','Ahmedabad','Jaipur','Lucknow']

  const handleSubmit = async () => {
    if (!email || !password) { setError('Email and password are required'); return }
    setLoading(true); setError(''); setSuccess('')
    try {
      if (tab === 'login') {
        const data = await signIn(email, password)
        onSuccess && onSuccess(data.user)
        onClose()
      } else {
        if (!name) { setError('Name is required'); setLoading(false); return }
        await signUp(email, password, role, name, phone, city)
        setSuccess('Account created! Please check your email to verify, then log in.')
        setTab('login')
      }
    } catch (e) {
      setError(e.message || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    try { await signInWithGoogle() }
    catch (e) { setError(e.message) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{background:'rgba(0,0,0,0.45)', backdropFilter:'blur(4px)'}}
         onClick={onClose}>
      <div className="glass-card w-full max-w-sm animate-slide-up overflow-hidden"
           onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-6 py-5 text-center border-b border-slate-100"
             style={{background:'linear-gradient(135deg,#d9f8fd,#f0fdfe)'}}>
          <div className="w-12 h-12 rounded-xl mx-auto mb-2 flex items-center justify-center text-white text-xl"
               style={{background:'linear-gradient(135deg,#22d3ee,#0891b2)'}}></div>
          <h2 className="font-bold text-slate-800 text-lg">ClinIQ AI</h2>
          <p className="text-xs text-slate-500 mt-0.5">Your secure medical companion</p>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-slate-100">
          {['login','signup'].map(t => (
            <button key={t} onClick={() => { setTab(t); setError(''); setSuccess('') }}
              className="flex-1 py-3 text-sm font-semibold transition-all capitalize"
              style={{
                borderBottom: tab === t ? '2px solid #22d3ee' : '2px solid transparent',
                color: tab === t ? '#0e7490' : '#94a3b8',
                background: 'white'
              }}>
              {t === 'login' ? ' Log in' : ' Sign up'}
            </button>
          ))}
        </div>

        <div className="px-6 py-5 space-y-4">

          {/* Role selector (signup only) */}
          {tab === 'signup' && (
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">I am a</p>
              <div className="grid grid-cols-2 gap-2">
                {[{v:'patient',icon:'',label:'Patient'},{v:'doctor',icon:'',label:'Doctor'}].map(r => (
                  <button key={r.v} onClick={() => setRole(r.v)}
                    className="p-3 rounded-xl border-2 text-sm font-semibold transition-all flex items-center justify-center gap-2"
                    style={{
                      borderColor: role === r.v ? '#22d3ee' : '#e2e8f0',
                      background:  role === r.v ? '#d9f8fd' : 'white',
                      color:       role === r.v ? '#0e7490' : '#64748b'
                    }}>
                    {r.icon} {r.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Name (signup only) */}
          {tab === 'signup' && (
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="Full name"
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
          )}

          {/* Email */}
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="Email address"
            className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-cyan-300"/>

          {/* Password */}
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-cyan-300"
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}/>

          {/* Phone + City (signup only) */}
          {tab === 'signup' && (
            <div className="grid grid-cols-2 gap-2">
              <input value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="Phone number"
                className="text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
              <select value={city} onChange={e => setCity(e.target.value)}
                className="text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-cyan-300 bg-white">
                <option value="">City</option>
                {CITIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          )}

          {/* Error / Success */}
          {error   && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          {success && <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">{success}</p>}

          {/* Submit */}
          <button onClick={handleSubmit} disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2">
            {loading
              ? <><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Please wait…</>
              : tab === 'login' ? ' Log In' : ' Create Account'
            }
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-slate-100"/>
            <span className="text-xs text-slate-400">or</span>
            <div className="flex-1 border-t border-slate-100"/>
          </div>

          {/* Google */}
          <button onClick={handleGoogle}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

        </div>
      </div>
    </div>
  )
}
