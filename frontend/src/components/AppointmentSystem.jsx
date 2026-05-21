'use client'
import { useState, useEffect } from 'react'
import { supabase, bookAppointment, getMyAppointments } from '../lib/supabase'

const CITIES = ['Mumbai','Delhi','Bangalore','Chennai','Hyderabad','Pune']
const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'

//  Star rating display 
const Stars = ({ rating }) => (
  <span className="text-xs text-amber-500">
    {''.repeat(Math.round(rating))}{''.repeat(5 - Math.round(rating))}
    <span className="text-slate-400 ml-1">{rating}</span>
  </span>
)

//  Doctor card 
function DoctorCard({ doc, onBook }) {
  const initials = doc.name.split(' ').slice(1,3).map(w => w[0]).join('')
  const colors   = ['#0891b2','#7c3aed','#16a34a','#dc2626','#d97706','#0284c7']
  const color    = colors[doc.name.charCodeAt(4) % colors.length]

  return (
    <div className="glass-card p-4 hover:shadow-lg transition-shadow">
      <div className="flex items-start gap-3 mb-3">
        {/* Avatar */}
        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0"
             style={{background: color}}>
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-slate-800 truncate">{doc.name}</h3>
          <p className="text-xs text-cyan-600 font-medium">{doc.specialization}</p>
          <Stars rating={doc.rating}/>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-slate-800">₹{doc.fee}</p>
          <p className="text-xs text-slate-400">consult</p>
        </div>
      </div>

      <div className="space-y-1 mb-3">
        <p className="text-xs text-slate-500 flex items-center gap-1">
          <span></span> {doc.hospital}
        </p>
        <p className="text-xs text-slate-500 flex items-center gap-1">
          <span></span> {doc.address}
        </p>
        <p className="text-xs text-slate-500 flex items-center gap-1">
          <span></span> {doc.qualification} · {doc.experience} yrs exp
        </p>
      </div>

      <button onClick={() => onBook(doc)}
        className="btn-primary w-full text-sm py-2">
         Book Appointment
      </button>
    </div>
  )
}

