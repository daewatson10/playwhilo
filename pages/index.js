// pages/index.js
import { useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import { useWhilo, getTodayET } from '../lib/useWhilo'
import { useAuth } from '../lib/useAuth'

const TODAY = getTodayET()

const OB_SLIDES = [
  { icon: '✦', title: 'Welcome to Whilo', body: 'Each day, one word. A riddle to crack, a reflection to sit with, a gentle challenge to carry into your day.' },
  { icon: '◈', title: 'Solve the riddle', body: 'Six guesses. Three clues if you need them — Concept, Context, Behavior. Each one precise, never vague.' },
  { icon: '◉', title: "Today's Thread", body: 'Once you find the word, a short reflection unlocks. Honest, grounded, occasionally tied to something in the world.' },
  { icon: '◎', title: 'Challenge, journal & share', body: 'A real-world nudge. Your private journal — saved forever. Share your result. Missed a day? Play it any time.' }
]

function buildShareText(puzzle, date) {
  const guesses = puzzle.guesses || []
  const wrong = guesses.filter(g => !g.correct).length
  const solvedOn = guesses.findIndex(g => g.correct) + 1
  const cluesN = (puzzle.cluesUsed || []).length
  const dots = Array(6).fill(null).map((_, i) => {
    if (i < wrong) return '⚫'
    if (i === wrong && solvedOn) return '🟡'
    return '⬛'
  }).join('')
  const dateStr = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `Whilo — ${dateStr}\n${dots}\n${solvedOn ? `Found in ${solvedOn} guess${solvedOn > 1 ? 'es' : ''}` : 'Revealed after 6 tries'}${cluesN > 0 ? ` · ${cluesN} hint${cluesN > 1 ? 's' : ''} used` : ''}\nplaywhilo.com`
}

export default function Home() {
  const { user, authLoading, signInWithGoogle, signInWithEmail, signUpWithEmail, logout, resetPassword, updateDisplayName } = useAuth()
  const wh = useWhilo(user)
  const [screen, setScreen] = useState('landing')
  const [obStep, setObStep] = useState(0)
  const [activePuzzle, setActivePuzzle] = useState(null)
  const [guessInput, setGuessInput] = useState('')
  const [hint, setHint] = useState({ msg: '', type: '' })
  const [shareToast, setShareToast] = useState(false)
  const [archiveFilter, setArchiveFilter] = useState('all')
  const [archiveDays, setArchiveDays] = useState([])
  const [futureDays, setFutureDays] = useState([])
  const [profileData, setProfileData] = useState({})
  const [wordHistory, setWordHistory] = useState([])
  const [audioPlaying, setAudioPlaying] = useState(null)
  const [authMode, setAuthMode] = useState('login')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [newName, setNewName] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const ttsRef = useRef(null)

  useEffect(() => {
    if (!wh.onboardDone) setScreen('onboard')
  }, [wh.onboardDone])

  function goTo(s) { stopAudio(); setScreen(s); window.scrollTo(0, 0) }

  function goToDaily() {
    const s = wh.load(TODAY)
    if (!s?.word) { handleStartPuzzle(TODAY); return }
    if (s.done_journal) { setActivePuzzle(s); goTo('journal') }
    else if (s.done_challenge) { setActivePuzzle(s); goTo('journal') }
    else if (s.done_thread) { setActivePuzzle(s); goTo('challenge') }
    else if (s.solved) { setActivePuzzle(s); goTo('thread') }
    else { setActivePuzzle(s); goTo('riddle') }
  }

  async function handleStartPuzzle(date) {
    try {
      const puzzle = await wh.startPuzzle(date)
      setActivePuzzle(puzzle)
      setHint({ msg: '', type: '' })
      goTo('riddle')
    } catch {
      alert('Something went wrong generating the puzzle. Please try again.')
    }
  }

  function normalize(word) {
    const w = word.toLowerCase().trim()
    const irregulars = {
      'children':'child','men':'man','women':'woman','feet':'foot',
      'teeth':'tooth','mice':'mouse','geese':'goose','leaves':'leaf',
      'wolves':'wolf','lives':'life','knives':'knife','halves':'half',
      'cacti':'cactus','fungi':'fungus','alumni':'alumnus'
    }
    if (irregulars[w]) return irregulars[w]
    if (w.endsWith('ies') && w.length > 4) return w.slice(0,-3)+'y'
    if (w.endsWith('ves') && w.length > 4) return w.slice(0,-3)+'f'
    if (w.endsWith('ches') && w.length > 5) return w.slice(0,-2)
    if (w.endsWith('shes') && w.length > 5) return w.slice(0,-2)
    if (w.endsWith('xes') && w.length > 4) return w.slice(0,-2)
    if (w.endsWith('ses') && w.length > 4) return w.slice(0,-2)
    if (w.endsWith('zes') && w.length > 4) return w.slice(0,-2)
    if (w.endsWith('ing') && w.length > 5) return w.slice(0,-3)
    if (w.endsWith('ied') && w.length > 4) return w.slice(0,-3)+'y'
    if (w.endsWith('ed') && w.length > 4) return w.slice(0,-2)
    if (w.endsWith('es') && w.length > 3) return w.slice(0,-1)
    if (w.endsWith('s') && w.length > 3) return w.slice(0,-1)
    return w
  }

  async function handleGuess() {
    if (!guessInput.trim() || !activePuzzle) return
    const raw = guessInput.trim()
    const isReal = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${raw.toLowerCase()}`
    ).then(r => r.ok).catch(() => true)
    if (!isReal) {
      setHint({ msg: `"${raw}" is not a word — try again`, type: 'error' })
      return
    }
    const guessNorm = normalize(raw)
    const answerNorm = normalize(activePuzzle.word)
    const correct = guessNorm === answerNorm || raw.toLowerCase() === activePuzzle.word.toLowerCase()
    const synonyms = (activePuzzle.synonyms || []).map(s => s.toLowerCase())
    const isSynonym = !correct && (synonyms.includes(raw.toLowerCase()) || synonyms.includes(guessNorm))
    if (isSynonym) {
      setGuessInput('')
      setHint({ msg: "Almost — you're thinking of the right thing. One more try.", type: 'info' })
      return
    }
    const updated = wh.submitGuessExact(wh.activeDate, raw, correct)
    setGuessInput('')
    setActivePuzzle(updated)
    if (updated.solved) {
      const correctGuess = updated.guesses.find(g => g.correct)
      if (correctGuess) setHint({ msg: 'You found it!', type: 'success' })
      else setHint({ msg: `The word was: ${updated.word}. The thread is still yours.`, type: 'info' })
    } else {
      setHint({ msg: 'Not quite — try again.', type: 'error' })
    }
  }

  function handleRevealClue(idx) {
    const isSolved = activePuzzle?.solved
    const updated = wh.revealClue(wh.activeDate, idx, isSolved)
    if (updated) setActivePuzzle(updated)
  }

  function toggleAudio(target) {
    if (!window.speechSynthesis) return
    if (audioPlaying === target) { stopAudio(); return }
    stopAudio()
    const text = target === 'riddle' ? activePuzzle?.riddle : activePuzzle?.reflection
    if (!text) return
    const utt = new SpeechSynthesisUtterance(text)
    utt.rate = 0.88; utt.pitch = 1.0; utt.volume = 1
    const voices = speechSynthesis.getVoices()
    const pref = voices.find(v => v.name.includes('Samantha') || v.name.includes('Karen') || v.name.includes('Daniel') || v.name.includes('Google UK'))
    if (pref) utt.voice = pref
    utt.onend = () => setAudioPlaying(null)
    utt.onerror = () => setAudioPlaying(null)
    ttsRef.current = utt
    setAudioPlaying(target)
    speechSynthesis.speak(utt)
  }

  function stopAudio() {
    if (window.speechSynthesis) speechSynthesis.cancel()
    setAudioPlaying(null)
  }

  function handleShare() {
    const text = buildShareText(activePuzzle, wh.activeDate)
    if (navigator.share) navigator.share({ title: 'Whilo', text }).catch(() => copyText(text))
    else copyText(text)
  }

  function copyText(text) {
    navigator.clipboard.writeText(text).then(() => {
      setShareToast(true)
      setTimeout(() => setShareToast(false), 2500)
    })
  }

  async function openArchive() {
    const past = wh.getArchiveDays()
    const future = await wh.getFutureDays(7)
    if (user) {
      await Promise.all(past.slice(0, 30).map(async date => {
        const local = wh.load(date)
        if (!local?.word) {
          await wh.loadUserDay(user.uid, date)
        }
      }))
    }
    setArchiveDays([...past])
    setFutureDays(future)
    goTo('archive')
  }

  async function openProfile() {
    const profile = await wh.getUserProfile()
    const history = await wh.getUserWordHistory()
    const streak = await wh.calcStreakFirebase()
    let tot = 0, solv = 0, jour = 0
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith('whilo_2')) {
        try {
          const e = JSON.parse(localStorage.getItem(k))
          if (e) { tot++; if (e.solved) solv++; if (e.journal_entry) jour++ }
        } catch {}
      }
    }
    setProfileData({
      streak: profile?.streak || streak,
      longestStreak: profile?.longestStreak || streak,
      totalSolved: profile?.totalSolved || solv,
      totalPlayed: profile?.totalPlayed || tot,
      journalCount: profile?.journalCount || jour,
    })
    setWordHistory(history)
    goTo('profile')
  }

  async function handleAuthSubmit() {
    setAuthError('')
    try {
      if (authMode === 'login') await signInWithEmail(authEmail, authPassword)
      else await signUpWithEmail(authEmail, authPassword)
      goTo('landing')
    } catch (e) {
      setAuthError(e.message.replace('Firebase: ', '').replace(/\(auth\/.*\)/, '').trim())
    }
  }

  async function handleGoogleSignIn() {
    try {
      await signInWithGoogle()
      goTo('landing')
    } catch (e) {
      setAuthError('Google sign in failed. Please try again.')
    }
  }

  function highlightWord(text, word) {
    if (!text || !word) return text
    const parts = text.split(new RegExp(`(\\b${word}\\b)`, 'gi'))
    return parts.map((p, i) =>
      p.toLowerCase() === word.toLowerCase()
        ? <span key={i} style={{ fontWeight: 600, color: 'var(--gold)', borderBottom: '1.5px solid var(--gold-light)', paddingBottom: 1 }}>{p}</span>
        : p
    )
  }

  function ShareCardDots({ puzzle }) {
    const guesses = puzzle?.guesses || []
    const wrong = guesses.filter(g => !g.correct).length
    const solvedOn = guesses.findIndex(g => g.correct)
    return (
      <div style={{ display: 'flex', gap: 5, marginBottom: 12 }}>
        {Array(6).fill(null).map((_, i) => {
          let bg = 'rgba(250,247,240,0.08)'
          if (i < wrong) bg = 'rgba(250,247,240,0.2)'
          else if (i === wrong && solvedOn >= 0) bg = 'var(--gold)'
          return <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: bg, border: i >= wrong + 1 ? '1px solid rgba(250,247,240,0.15)' : 'none' }} />
        })}
      </div>
    )
  }

  const p = activePuzzle
  const isToday = wh.activeDate === TODAY
  const streak = wh.calcStreak()

  if (authLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--cream)' }}>
        <div style={{ width: 32, height: 32, border: '2px solid var(--gold-light)', borderTopColor: 'var(--gold)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <>
      <Head><title>Whilo — Today's word is waiting</title></Head>
      <div style={{ maxWidth: 680, margin: '0 auto', paddingBottom: 80 }}>

        {wh.loading && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(250,247,240,0.94)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div style={{ width: 32, height: 32, border: '2px solid var(--gold-light)', borderTopColor: 'var(--gold)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: 13 }} />
            <p style={{ fontFamily: 'Lora, serif', fontSize: 15, color: 'var(--ink-light)', fontStyle: 'italic' }}>{wh.loadingText}</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* HEADER */}
        <div style={{ textAlign: 'center', padding: '28px 24px 18px', borderBottom: '1px solid var(--border)', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 28, right: 20, fontSize: 11, color: 'var(--ink-light)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })}
          </div>
          <div style={{ fontFamily: 'Lora, serif', fontSize: 30, fontWeight: 600, letterSpacing: '-0.5px', color: 'var(--ink)' }}>
            whi<span style={{ color: 'var(--gold)' }}>lo</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-light)', marginTop: 3, letterSpacing: '0.09em', textTransform: 'uppercase', fontWeight: 300 }}>
            one word · one reflection · one day
          </div>
          <div style={{ display: 'flex', gap: 5, justifyContent: 'center', marginTop: 12 }}>
            {['riddle', 'thread', 'challenge', 'journal'].map((k, i) => {
              const s = wh.load(TODAY)
              const done = s?.['done_' + k] || (k === 'riddle' && s?.solved)
              return <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: done ? 'var(--gold)' : 'var(--border)', transition: 'all 0.3s' }} />
            })}
          </div>
        </div>

        {/* ONBOARDING */}
        {screen === 'onboard' && (
          <div className="fade-up" style={{ textAlign: 'center', padding: '44px 32px' }}>
            <div style={{ display: 'flex', gap: 5, justifyContent: 'center', marginBottom: 32 }}>
              {OB_SLIDES.map((_, i) => (
                <div key={i} style={{ height: 5, borderRadius: 3, background: i === obStep ? 'var(--gold)' : 'var(--border)', width: i === obStep ? 18 : 5, transition: 'all 0.3s' }} />
              ))}
            </div>
            <div style={{ fontSize: 48, marginBottom: 18 }}>{OB_SLIDES[obStep].icon}</div>
            <h1 style={{ fontFamily: 'Lora, serif', fontSize: 22, fontWeight: 600, marginBottom: 10, lineHeight: 1.3 }}>{OB_SLIDES[obStep].title}</h1>
            <p style={{ fontSize: 14, color: 'var(--ink-light)', lineHeight: 1.8, maxWidth: 320, margin: '0 auto 28px' }}>{OB_SLIDES[obStep].body}</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => { wh.completeOnboard(); goTo('landing') }} style={{ fontSize: 13, color: 'var(--ink-light)', background: 'none', border: 'none', cursor: 'pointer', padding: 10, fontFamily: 'Nunito, sans-serif' }}>Skip</button>
              <button onClick={() => obStep < OB_SLIDES.length - 1 ? setObStep(obStep + 1) : (wh.completeOnboard(), goTo('landing'))}
                style={{ padding: '13px 38px', background: 'var(--ink)', color: 'var(--cream)', fontFamily: 'Nunito, sans-serif', fontSize: 14, fontWeight: 600, borderRadius: 40, border: 'none', cursor: 'pointer' }}>
                {obStep < OB_SLIDES.length - 1 ? 'Next' : 'Begin'}
              </button>
            </div>
          </div>
        )}

        {/* AUTH */}
        {screen === 'auth' && (
          <div className="fade-up" style={{ padding: '40px 32px', maxWidth: 400, margin: '0 auto' }}>
            <h1 style={{ fontFamily: 'Lora, serif', fontSize: 22, fontWeight: 600, marginBottom: 6, textAlign: 'center' }}>
              {authMode === 'login' && (
              <div style={{ marginBottom: 14 }}>
                {!resetSent ? (
                  <div>
                    <button onClick={() => setResetSent('asking')}
                      style={{ fontSize: 12, color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Nunito, sans-serif', padding: 0 }}>
                      Forgot password?
                    </button>
                    {resetSent === 'asking' && (
                      <div style={{ marginTop: 10, padding: '14px', background: '#F8F4EC', borderRadius: 12, border: '1px solid var(--gold-light)' }}>
                        <p style={{ fontSize: 13, color: 'var(--ink-light)', marginBottom: 10, fontFamily: 'Lora, serif', fontStyle: 'italic' }}>Enter your email to receive a reset link</p>
                        <input
                          placeholder="Your email address"
                          type="email"
                          id="resetEmailInput"
                          style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 10, fontFamily: 'Nunito, sans-serif', fontSize: 14, background: 'var(--card)', color: 'var(--ink)', outline: 'none', marginBottom: 10 }} />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={async () => {
                            const email = document.getElementById('resetEmailInput').value.trim()
                            if (!email) return
                            try { await resetPassword(email); setResetSent('sent') }
                            catch (e) { setAuthError('Could not send reset email. Check your address.') }
                          }} style={{ flex: 1, padding: '9px', background: 'var(--ink)', color: 'var(--cream)', border: 'none', borderRadius: 10, fontFamily: 'Nunito, sans-serif', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                            Send reset link
                          </button>
                          <button onClick={() => setResetSent(false)}
                            style={{ padding: '9px 14px', background: 'transparent', color: 'var(--ink-light)', border: '1px solid var(--border)', borderRadius: 10, fontFamily: 'Nunito, sans-serif', fontSize: 13, cursor: 'pointer' }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : resetSent === 'sent' ? (
                  <p style={{ fontSize: 12, color: 'var(--sage)', padding: '8px 0' }}>✦ Reset email sent — check your inbox and spam folder</p>
                ) : null}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              <span style={{ fontSize: 12, color: 'var(--ink-light)' }}>or</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>

            <input value={authEmail} onChange={e => setAuthEmail(e.target.value)}
              placeholder="Email address" type="email"
              style={{ width: '100%', padding: '11px 15px', border: '1.5px solid var(--border)', borderRadius: 12, fontFamily: 'Nunito, sans-serif', fontSize: 14, background: 'var(--card)', color: 'var(--ink)', outline: 'none', marginBottom: 10 }} />

            <div style={{ position: 'relative', marginBottom: 10 }}>
              <input value={authPassword} onChange={e => setAuthPassword(e.target.value)}
                placeholder="Password" type={showPassword ? 'text' : 'password'} onKeyDown={e => e.key === 'Enter' && handleAuthSubmit()}
                style={{ width: '100%', padding: '11px 44px 11px 15px', border: '1.5px solid var(--border)', borderRadius: 12, fontFamily: 'Nunito, sans-serif', fontSize: 14, background: 'var(--card)', color: 'var(--ink)', outline: 'none' }} />
              <button onClick={() => setShowPassword(!showPassword)} type="button"
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--ink-light)', padding: 0 }}>
                {showPassword ? '🙈' : '👁'}
              </button>
            </div>

            {authError && <p style={{ fontSize: 12, color: '#9B3A3A', marginBottom: 10, padding: '8px 12px', background: '#FFF0F0', borderRadius: 8 }}>{authError}</p>}

            {authMode === 'login' && (
              <div style={{ textAlign: 'right', marginBottom: 10 }}>
                {!resetSent ? (
                  <button onClick={async () => {
                    if (!authEmail) { setAuthError('Enter your email first'); return }
                    try { await resetPassword(authEmail); setResetSent(true) }
                    catch (e) { setAuthError('Could not send reset email. Check your address.') }
                  }} style={{ fontSize: 12, color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Nunito, sans-serif' }}>
                    Forgot password?
                  </button>
                ) : (
                  <p style={{ fontSize: 12, color: 'var(--sage)' }}>✦ Reset email sent — check your inbox</p>
                )}
              </div>
            )}

            <button onClick={handleAuthSubmit}
              style={{ width: '100%', padding: 13, background: 'var(--ink)', color: 'var(--cream)', border: 'none', borderRadius: 12, fontFamily: 'Nunito, sans-serif', fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: 14 }}>
              {authMode === 'login' ? 'Sign in' : 'Create account'}
            </button>

            <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--ink-light)' }}>
              {authMode === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <button onClick={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setResetSent(false) }}
                style={{ color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'Nunito, sans-serif', fontWeight: 600 }}>
                {authMode === 'login' ? 'Sign up' : 'Sign in'}
              </button>
            </p>

            <button onClick={() => goTo('landing')}
              style={{ display: 'block', textAlign: 'center', width: '100%', marginTop: 16, fontSize: 13, color: 'var(--ink-light)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Nunito, sans-serif' }}>
              Continue without account
            </button>
          </div>
        )}

        {/* LANDING */}
        {screen === 'landing' && (
          <div className="fade-up" style={{ padding: '36px 22px 28px' }}>
            <div style={{ background: 'var(--gold-bg)', border: '1px solid var(--gold-light)', borderRadius: 14, padding: '13px 16px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 11 }}>
              <div style={{ fontSize: 20 }}>◈</div>
              <div>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--gold)', fontWeight: 600 }}>This week's theme</div>
                <div style={{ fontFamily: 'Lora, serif', fontSize: 15, color: 'var(--ink)', fontStyle: 'italic', marginTop: 1 }}>{wh.weekTheme?.theme_name || '—'}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-light)', marginTop: 2 }}>{new Date().getDay() === 0 ? 'Theme revealed today' : 'Revealed in full on Sunday'}</div>
              </div>
            </div>
            <div style={{ textAlign: 'center', padding: '16px 0 28px' }}>
              {streak > 0 && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 16, background: 'var(--card)', border: '1px solid var(--gold-light)', borderRadius: 20, padding: '5px 14px', fontSize: 13, fontWeight: 600, color: 'var(--gold)' }}>
                  🔥 {streak}-day streak
                </div>
              )}
              <div style={{ fontSize: 40, marginBottom: 16, lineHeight: 1 }}>✦</div>
              <h1 style={{ fontFamily: 'Lora, serif', fontSize: 24, fontWeight: 600, lineHeight: 1.35 }}>Today's word is waiting</h1>
              <p style={{ fontSize: 14, color: 'var(--ink-light)', marginTop: 9, lineHeight: 1.75, maxWidth: 340, margin: '9px auto 0' }}>A clever riddle. A moment of real reflection. A gentle challenge for your day.</p>
            </div>
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <button onClick={() => handleStartPuzzle(TODAY)} style={{ padding: '13px 38px', background: 'var(--ink)', color: 'var(--cream)', fontFamily: 'Nunito, sans-serif', fontSize: 14, fontWeight: 600, borderRadius: 40, border: 'none', cursor: 'pointer' }}>
                Begin Today
              </button>
              <button onClick={openArchive} style={{ padding: '9px 24px', background: 'transparent', color: 'var(--ink-light)', fontFamily: 'Nunito, sans-serif', fontSize: 13, borderRadius: 40, border: '1px solid var(--border)', cursor: 'pointer' }}>
                Past Puzzles
              </button>
              {!user && (
                <button onClick={() => goTo('auth')} style={{ padding: '9px 24px', background: 'transparent', color: 'var(--gold)', fontFamily: 'Nunito, sans-serif', fontSize: 13, borderRadius: 40, border: '1px solid var(--gold-light)', cursor: 'pointer' }}>
                  Sign in to save progress
                </button>
              )}
            </div>
          </div>
        )}

        {/* RIDDLE */}
        {screen === 'riddle' && p && (
          <div className="fade-up" style={{ padding: '26px 22px' }}>
            {!isToday && (
              <div style={{ background: 'var(--gold-bg)', border: '1px solid var(--gold-light)', borderRadius: 12, padding: '11px 15px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 18 }}>◷</div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--gold)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Past puzzle</div>
                  <div style={{ fontSize: 13, color: 'var(--ink)', fontFamily: 'Lora, serif', fontStyle: 'italic', marginTop: 2 }}>
                    {new Date(wh.activeDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  </div>
                </div>
              </div>
            )}
            {p.world_note && <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', background: 'var(--blue-bg)', color: 'var(--blue)', borderRadius: 10, fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>↗ Connected to the world</div>}
            <SectionLabel>Today's riddle</SectionLabel>
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '28px 26px 20px', marginBottom: 20, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: -14, left: 14, fontFamily: 'Lora, serif', fontSize: 90, color: 'var(--gold-light)', lineHeight: 1, pointerEvents: 'none' }}>"</div>
              <p style={{ fontFamily: 'Lora, serif', fontSize: 16, lineHeight: 1.85, color: 'var(--ink)', fontStyle: 'italic', position: 'relative', zIndex: 1 }}>{p.riddle}</p>
              <AudioBar target="riddle" playing={audioPlaying === 'riddle'} onToggle={() => toggleAudio('riddle')} label="Hear the riddle read aloud" />
            </div>
            <SectionLabel style={{ marginBottom: 8 }}>
              {p.solved ? 'Explore the clues' : 'Need a hint?'}
            </SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 20 }}>
              {[
                { icon: '◈', type: 'Concept', name: 'Abstract idea', text: p.concept_clue },
                { icon: '◉', type: 'Context', name: 'Real world', text: p.context_clue },
                { icon: '◎', type: 'Behavior', name: 'What it does', text: p.behavior_clue },
              ].map((clue, i) => {
                const revealed = (p.cluesUsed || []).includes(i)
                return (
                  <div key={i} onClick={() => handleRevealClue(i)}
                    style={{ background: revealed ? 'var(--gold-bg)' : 'var(--card)', border: `1px solid ${revealed ? 'var(--gold)' : 'var(--border)'}`, borderRadius: 12, padding: '12px 8px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.25s' }}>
                    {revealed ? (
                      <p style={{ fontSize: 12, color: 'var(--ink-mid)', fontStyle: 'italic', lineHeight: 1.45 }}>{clue.text}</p>
                    ) : (
                      <>
                        <span style={{ fontSize: 17, display: 'block', marginBottom: 4 }}>{clue.icon}</span>
                        <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-light)', fontWeight: 600, marginBottom: 4 }}>{clue.type}</div>
                        <div style={{ fontSize: 11, fontWeight: 600 }}>{clue.name}</div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
            {hint.msg && <div style={{ padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 12, background: hint.type === 'error' ? '#FFF0F0' : hint.type === 'success' ? '#EDFBF0' : 'var(--gold-bg)', color: hint.type === 'error' ? '#9B3A3A' : hint.type === 'success' ? '#2D7A45' : '#92681E', border: `1px solid ${hint.type === 'error' ? '#F0C5C5' : hint.type === 'success' ? '#B8E8C6' : 'var(--gold-light)'}` }}>{hint.msg}</div>}
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 7 }}>
              {(p.guesses || []).map((g, i) => (
                <div key={i} style={{ padding: '4px 12px', borderRadius: 18, fontSize: 12, fontWeight: 600, fontFamily: 'Lora, serif', fontStyle: 'italic', border: '1px solid', background: g.correct ? '#EDFBF0' : '#F5E8E8', color: g.correct ? '#2D7A45' : '#9B3A3A', borderColor: g.correct ? '#B8E8C6' : '#E8C5C5' }}>{g.text}</div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-light)', marginBottom: 9 }}>
              {6 - (p.guesses || []).filter(g => !g.correct).length} guesses remaining
            </div>
            {!p.solved ? (
              <div style={{ display: 'flex', gap: 7 }}>
                <input value={guessInput} onChange={e => setGuessInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleGuess()}
                  placeholder="Your guess..." maxLength={30}
                  style={{ flex: 1, padding: '11px 15px', border: '1.5px solid var(--border)', borderRadius: 12, fontFamily: 'Lora, serif', fontSize: 15, background: 'var(--card)', color: 'var(--ink)', outline: 'none' }} />
                <button onClick={handleGuess} style={{ padding: '11px 20px', background: 'var(--ink)', color: 'var(--cream)', border: 'none', borderRadius: 12, fontFamily: 'Nunito, sans-serif', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Guess</button>
              </div>
            ) : (
              <button onClick={() => { setActivePuzzle(wh.load(wh.activeDate)); goTo('thread'); if (isToday) wh.setDone(TODAY, 'thread') }}
                style={{ display: 'block', width: '100%', padding: 12, marginTop: 14, background: 'transparent', color: 'var(--gold)', border: '1.5px solid var(--gold-light)', borderRadius: 12, fontFamily: 'Nunito, sans-serif', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                Read Today's Thread →
              </button>
            )}
          </div>
        )}

        {/* THREAD */}
        {screen === 'thread' && p && (
          <div className="fade-up" style={{ padding: '26px 22px' }}>
            <div style={{ textAlign: 'center', padding: '32px 26px', background: 'var(--gold-bg)', border: '1px solid var(--gold-light)', borderRadius: 20, marginBottom: 22 }}>
              <div className="word-reveal" style={{ fontFamily: 'Lora, serif', fontSize: 44, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 5 }}>{p.word}</div>
              <div style={{ fontSize: 13, color: 'var(--ink-light)', fontStyle: 'italic' }}>{p.solved_subtitle}</div>
            </div>
            {p.week_theme && <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 12px', background: 'var(--gold-bg)', border: '1px solid var(--gold-light)', borderRadius: 20, fontSize: 10, color: 'var(--gold)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>◈ This week: {p.week_theme}</div>}
            <SectionLabel>Today's thread</SectionLabel>
            <AudioBar target="thread" playing={audioPlaying === 'thread'} onToggle={() => toggleAudio('thread')} label="Hear today's reflection" style={{ marginBottom: 16 }} />
            <p style={{ fontFamily: 'Lora, serif', fontSize: 16, lineHeight: 1.95, padding: '4px 0' }}>{highlightWord(p.reflection, p.word)}</p>
            {p.world_note && (
              <div style={{ background: 'var(--blue-bg)', borderLeft: '3px solid #93C5FD', borderRadius: '0 6px 6px 0', padding: '12px 14px', margin: '16px 0', fontSize: 13, color: '#1E40AF', lineHeight: 1.6 }}>
                <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.09em', fontWeight: 700, marginBottom: 4, color: '#3B82F6' }}>↗ In the world</div>
                {p.world_note}
              </div>
            )}
            <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
              <div style={{ fontSize: 11, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--ink-light)', fontWeight: 600, marginBottom: 14 }}>Share today's word</div>
              <div style={{ background: 'var(--ink)', borderRadius: 16, padding: 24, marginBottom: 14, position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: -10, right: 16, fontSize: 80, color: 'rgba(255,255,255,0.04)', lineHeight: 1, pointerEvents: 'none' }}>✦</div>
                <div style={{ fontFamily: 'Lora, serif', fontSize: 13, color: 'var(--gold-light)', fontWeight: 600, marginBottom: 14 }}>whi<span style={{ color: 'var(--gold)' }}>lo</span></div>
                <div style={{ fontFamily: 'Lora, serif', fontSize: 32, fontWeight: 600, color: '#FAF7F0', letterSpacing: '0.08em', marginBottom: 4 }}>{p.word}</div>
                <div style={{ fontSize: 11, color: 'rgba(250,247,240,0.5)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 16 }}>
                  {new Date(wh.activeDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </div>
                <ShareCardDots puzzle={p} />
                <div style={{ fontSize: 11, color: 'rgba(250,247,240,0.4)', marginBottom: 6 }}>{(p.cluesUsed || []).length > 0 ? `${p.cluesUsed.length} hint${p.cluesUsed.length > 1 ? 's' : ''} used` : 'No hints needed'}</div>
                <div style={{ fontSize: 11, color: 'rgba(250,247,240,0.45)', fontFamily: 'Lora, serif', fontStyle: 'italic' }}>playwhilo.com</div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={handleShare} style={{ padding: '10px 18px', borderRadius: 10, fontFamily: 'Nunito, sans-serif', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'var(--ink)', color: 'var(--cream)', border: '1px solid var(--ink)' }}>Share Result</button>
                <button onClick={() => copyText(buildShareText(p, wh.activeDate))} style={{ padding: '10px 18px', borderRadius: 10, fontFamily: 'Nunito, sans-serif', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'var(--card)', color: 'var(--ink)', border: '1px solid var(--border)' }}>Copy Text</button>
              </div>
              {shareToast && <div style={{ fontSize: 12, color: 'var(--sage)', marginTop: 8, fontStyle: 'italic' }}>✦ Copied to clipboard!</div>}
            </div>
            <button onClick={() => { wh.setDone(wh.activeDate, 'challenge'); goTo('challenge') }}
              style={{ display: 'block', width: '100%', padding: 12, marginTop: 16, background: 'transparent', color: 'var(--gold)', border: '1.5px solid var(--gold-light)', borderRadius: 12, fontFamily: 'Nunito, sans-serif', fontSize: 14, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>
              Continue to your challenge →
            </button>
          </div>
        )}

        {/* CHALLENGE */}
        {screen === 'challenge' && p && (
          <div className="fade-up" style={{ padding: '26px 22px' }}>
            <SectionLabel>Today's challenge</SectionLabel>
            <div style={{ background: 'var(--card)', border: '1px solid var(--sage)', borderLeft: '4px solid var(--sage)', borderRadius: '0 12px 12px 0', padding: '20px 17px', marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: 'var(--sage)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 8 }}>✦ Your invitation today</div>
              <p style={{ fontFamily: 'Lora, serif', fontSize: 15, lineHeight: 1.75 }}>{p.challenge}</p>
            </div>
            <button onClick={() => goTo('journal')}
              style={{ display: 'block', width: '100%', padding: 12, marginTop: 16, background: 'transparent', color: 'var(--gold)', border: '1.5px solid var(--gold-light)', borderRadius: 12, fontFamily: 'Nunito, sans-serif', fontSize: 14, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>
              Open your journal →
            </button>
          </div>
        )}

        {/* JOURNAL */}
        {screen === 'journal' && p && (
          <div className="fade-up" style={{ padding: '26px 22px' }}>
            <SectionLabel>Your journal</SectionLabel>
            <div style={{ fontFamily: 'Lora, serif', fontSize: 14, lineHeight: 1.75, color: 'var(--ink-light)', fontStyle: 'italic', padding: '13px 16px', background: '#F8F4EC', borderRadius: 10, borderLeft: '3px solid var(--gold)', marginBottom: 13 }}>{p.journal_prompt}</div>
            <JournalEditor puzzle={p} date={wh.activeDate} onSave={async (text) => {
              const updated = await wh.saveJournal(wh.activeDate, text)
              setActivePuzzle(updated)
            }} />
          </div>
        )}

        {/* PROFILE */}
        {screen === 'profile' && (
          <div className="fade-up">
            <div style={{ textAlign: 'center', padding: '28px 22px 16px' }}>
              <div style={{ width: 66, height: 66, borderRadius: '50%', background: 'var(--gold-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontFamily: 'Lora, serif', fontSize: 26, color: 'var(--gold)', fontWeight: 600 }}>
                {user ? (user.displayName || user.email || 'W').charAt(0).toUpperCase() : 'W'}
              </div>

              {editingName ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
                  <input value={newName} onChange={e => setNewName(e.target.value)}
                    placeholder="Your name"
                    style={{ padding: '8px 12px', border: '1.5px solid var(--gold-light)', borderRadius: 10, fontFamily: 'Lora, serif', fontSize: 16, background: 'var(--card)', color: 'var(--ink)', outline: 'none', width: 160 }} />
                  <button onClick={async () => {
                    if (newName.trim()) { await updateDisplayName(newName.trim()); setEditingName(false) }
                  }} style={{ padding: '8px 14px', background: 'var(--ink)', color: 'var(--cream)', border: 'none', borderRadius: 10, fontFamily: 'Nunito, sans-serif', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Save</button>
                  <button onClick={() => setEditingName(false)} style={{ padding: '8px 14px', background: 'transparent', color: 'var(--ink-light)', border: '1px solid var(--border)', borderRadius: 10, fontFamily: 'Nunito, sans-serif', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 4 }}>
                  <div style={{ fontFamily: 'Lora, serif', fontSize: 19, fontWeight: 600 }}>
                    {user ? (user.displayName || user.email?.split('@')[0] || 'Your Journey') : 'Your Journey'}
                  </div>
                  {user && <button onClick={() => { setNewName(user.displayName || ''); setEditingName(true) }}
                    style={{ fontSize: 12, color: 'var(--ink-light)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Nunito, sans-serif' }}>✏️</button>}
                </div>
              )}

              {user && <div style={{ fontSize: 12, color: 'var(--ink-light)', marginTop: 2 }}>{user.email}</div>}
              {!user && (
                <button onClick={() => goTo('auth')} style={{ marginTop: 10, padding: '7px 20px', background: 'var(--gold-bg)', color: 'var(--gold)', border: '1px solid var(--gold-light)', borderRadius: 20, fontFamily: 'Nunito, sans-serif', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Sign in to save progress
                </button>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '0 22px 16px' }}>
              <div style={{ background: 'var(--gold-bg)', border: '1px solid var(--gold-light)', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 28 }}>🔥</div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--ink-light)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>Current streak</div>
                  <div style={{ fontFamily: 'Lora, serif', fontSize: 26, fontWeight: 600, color: 'var(--gold)', lineHeight: 1 }}>{profileData.streak || 0}</div>
                </div>
              </div>
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 28 }}>⭐</div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--ink-light)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>Best streak</div>
                  <div style={{ fontFamily: 'Lora, serif', fontSize: 26, fontWeight: 600, color: 'var(--ink)', lineHeight: 1 }}>{profileData.longestStreak || 0}</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 9, padding: '0 22px 18px' }}>
              {[
                ['Words found', profileData.totalSolved || 0, '◈'],
                ['Days played', profileData.totalPlayed || 0, '◉'],
                ['Journal entries', profileData.journalCount || 0, '◎'],
              ].map(([label, val, icon]) => (
                <div key={label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 16, marginBottom: 4 }}>{icon}</div>
                  <div style={{ fontFamily: 'Lora, serif', fontSize: 24, fontWeight: 600 }}>{val}</div>
                  <div style={{ fontSize: 10, color: 'var(--ink-light)', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>{label}</div>
                </div>
              ))}
            </div>

            <div style={{ padding: '0 22px 20px' }}>
              <SectionLabel>This week</SectionLabel>
              <div style={{ display: 'flex', gap: 5 }}>
                {['M','T','W','T','F','S','S'].map((d, i) => {
                  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
                  const dow = today.getDay()
                  const d2 = new Date(today); d2.setDate(today.getDate() - ((dow + 6) % 7) + i)
                  const dateStr = d2.toLocaleDateString('en-CA')
                  const entry = wh.load(dateStr)
                  const isT = dateStr === TODAY
                  const done = entry?.solved
                  return (
                    <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-light)', fontWeight: 600, marginBottom: 5 }}>{d}</div>
                      <div style={{ width: 30, height: 30, borderRadius: '50%', background: done ? 'var(--gold)' : '#F5F0E8', border: isT ? '2px solid var(--gold)' : '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', fontSize: 11, fontWeight: 600, color: done ? '#FFF' : 'var(--ink-light)' }}>
                        {done ? '✓' : ''}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {wordHistory.length > 0 && (
              <div style={{ padding: '0 22px 20px' }}>
                <SectionLabel>Word history</SectionLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {wordHistory.slice(0, 30).map((d, i) => (
                    <div key={i} style={{ padding: '4px 12px', background: 'var(--gold-bg)', border: '1px solid var(--gold-light)', borderRadius: 20, fontFamily: 'Lora, serif', fontSize: 13, color: 'var(--gold)', fontWeight: 600 }}>
                      {d.word}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {user && (
              <div style={{ padding: '0 22px 20px', textAlign: 'center' }}>
                <button onClick={async () => { await logout(); goTo('landing') }}
                  style={{ padding: '9px 24px', background: 'transparent', color: 'var(--ink-light)', fontFamily: 'Nunito, sans-serif', fontSize: 13, borderRadius: 40, border: '1px solid var(--border)', cursor: 'pointer' }}>
                  Sign out
                </button>
              </div>
            )}
          </div>
        )}

        {/* ARCHIVE */}
        {screen === 'archive' && (
          <div className="fade-up" style={{ padding: '26px 22px' }}>
            <SectionLabel>Past puzzles</SectionLabel>
            <div style={{ display: 'flex', marginBottom: 18, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              {['all','done','missed'].map(f => (
                <button key={f} onClick={() => setArchiveFilter(f)}
                  style={{ flex: 1, padding: 10, textAlign: 'center', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: archiveFilter === f ? 'var(--ink)' : 'var(--card)', color: archiveFilter === f ? 'var(--cream)' : 'var(--ink-light)', border: 'none', fontFamily: 'Nunito, sans-serif', transition: 'all 0.2s' }}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>

            {archiveFilter === 'all' && futureDays.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--ink-light)', fontWeight: 600, marginBottom: 10 }}>Coming up</div>
                {futureDays.slice(0, 3).map((d, i) => (
                  <div key={i} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', marginBottom: 7, display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: 0.6 }}>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--ink-light)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>
                        {new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' })}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--ink-light)', fontStyle: 'italic', marginTop: 2 }}>This week: {d.theme}</div>
                    </div>
                    <div style={{ fontSize: 16 }}>🔒</div>
                  </div>
                ))}
                <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />
              </div>
            )}

            {archiveDays.filter(date => {
              if (date < '2026-05-01') return false
              const e = wh.load(date)
              if (archiveFilter === 'done') return e?.solved
              if (archiveFilter === 'missed') return !e?.solved
              return true
            }).length === 0 && <p style={{ color: 'var(--ink-light)', fontStyle: 'italic', fontFamily: 'Lora, serif', textAlign: 'center', padding: '40px 0' }}>Nothing here yet.</p>}

            {archiveDays.filter(date => {
              if (date < '2026-05-01') return false
              const e = wh.load(date)
              if (archiveFilter === 'done') return e?.solved
              if (archiveFilter === 'missed') return !e?.solved
              return true
            }).map(date => {
              const e = wh.load(date)
              const isDone = e?.solved
              return (
                <div key={date} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '13px 16px', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: isDone ? 'pointer' : 'default' }}
                  onClick={isDone ? () => { setActivePuzzle(e); goTo('thread') } : undefined}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--ink-light)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>
                      {new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' })}{isDone && e.week_theme ? ` · ${e.week_theme}` : ''}
                    </div>
                    {isDone ? <div style={{ fontFamily: 'Lora, serif', fontSize: 18, fontWeight: 600, color: 'var(--gold)', margin: '2px 0' }}>{e.word}</div>
                      : <div style={{ fontSize: 14, color: 'var(--ink-light)', fontStyle: 'italic', margin: '2px 0' }}>Not played</div>}
                    {isDone && <div style={{ fontSize: 11, color: 'var(--ink-light)', fontStyle: 'italic', maxWidth: 260, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.journal_entry ? e.journal_entry.substring(0, 65) + '…' : 'No journal entry'}</div>}
                  </div>
                  <div style={{ flexShrink: 0, marginLeft: 12 }}>
                    {isDone
                      ? <div style={{ padding: '3px 9px', borderRadius: 10, fontSize: 10, fontWeight: 600, background: '#EDFBF0', color: '#2D7A45' }}>✓ Done</div>
                      : <button onClick={(ev) => { ev.stopPropagation(); handleStartPuzzle(date) }} style={{ padding: '6px 14px', background: 'var(--ink)', color: 'var(--cream)', borderRadius: 20, fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: 'Nunito, sans-serif' }}>Play →</button>}
                  </div>
                </div>
              )
            })}
          </div>
        )}

      </div>

      {/* BOTTOM NAV */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(250,247,240,0.96)', backdropFilter: 'blur(8px)', borderTop: '1px solid var(--border)', padding: '8px 14px', display: 'flex', justifyContent: 'space-around', maxWidth: 680, margin: '0 auto' }}>
        {[
          { icon: '⌂', label: 'Home', action: () => goTo('landing') },
          { icon: '✦', label: 'Today', action: goToDaily },
          { icon: '◎', label: 'Profile', action: openProfile },
          { icon: '◫', label: 'Archive', action: openArchive },
        ].map(n => (
          <button key={n.label} onClick={n.action} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '5px 13px', borderRadius: 10, cursor: 'pointer', background: 'none', border: 'none', fontFamily: 'Nunito, sans-serif' }}>
            <span style={{ fontSize: 16, lineHeight: 1 }}>{n.icon}</span>
            <span style={{ fontSize: 9, color: 'var(--ink-light)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{n.label}</span>
          </button>
        ))}
      </div>
    </>
  )
}

function SectionLabel({ children, style }) {
  return (
    <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-light)', fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, ...style }}>
      {children}
      <span style={{ flex: 1, height: 1, background: 'var(--border)', display: 'block' }} />
    </div>
  )
}

function AudioBar({ target, playing, onToggle, label, style }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#F8F4EC', borderRadius: 10, marginTop: 12, border: '1px solid var(--gold-light)', ...style }}>
      <button onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: playing ? 'var(--gold)' : 'var(--ink)', color: 'var(--cream)', border: 'none', borderRadius: 20, fontFamily: 'Nunito, sans-serif', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
        {playing ? '◼ Stop' : '▶ Listen'}
      </button>
      <span style={{ fontSize: 12, color: 'var(--ink-light)', fontStyle: 'italic', flex: 1 }}>
        {playing ? (target === 'riddle' ? 'Reading the riddle...' : 'Reading the reflection...') : label}
      </span>
      {playing && (
        <div className="audio-wave" style={{ display: 'flex', alignItems: 'center', gap: 2, height: 16 }}>
          {[0,1,2,3].map(i => <span key={i} style={{ display: 'block', width: 3, background: 'var(--gold)', borderRadius: 2 }} />)}
        </div>
      )}
    </div>
  )
}

function JournalEditor({ puzzle, date, onSave }) {
  const [text, setText] = useState(puzzle?.journal_entry || '')
  const [saved, setSaved] = useState(!!puzzle?.journal_entry)

  function handleSave() { onSave(text); setSaved(true) }

  return (
    <>
      <textarea value={text} onChange={e => { setText(e.target.value); setSaved(false) }}
        placeholder="Begin writing here..."
        style={{ width: '100%', minHeight: 145, padding: '13px 15px', border: '1.5px solid var(--border)', borderRadius: 12, fontFamily: 'Lora, serif', fontSize: 15, lineHeight: 1.75, background: 'var(--card)', color: 'var(--ink)', resize: 'vertical', outline: 'none' }} />
      <button onClick={handleSave} style={{ display: 'block', width: '100%', marginTop: 9, padding: 12, background: 'var(--ink)', color: 'var(--cream)', border: 'none', borderRadius: 12, fontFamily: 'Nunito, sans-serif', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
        Save Entry
      </button>
      {saved && <div style={{ textAlign: 'center', padding: 16, fontFamily: 'Lora, serif', fontStyle: 'italic', fontSize: 14, color: 'var(--sage)' }}>✦ Your words are kept.</div>}
    </>
  )
}
