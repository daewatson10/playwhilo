let adminApp = null

async function getAdminDb() {
  const { initializeApp, getApps, cert } = await import('firebase-admin/app')
  const { getFirestore } = await import('firebase-admin/firestore')
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n').replace(/^"|"$/g, ''),
      })
    })
  }
  return getFirestore()
}

const CLUE_SYSTEM = `You are the puzzle designer for Whilo, a mindful daily word game.

ABSOLUTE RULE — WORD BANK: You will be given a list of already-used words. Using ANY word from this list is a critical failure. Check every candidate word against this list before proceeding.

WORD SELECTION:
- The word can be ANYTHING: animal, object, food, weather, body part, sport, tool, vehicle, plant, clothing, place, action
- Pick randomly from one of these categories each day: Animal, Food/drink, Weather/nature, Tool/object, Human body, Sport/game, Clothing/accessory, Place/structure, Action/sound, Plant/growth
- The word should make someone say "oh of course!" when revealed
- NEVER pick abstract concepts, emotions, or states of mind
- 3-8 letters
- NO common synonyms of similar length — pick words where only one answer fits
- Pick words that have NO common synonym of similar length
- NEVER use these overused words: bridge, roots, root, anchor, tide, ember, threshold, mirror, fog, echo, shadow, drift, bloom, harbor, clearing, current, gravity, weight, stillness, soil, dirt, pupil

RIDDLE RULES:
- 2-3 sentences. Clever, witty, a little cheeky. Think puzzle not poem.
- The tone is a smart friend teasing you, not a philosopher musing
- Wordplay, misdirection, unexpected angles encouraged
- NO poetic language, NO whispers, NO arrives uninvited phrasing
- Makes someone smile and want to guess

CLUE RULES:
- CONCEPT: Witty and specific. Like a good quiz question. NOT philosophical
- CONTEXT: Specific funny or unexpected real-world scene. Makes you go oh obviously
- BEHAVIOR: What it does stated plainly with dry wit. Not abstract.
- All three clues together should feel like a fun game show not a meditation app

REFLECTION:
- 260-300 words. Use the word naturally exactly 5 times
- Tone: honest, warm, grounded. Occasionally wry
- NOT motivational-poster language

CHALLENGE RULES:
- One sentence starting with Today
- Must be completely free — no buying, no spending, no acquiring anything
- Should be doable in under 5 minutes
- Connected to the word in a genuine way

Return ONLY raw JSON. No markdown fences.`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.ANTHROPIC_KEY
  if (!apiKey) return res.status(500).json({ error: 'NO KEY' })

  const { date, weekTheme, type } = req.body
  const theme = weekTheme || 'Reflection'

  try {
    if (type === 'weekTheme') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 200,
          messages: [{ role: 'user', content: 'Generate a weekly theme for Whilo (a mindful word game). Themes should be universal and human. Return ONLY raw JSON no markdown: {"theme_name":"Patience","theme_description":"A week on the quiet art of waiting"}' }]
        })
      })
      const d = await r.json()
      if (d.error) return res.status(500).json({ error: d.error.message })
      const parsed = JSON.parse(d.content[0].text.trim().replace(/```json|```/g, '').trim())
      return res.status(200).json(parsed)
    }

    // Fetch used words from Firestore word bank
    let usedWords = []
    try {
      const db = await getAdminDb()
      const snap = await db.collection('dailyPuzzles').orderBy('createdAt', 'desc').limit(200).get()
      usedWords = snap.docs.map(d => d.data().word).filter(Boolean)
    } catch (e) {
      console.error('Could not fetch used words:', e)
    }

    const parsedDate = new Date(date + 'T12:00:00')
    const dateLabel = parsedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    const isSunday = parsedDate.getDay() === 0
    const useWorld = Math.random() > 0.6
    const worldInstruction = useWorld
      ? 'Include "world_note": 1-2 sentences connecting the word to a real universal human or natural observation — never political.'
      : 'Set "world_note": null.'

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1400,
        system: CLUE_SYSTEM,
        messages: [{
          role: 'user',
          content: `Create a Whilo daily puzzle.
Date: ${dateLabel}
Week theme: "${theme}"
${isSunday ? 'Sunday — word should connect to the week theme.' : ''}
${worldInstruction}
BANNED WORDS — DO NOT USE ANY OF THESE UNDER ANY CIRCUMSTANCES: ${usedWords.length > 0 ? usedWords.join(', ') : 'none yet'}.
Check your chosen word against this list. If it matches any word above, pick a completely different word.

Return ONLY raw JSON:
{
  "word": "WORD",
  "riddle": "2-3 sentence clever witty riddle — puzzle energy not poetry energy",
  "concept_clue": "witty specific clue like a good quiz question",
  "context_clue": "specific unexpected real-world scene",
  "behavior_clue": "what it does stated with dry wit",
  "reflection": "260-300 words using word exactly 5 times",
  "world_note": null,
  "challenge": "Today do one specific gentle free action — NEVER suggest buying anything",
  "journal_prompt": "One honest open-ended question",
  "solved_subtitle": "Short poetic line for word reveal",
  "week_theme": "${theme}",
  "synonyms": ["2-3 common synonyms players might guess"]
}`
        }]
      })
    })

    const d = await r.json()
    if (d.error) return res.status(500).json({ error: d.error.message })
    const text = d.content[0].text.trim().replace(/```json|```/g, '').trim()
    const puzzle = JSON.parse(text)

    // Save to word bank
    try {
      const db = await getAdminDb()
      const ref = db.collection('dailyPuzzles').doc(date)
      const existing = await ref.get()
      if (!existing.exists) {
        await ref.set({ ...puzzle, date, createdAt: new Date() })
      }
    } catch (e) {
      console.error('Could not save to word bank:', e)
    }

    return res.status(200).json({ ...puzzle, date, guesses: [], cluesUsed: [] })

  } catch (e) {
    console.error('Puzzle error:', e)
    return res.status(500).json({ error: e.message })
  }
}