//  Booking modal 
function BookingModal({ doctor, onClose, onBooked, user }) {
  const [date,     setDate]     = useState('')
  const [slot,     setSlot]     = useState('')
  const [symptoms, setSymptoms] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  // Get next 7 available dates
  const dates = Array.from({length: 7}, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i + 1)
    const day = d.toLocaleDateString('en-US',{weekday:'short'})
    if (!doctor.available_days?.some(ad => day.startsWith(ad.slice(0,3)))) return null
    return { value: d.toISOString().split('T')[0], label: d.toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'}) }
  }).filter(Boolean)

  const slots = doctor.slots || ['09:00','10:00','11:00','14:00','15:00','16:00']

  const confirm = async () => {
    if (!date || !slot) { setError('Please select date and time slot'); return }
    setLoading(true); setError('')
    try {
      const appt = {
        patient_id:       user?.id || null,
        doctor_id:        doctor.id,
        appointment_date: date,
        time_slot:        slot,
        symptoms:         symptoms,
        status:           'confirmed',
      }

      let saved = null
      if (user) {
        // Ensure profile exists before booking (handles Google OAuth users)
        await supabase.from('profiles').upsert({
          id:    user.id,
          email: user.email,
          name:  user.user_metadata?.name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Patient',
          role:  'patient',
        }, { onConflict: 'id', ignoreDuplicates: true })

        saved = await bookAppointment(appt)
      }

      // Send SMS via backend
      try {
        await fetch(BACKEND + '/appointments/book', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({
            patient_name:  user?.user_metadata?.name || 'Patient',
            patient_phone: user?.user_metadata?.phone || '',
            doctor_name:   doctor.name,
            specialization: doctor.specialization,
            hospital:      doctor.hospital,
            address:       doctor.address,
            date, slot,
            fee:           doctor.fee,
          })
        })
      } catch (_) {}

      onBooked({ ...appt, doctors: doctor, id: saved?.id || 'local' })
    } catch (e) {
      setError(e.message || 'Booking failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{background:'rgba(0,0,0,0.45)', backdropFilter:'blur(4px)'}}
         onClick={onClose}>
      <div className="glass-card w-full max-w-md animate-slide-up" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between"
             style={{background:'linear-gradient(135deg,#d9f8fd,#f0fdfe)'}}>
          <div>
            <h3 className="font-bold text-slate-800">Book Appointment</h3>
            <p className="text-xs text-cyan-600 font-medium">{doctor.name} · {doctor.specialization}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg">x</button>
        </div>
        <div className="px-5 py-4 space-y-4">

          {/* Date selection */}
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-2">Select Date</label>
            <div className="grid grid-cols-4 gap-1.5">
              {dates.map(d => (
                <button key={d.value} onClick={() => setDate(d.value)}
                  className="p-2 rounded-lg text-center text-xs border transition-all"
                  style={{
                    borderColor: date === d.value ? '#22d3ee' : '#e2e8f0',
                    background:  date === d.value ? '#d9f8fd' : 'white',
                    color:       date === d.value ? '#0e7490' : '#475569',
                  }}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Time slot */}
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-2">Select Time</label>
            <div className="grid grid-cols-3 gap-1.5">
              {slots.map(s => (
                <button key={s} onClick={() => setSlot(s)}
                  className="py-2 rounded-lg text-xs border font-medium transition-all"
                  style={{
                    borderColor: slot === s ? '#22d3ee' : '#e2e8f0',
                    background:  slot === s ? '#d9f8fd' : 'white',
                    color:       slot === s ? '#0e7490' : '#475569',
                  }}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Symptoms */}
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">
              Symptoms / Reason <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <textarea value={symptoms} onChange={e => setSymptoms(e.target.value)}
              placeholder="Briefly describe your symptoms..."
              rows={2}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
          </div>

          {/* Fee summary */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-sm text-slate-600">Consultation Fee</span>
            <span className="text-sm font-bold text-slate-800">₹{doctor.fee}</span>
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <button onClick={confirm} disabled={loading || !date || !slot}
            className="btn-primary w-full flex items-center justify-center gap-2">
            {loading
              ? <><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Confirming…</>
              : ' Confirm Appointment'
            }
          </button>
          {!user && <p className="text-xs text-center text-slate-400">Log in to save appointments to your profile</p>}
        </div>
      </div>
    </div>
  )
}

//  Confirmation card 
function ConfirmationCard({ appt, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{background:'rgba(0,0,0,0.45)', backdropFilter:'blur(4px)'}}
         onClick={onClose}>
      <div className="glass-card w-full max-w-sm animate-slide-up text-center p-8"
           onClick={e => e.stopPropagation()}>
        <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl mx-auto mb-4"
             style={{background:'#dcfce7'}}></div>
        <h3 className="text-lg font-bold text-slate-800 mb-1">Appointment Confirmed!</h3>
        <p className="text-sm text-slate-500 mb-4">SMS sent to your registered number</p>
        <div className="text-left bg-slate-50 rounded-xl p-4 space-y-2 mb-5">
          <p className="text-sm"><span className="font-semibold">Doctor:</span> {appt.doctors?.name}</p>
          <p className="text-sm"><span className="font-semibold">Date:</span> {appt.appointment_date}</p>
          <p className="text-sm"><span className="font-semibold">Time:</span> {appt.time_slot}</p>
          <p className="text-sm"><span className="font-semibold">Hospital:</span> {appt.doctors?.hospital}</p>
          <p className="text-sm"><span className="font-semibold">Address:</span> {appt.doctors?.address}</p>
        </div>
        <button onClick={onClose} className="btn-primary w-full">Done</button>
      </div>
    </div>
  )
}

//  Main AppointmentSystem 
export default function AppointmentSystem({ user }) {
  const [city,       setCity]       = useState('Mumbai')
  const [doctors,    setDoctors]    = useState([])
  const [loading,    setLoading]    = useState(false)
  const [booking,    setBooking]    = useState(null)   // doctor being booked
  const [confirmed,  setConfirmed]  = useState(null)   // confirmed appt
  const [myAppts,    setMyAppts]    = useState([])
  const [showMine,   setShowMine]   = useState(false)
  const [specFilter, setSpecFilter] = useState('All')

  const SPECS = ['All','Cardiologist','Neurologist','Gynecologist','Orthopedic',
                 'Pulmonologist','Dermatologist','Endocrinologist','General Physician']

  useEffect(() => { loadDoctors() }, [city])

  useEffect(() => {
    if (user) loadMyAppointments()
  }, [user])

  async function loadDoctors() {
    setLoading(true)
    const { data, error } = await supabase
      .from('doctors').select('*').eq('city', city).limit(6)
    setDoctors(error ? [] : (data || []))
    setLoading(false)
  }

  async function loadMyAppointments() {
    if (!user) return
    const appts = await getMyAppointments(user.id)
    setMyAppts(appts)
  }

  const filtered = specFilter === 'All'
    ? doctors
    : doctors.filter(d => d.specialization === specFilter)

  return (
    <section className="max-w-6xl mx-auto px-4 py-10">

      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800">Book Appointment</h2>
          <p className="text-xs text-slate-400 mt-0.5">Top doctors in your city · Instant confirmation · SMS alerts</p>
        </div>
        {user && (
          <button onClick={() => setShowMine(v => !v)}
            className="text-sm font-semibold px-4 py-2 rounded-xl border transition-all"
            style={{borderColor:'#22d3ee', color:'#0e7490', background: showMine ? '#d9f8fd' : 'white'}}>
             My Appointments ({myAppts.length})
          </button>
        )}
      </div>

      {/* My appointments panel */}
      {showMine && myAppts.length > 0 && (
        <div className="glass-card p-4 mb-6">
          <h3 className="text-sm font-bold text-slate-700 mb-3">Upcoming Appointments</h3>
          <div className="space-y-3">
            {myAppts.map(a => (
              <div key={a.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{a.doctors?.name}</p>
                  <p className="text-xs text-slate-500">{a.doctors?.specialization} · {a.appointment_date} · {a.time_slot}</p>
                </div>
                <span className="text-xs font-bold px-2 py-1 rounded-full"
                      style={{background:'#dcfce7', color:'#166534'}}>{a.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* City selector */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <span className="text-xs font-semibold text-slate-500"> City:</span>
        {CITIES.map(c => (
          <button key={c} onClick={() => setCity(c)}
            className="text-xs font-semibold px-3 py-1.5 rounded-full border transition-all"
            style={{
              borderColor: city === c ? '#22d3ee' : '#e2e8f0',
              background:  city === c ? '#d9f8fd' : 'white',
              color:       city === c ? '#0e7490' : '#64748b'
            }}>
            {c}
          </button>
        ))}
      </div>

      {/* Specialization filter */}
      <div className="flex items-center gap-2 flex-wrap mb-6">
        <span className="text-xs font-semibold text-slate-500"> Specialty:</span>
        {SPECS.map(s => (
          <button key={s} onClick={() => setSpecFilter(s)}
            className="text-xs px-2.5 py-1 rounded-full border transition-all"
            style={{
              borderColor: specFilter === s ? '#22d3ee' : '#e2e8f0',
              background:  specFilter === s ? '#d9f8fd' : 'white',
              color:       specFilter === s ? '#0e7490' : '#64748b'
            }}>
            {s}
          </button>
        ))}
      </div>

      {/* Doctor grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({length: 6}).map((_, i) => (
            <div key={i} className="skeleton h-48 rounded-2xl"/>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <p className="text-3xl mb-2"></p>
          <p className="text-sm">No doctors found. Make sure Supabase is configured.</p>
          <p className="text-xs mt-1">Run supabase_schema.sql in your Supabase project.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(doc => (
            <DoctorCard key={doc.id} doc={doc} onBook={setBooking}/>
          ))}
        </div>
      )}

      {/* Booking modal */}
      {booking && (
        <BookingModal
          doctor={booking}
          user={user}
          onClose={() => setBooking(null)}
          onBooked={appt => {
            setBooking(null)
            setConfirmed(appt)
            loadMyAppointments()
          }}
        />
      )}

      {/* Confirmation */}
      {confirmed && (
        <ConfirmationCard appt={confirmed} onClose={() => setConfirmed(null)}/>
      )}
    </section>
  )
}
