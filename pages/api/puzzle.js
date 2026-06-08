export const config = {
  maxDuration: 30
}
let adminApp = null

async function getAdminDb() {
  const { initializeApp, getApps, cert } = await import('firebase-admin/app')
  const { getFirestore } = await import('firebase-admin/firestore')
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY
  ? process.env.FIREBASE_PRIVATE_KEY
      .replace(/\\n/g, '\n')
      .replace(/^["']|["']$/g, '')
      .trim()
  : undefined,
      })
    })
  }
  return getFirestore()
}

const CLUE_SYSTEM = [
  'CRITICAL: You are writing for a FUN WORD GAME, not a wellness app. Every riddle must sound like a game show host, not a therapist.',
  '',
  'ABSOLUTE RULE — WORD BANK: You will be given a list of already-used words. Using ANY word from this list is a critical failure. Check every candidate word against this list before proceeding.',
  '',
  'WORD SELECTION:',
  '- The word can be ANYTHING: animal, object, food, weather, body part, sport, tool, vehicle, plant, clothing, place, action',
  '- Pick randomly from one of these categories each day: Animal, Food/drink, Weather/nature, Tool/object, Human body, Sport/game, Clothing/accessory, Place/structure, Action/sound, Plant/growth',
  '- The word should make someone say "oh of course!" when revealed',
  '- NEVER pick abstract concepts, emotions, or states of mind',
  '- 3-8 letters. NO common synonyms of similar length.',
  '- NEVER use: wreath, wrinkle, bridge, roots, root, anchor, tide, ember, threshold, mirror, fog, echo, shadow, drift, bloom, harbor, clearing, current, gravity, weight, stillness, soil, dirt, pupil, honey, lens, scar, puddle, shell, bread, whisker,',
  '',
  'RIDDLE RULES:',
  '- 3 sentences. Game show energy — punchy, confident, a little funny.',
  '- The riddle speaks AS the word using "I" or "me"',
  '- Vary the angle each day: sometimes lead with cause, sometimes where it shows up, sometimes what people do with it',
  '- At least one sentence must include something unexpected or abstract alongside real specific things — this creates misdirection',
  '- End with a short dry human truth that lands like a punchline',
  '- NEVER describe the word directly or name its category',
  '- NEVER be poetic, emotional, or motivational — this is a game not a wellness app',
  '- The answer should feel obvious the moment they get it, impossible before',
  '- Difficulty target: 4-5 guesses average',
  '',
  'GOOD EXAMPLE (word: DENT):',
  'Something hit me hard enough to leave a mark but not hard enough to finish the job. I am everywhere — your car, your trash can, your ego. Most people just learn to live with me.',
  'This is correct because it is punchy, specific, funny, and the answer feels obvious in hindsight.',
  '',
  'BAD EXAMPLE — NEVER write like this:',
  'I show up uninvited when you sleep, smile, or just exist long enough. I am not a flaw — I am evidence you have been alive.',
  'This is wrong because it is poetic, emotional, and reads like a self-help quote.',
  '',
  'HINT RULES:',
  '- Write exactly 3 hints: hint_1, hint_2, hint_3',
  '- Hint 1: Least helpful, most misdirecting — fits many wrong answers',
  '- Hint 2: More specific, rules out more wrong answers',
  '- Hint 3: Most specific — after this they should be down to 1-2 possible answers',
  '- All 3 together feel like a fun game show not a meditation app',
  '- NEVER write a hint that makes the answer obvious on its own',
  '',
  'REFLECTION:',
  '- 260-300 words. Use the word naturally exactly 5 times',
  '- Tone: honest, warm, grounded. Occasionally wry. NOT motivational-poster language.',
  '- Connect to real human experience',
  '',
  'CHALLENGE RULES:',
  '- One sentence starting with Today',
  '- Completely free — no buying, no spending, no acquiring anything',
  '- Doable in under 5 minutes',
  '- Connected to the word in a genuine way',
  '',
  'Return ONLY raw JSON. No markdown fences.'
].join('\n')

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
  signal: AbortSignal.timeout(25000),
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 800,
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
      console.log('Fetching word bank...')
      const db = await getAdminDb()
      console.log('Admin DB connected')
      const snap = await db.collection('dailyPuzzles').orderBy('createdAt', 'desc').limit(200).get()
      usedWords = snap.docs.map(d => d.data().word).filter(Boolean)
      console.log('Word bank loaded:', usedWords.length, 'words:', usedWords.join(', '))
    } catch (e) {
      console.error('Could not fetch used words:', e.message, e.code, e.stack?.split('\n')[0])
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
        max_tokens: 1000,
        system: CLUE_SYSTEM,
        messages: [{
          role: 'user',
          content: `Create a Whilo daily puzzle.
Date: ${dateLabel}
Week theme: "${theme}"
${isSunday ? 'Sunday — word should connect to the week theme.' : ''}
${worldInstruction}
BANNED WORDS — DO NOT USE ANY OF THESE UNDER ANY CIRCUMSTANCES: ${[...usedWords, ...(req.body.extraBanned || [])].filter(Boolean).join(', ') || 'none yet'}. 
Check your chosen word against this list. If it matches any word above, pick a completely different word.

Return ONLY raw JSON:
{
  "word": "WORD",
  "riddle": "2-3 sentence misdirecting riddle — first sentence should mislead, answer obvious only in hindsight",
  "hint_1": "least helpful most misdirecting clue",
"hint_2": "more specific narrows it down",
"hint_3": "most specific down to 1-2 answers",
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
    let text = d.content[0].text.trim().replace(/```json|```/g, '').trim()
// Find the JSON object boundaries
const jsonStart = text.indexOf('{')
const jsonEnd = text.lastIndexOf('}')
if (jsonStart === -1 || jsonEnd === -1) throw new Error('No JSON found in response')
text = text.slice(jsonStart, jsonEnd + 1)
const puzzle = JSON.parse(text)

    // Save to word bank
    // Save to word bank
try {
  const db = await getAdminDb()
  const ref = db.collection('dailyPuzzles').doc(date)
  const force = req.body.force || false
  const existing = await ref.get()
  if (!existing.exists || force) {
    await ref.set({ ...puzzle, date, approved: false, createdAt: new Date() })
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
