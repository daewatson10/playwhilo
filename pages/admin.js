// pages/admin.js
import { useState, useEffect } from 'react'
import Head from 'next/head'
import { db } from '../lib/firebase'
import { doc, getDoc, setDoc, collection, getDocs, query, orderBy } from 'firebase/firestore'

const ADMIN_PASSWORD = 'Playwhilo2026'
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function getWeekDates() {
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const dow = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((dow + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d.toLocaleDateString('en-CA')
  })
}

function getNextWeekDates() {
  const dates = getWeekDates()
  return dates.map(d => {
    const next = new Date(d + 'T12:00:00')
    next.setDate(next.getDate() + 7)
    return next.toLocaleDateString('en-CA')
  })
}

export default function Admin() {
  const [authed, setAuthed] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')
  const [passwordError, setPasswordError] = useState(false)
  const [puzzles, setPuzzles] = useState({})
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [editingDate, setEditingDate] = useState(null)
  const [editData, setEditData] = useState({})
  const [saveStatus, setSaveStatus] = useState({})
  const [weekMode, setWeekMode] = useState('current')
  const [toast, setToast] = useState('')

  const weekDates = weekMode === 'current' ? getWeekDates() : getNextWeekDates()

  useEffect(() => {
    if (authed) loadPuzzles()
  }, [authed, weekMode])

  async function loadPuzzles() {
    setLoading(true)
    const loaded = {}
    for (const date of weekDates) {
      try {
        const snap = await getDoc(doc(db, 'dailyPuzzles', date))
        if (snap.exists()) loaded[date] = snap.data()
      } catch (e) {
        console.error('Load error:', e)
      }
    }
    setPuzzles(loaded)
    setLoading(false)
  }

  async function generateWeek() {
    setGenerating(true)
    showToast('Generating this week\'s puzzles...')
    let count = 0
    for (const date of weekDates) {
      if (puzzles[date]) continue // skip already generated
      try {
        const snap = await getDoc(doc(db, 'weekThemes', getWeekMonday()))
        const theme = snap.exists() ? snap.data().theme_name : 'Reflection'
        const res = await fetch('/api/puzzle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date, weekTheme: theme, type: 'puzzle' })
        })
        const puzzle = await res.json()
        if (!puzzle.error) {
          await setDoc(doc(db, 'dailyPuzzles', date), { ...puzzle, date, approved: false, createdAt: new Date() })
          count++
        }
      } catch (e) {
        console.error('Generate error for', date, e)
      }
    }
    await loadPuzzles()
    setGenerating(false)
    showToast(`Generated ${count} new puzzle${count !== 1 ? 's' : ''} ✦`)
  }

  function getWeekMonday() {
    return weekDates[0]
  }

  function startEdit(date) {
    setEditingDate(date)
    setEditData({ ...puzzles[date] })
  }

  function cancelEdit() {
    setEditingDate(null)
    setEditData({})
  }

  async function saveEdit(date) {
    setSaveStatus(s => ({ ...s, [date]: 'saving' }))
    try {
      await setDoc(doc(db, 'dailyPuzzles', date), { ...editData, updatedAt: new Date() }, { merge: true })
      setPuzzles(p => ({ ...p, [date]: { ...editData } }))
      setEditingDate(null)
      setSaveStatus(s => ({ ...s, [date]: 'saved' }))
      showToast('Puzzle saved ✦')
      setTimeout(() => setSaveStatus(s => ({ ...s, [date]: null })), 2000)
    } catch (e) {
      setSaveStatus(s => ({ ...s, [date]: 'error' }))
      showToast('Save failed — try again')
    }
  }

  async function toggleApproved(date) {
    const current = puzzles[date]?.approved || false
    try {
      await setDoc(doc(db, 'dailyPuzzles', date), { approved: !current }, { merge: true })
      setPuzzles(p => ({ ...p, [date]: { ...p[date], approved: !current } }))
      showToast(!current ? '✓ Approved' : 'Marked as pending')
    } catch (e) {
      showToast('Error updating approval')
    }
  }

  async function regenerate(date) {
    if (!confirm(`Regenerate puzzle for ${date}? This will replace the current one.`)) return
    setSaveStatus(s => ({ ...s, [date]: 'saving' }))
    try {
      const snap = await getDoc(doc(db, 'weekThemes', getWeekMonday()))
      const theme = snap.exists() ? snap.data().theme_name : 'Reflection'
      const res = await fetch('/api/puzzle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, weekTheme: theme, type: 'puzzle' })
      })
      const puzzle = await res.json()
      if (puzzle.error) throw new Error(puzzle.error)
      await setDoc(doc(db, 'dailyPuzzles', date), { ...puzzle, date, approved: false, createdAt: new Date() })
      setPuzzles(p => ({ ...p, [date]: { ...puzzle, date, approved: false } }))
      setSaveStatus(s => ({ ...s, [date]: null }))
      showToast(`New puzzle generated: ${puzzle.word} ✦`)
    } catch (e) {
      setSaveStatus(s => ({ ...s, [date]: null }))
      showToast('Regeneration failed')
    }
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

  if (!authed) {
    return (
      <>
        <Head><title>Whilo Admin</title></Head>
        <div style={{ minHeight: '100vh', background: '#FAF7F0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 360, padding: '40px 36px', background: '#FFF', borderRadius: 16, border: '1px solid #E8D5A3', boxShadow: '0 4px 24px rgba(44,36,22,0.08)' }}>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: 28, fontWeight: 600, color: '#2C2416', marginBottom: 6 }}>
                whi<span style={{ color: '#C4922A' }}>lo</span>
              </div>
              <div style={{ fontSize: 12, color: '#6B5E4A', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Admin</div>
            </div>
            <input
              type="password"
              value={passwordInput}
              onChange={e => setPasswordInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  if (passwordInput === ADMIN_PASSWORD) setAuthed(true)
                  else setPasswordError(true)
                }
              }}
              placeholder="Password"
              style={{ width: '100%', padding: '11px 15px', border: `1.5px solid ${passwordError ? '#E8A0A0' : '#E8D5A3'}`, borderRadius: 10, fontSize: 14, outline: 'none', marginBottom: 10, fontFamily: 'inherit', background: passwordError ? '#FFF8F8' : '#FFF' }}
            />
            {passwordError && <p style={{ fontSize: 12, color: '#9B3A3A', marginBottom: 10 }}>Incorrect password</p>}
            <button
              onClick={() => {
                if (passwordInput === ADMIN_PASSWORD) setAuthed(true)
                else setPasswordError(true)
              }}
              style={{ width: '100%', padding: 12, background: '#2C2416', color: '#FAF7F0', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Enter
            </button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Head><title>Whilo Admin — Weekly Puzzles</title></Head>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #F5F1EA; font-family: -apple-system, 'Nunito', sans-serif; }
        textarea { resize: vertical; font-family: inherit; }
        .field-label { font-size: 10px; color: #A8936A; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 600; margin-bottom: 5px; }
        .field-value { font-size: 14px; color: #2C2416; line-height: 1.6; }
        .field-edit { width: 100%; padding: 9px 12px; border: 1.5px solid #E8D5A3; border-radius: 8px; font-size: 14px; line-height: 1.6; color: #2C2416; background: #FEFCF7; outline: none; }
        .field-edit:focus { border-color: #C4922A; }
        .btn { padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; font-family: inherit; transition: opacity 0.15s; }
        .btn:hover { opacity: 0.85; }
        .btn-dark { background: #2C2416; color: #FAF7F0; }
        .btn-gold { background: #C4922A; color: #FAF7F0; }
        .btn-outline { background: transparent; color: #6B5E4A; border: 1px solid #DDD5C5; }
        .btn-green { background: #2D7A45; color: #FFF; }
        .btn-red { background: #9B3A3A; color: #FFF; }
        .btn-sm { padding: 5px 12px; font-size: 11px; }
      `}</style>

      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, background: '#2C2416', color: '#FAF7F0', padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 1000, boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}>
          {toast}
        </div>
      )}

      {/* HEADER */}
      <div style={{ background: '#2C2416', padding: '16px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 600, color: '#FAF7F0' }}>
          whi<span style={{ color: '#C4922A' }}>lo</span>
          <span style={{ fontSize: 12, color: '#A8936A', marginLeft: 12, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'inherit' }}>Admin</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ display: 'flex', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, overflow: 'hidden' }}>
            {['current', 'next'].map(w => (
              <button key={w} onClick={() => setWeekMode(w)}
                style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', fontFamily: 'inherit', background: weekMode === w ? '#C4922A' : 'transparent', color: weekMode === w ? '#FFF' : '#A8936A', textTransform: 'capitalize' }}>
                {w === 'current' ? 'This week' : 'Next week'}
              </button>
            ))}
          </div>
          <button onClick={generateWeek} disabled={generating} className="btn btn-gold" style={{ opacity: generating ? 0.6 : 1 }}>
            {generating ? 'Generating...' : '⚡ Generate missing'}
          </button>
          <a href="/" style={{ fontSize: 12, color: '#A8936A', textDecoration: 'none' }}>← Back to site</a>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 20px' }}>

        {/* WEEK OVERVIEW */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 28, flexWrap: 'wrap' }}>
          {weekDates.map((date, i) => {
            const p = puzzles[date]
            const isToday = date === TODAY
            return (
              <div key={date} onClick={() => p && document.getElementById('puzzle-' + date)?.scrollIntoView({ behavior: 'smooth' })}
                style={{ flex: 1, minWidth: 90, padding: '10px 8px', background: p?.approved ? '#EDFBF0' : p ? '#FFF' : '#F5F1EA', border: `1.5px solid ${isToday ? '#C4922A' : p?.approved ? '#B8E8C6' : p ? '#E8D5A3' : '#DDD5C5'}`, borderRadius: 10, cursor: p ? 'pointer' : 'default', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#A8936A', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 4 }}>{DAYS[i].slice(0, 3)}</div>
                <div style={{ fontSize: 11, color: '#6B5E4A', marginBottom: 4 }}>{new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                {p ? (
                  <>
                    <div style={{ fontFamily: 'Georgia, serif', fontSize: 13, fontWeight: 600, color: '#2C2416', marginBottom: 3 }}>{p.word}</div>
                    <div style={{ fontSize: 9, padding: '2px 6px', borderRadius: 6, display: 'inline-block', background: p.approved ? '#EDFBF0' : '#FFF9EE', color: p.approved ? '#2D7A45' : '#C4922A', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                      {p.approved ? '✓ OK' : 'Review'}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 11, color: '#C0B5A5', fontStyle: 'italic' }}>Empty</div>
                )}
              </div>
            )
          })}
        </div>

        {loading && <div style={{ textAlign: 'center', padding: 40, color: '#A8936A', fontStyle: 'italic' }}>Loading puzzles...</div>}

        {/* PUZZLE CARDS */}
        {weekDates.map((date, i) => {
          const p = editingDate === date ? editData : puzzles[date]
          const isEditing = editingDate === date
          const isToday = date === TODAY
          const status = saveStatus[date]

          return (
            <div key={date} id={'puzzle-' + date}
              style={{ background: '#FFF', border: `1.5px solid ${isToday ? '#C4922A' : p?.approved ? '#B8E8C6' : '#E8D5A3'}`, borderRadius: 16, marginBottom: 20, overflow: 'hidden' }}>

              {/* Card header */}
              <div style={{ background: isToday ? '#2C2416' : '#FAF7F0', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #E8D5A3' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, color: isToday ? '#A8936A' : '#A8936A', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>
                      {DAYS[i]} · {new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                      {isToday && <span style={{ marginLeft: 8, color: '#C4922A' }}>← Today</span>}
                    </div>
                    {puzzles[date] && <div style={{ fontFamily: 'Georgia, serif', fontSize: 20, fontWeight: 600, color: isToday ? '#FAF7F0' : '#2C2416', marginTop: 2 }}>{puzzles[date].word}</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {puzzles[date] && !isEditing && (
                    <>
                      <button onClick={() => toggleApproved(date)} className={`btn btn-sm ${puzzles[date].approved ? 'btn-outline' : 'btn-green'}`}>
                        {puzzles[date].approved ? 'Unapprove' : '✓ Approve'}
                      </button>
                      <button onClick={() => startEdit(date)} className="btn btn-sm btn-dark">Edit</button>
                      <button onClick={() => regenerate(date)} className="btn btn-sm btn-outline">↻ Regenerate</button>
                    </>
                  )}
                  {isEditing && (
                    <>
                      <button onClick={() => saveEdit(date)} className="btn btn-sm btn-gold" disabled={status === 'saving'}>
                        {status === 'saving' ? 'Saving...' : 'Save changes'}
                      </button>
                      <button onClick={cancelEdit} className="btn btn-sm btn-outline">Cancel</button>
                    </>
                  )}
                  {!puzzles[date] && (
                    <button onClick={() => regenerate(date)} className="btn btn-sm btn-gold">Generate</button>
                  )}
                </div>
              </div>

              {/* Card body */}
              {puzzles[date] ? (
                <div style={{ padding: '20px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

                    {/* Riddle */}
                    <div style={{ gridColumn: '1 / -1' }}>
                      <div className="field-label">Riddle</div>
                      {isEditing ? (
                        <textarea className="field-edit" rows={3} value={editData.riddle || ''} onChange={e => setEditData(d => ({ ...d, riddle: e.target.value }))} />
                      ) : (
                        <div className="field-value" style={{ fontStyle: 'italic', color: '#4A3F2F' }}>{p.riddle}</div>
                      )}
                    </div>

                    {/* Clues */}
                    {[
                      { key: 'concept_clue', label: 'Concept Clue' },
                      { key: 'context_clue', label: 'Context Clue' },
                      { key: 'behavior_clue', label: 'Behavior Clue' },
                    ].map(({ key, label }) => (
                      <div key={key}>
                        <div className="field-label">{label}</div>
                        {isEditing ? (
                          <textarea className="field-edit" rows={2} value={editData[key] || ''} onChange={e => setEditData(d => ({ ...d, [key]: e.target.value }))} />
                        ) : (
                          <div className="field-value">{p[key]}</div>
                        )}
                      </div>
                    ))}

                    {/* Synonyms */}
                    <div>
                      <div className="field-label">Synonyms (comma separated)</div>
                      {isEditing ? (
                        <input className="field-edit" value={(editData.synonyms || []).join(', ')} onChange={e => setEditData(d => ({ ...d, synonyms: e.target.value.split(',').map(s => s.trim()) }))} />
                      ) : (
                        <div className="field-value">{(p.synonyms || []).join(', ')}</div>
                      )}
                    </div>

                    {/* Challenge */}
                    <div>
                      <div className="field-label">Challenge</div>
                      {isEditing ? (
                        <textarea className="field-edit" rows={2} value={editData.challenge || ''} onChange={e => setEditData(d => ({ ...d, challenge: e.target.value }))} />
                      ) : (
                        <div className="field-value">{p.challenge}</div>
                      )}
                    </div>

                    {/* Journal prompt */}
                    <div>
                      <div className="field-label">Journal Prompt</div>
                      {isEditing ? (
                        <textarea className="field-edit" rows={2} value={editData.journal_prompt || ''} onChange={e => setEditData(d => ({ ...d, journal_prompt: e.target.value }))} />
                      ) : (
                        <div className="field-value">{p.journal_prompt}</div>
                      )}
                    </div>

                    {/* Solved subtitle */}
                    <div>
                      <div className="field-label">Solved Subtitle</div>
                      {isEditing ? (
                        <input className="field-edit" value={editData.solved_subtitle || ''} onChange={e => setEditData(d => ({ ...d, solved_subtitle: e.target.value }))} />
                      ) : (
                        <div className="field-value">{p.solved_subtitle}</div>
                      )}
                    </div>

                    {/* Reflection */}
                    <div style={{ gridColumn: '1 / -1' }}>
                      <div className="field-label">Reflection (Today's Thread)</div>
                      {isEditing ? (
                        <textarea className="field-edit" rows={8} value={editData.reflection || ''} onChange={e => setEditData(d => ({ ...d, reflection: e.target.value }))} />
                      ) : (
                        <div className="field-value" style={{ maxHeight: 120, overflow: 'hidden', position: 'relative' }}>
                          {p.reflection}
                          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 40, background: 'linear-gradient(transparent, #FFF)' }} />
                        </div>
                      )}
                    </div>

                  </div>

                  {/* World note if exists */}
                  {p.world_note && (
                    <div style={{ padding: '10px 14px', background: '#EFF6FF', borderLeft: '3px solid #93C5FD', borderRadius: '0 8px 8px 0', marginTop: 4 }}>
                      <div className="field-label" style={{ color: '#3B82F6' }}>World Note</div>
                      {isEditing ? (
                        <textarea className="field-edit" rows={2} value={editData.world_note || ''} onChange={e => setEditData(d => ({ ...d, world_note: e.target.value }))} />
                      ) : (
                        <div className="field-value" style={{ color: '#1E40AF' }}>{p.world_note}</div>
                      )}
                    </div>
                  )}

                </div>
              ) : (
                <div style={{ padding: '32px', textAlign: 'center', color: '#A8936A', fontStyle: 'italic' }}>
                  No puzzle generated yet for this day.
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
