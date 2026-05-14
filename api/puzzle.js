export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_KEY;
  if (!apiKey) return res.status(500).json({ error: 'NO KEY' });

  const { date, weekTheme, type } = req.body;
  const theme = weekTheme || 'Reflection';

  const SYSTEM = `You are the puzzle designer for Whilo, a mindful daily word game.

WORD SELECTION — most important rule:
- Pick a CONCRETE or semi-concrete word. Good examples: tide, ember, harbor, fog, mirror, threshold, drift, anchor, clearing, echo, gravity, current, shadow, bloom, weight
- The word can be a noun, a place, or a simple verb used as a concept
- NEVER pick abstract states ending in -ness, -tion, -ity, -ance, -ment
- The word should be 4-8 letters
- Target difficulty: someone should guess it in 2-3 tries with clues revealed
- After clue 1: 20% guess it. After clue 2: 50%. After clue 3: 80%

RIDDLE RULES:
- 2-3 sentences. Clever, witty, a little cheeky. Think puzzle not poem.
- The tone is a smart friend teasing you, not a philosopher musing
- Wordplay, misdirection, and unexpected angles are encouraged
- NO poetic language, NO "whispers", NO "arrives uninvited" type phrasing
- It should make someone smile and want to guess, not reflect

CLUE RULES:
- CONCEPT: Witty and specific. Like a good quiz question. NOT philosophical
- CONTEXT: A specific funny or unexpected real-world scene. Makes you go "oh obviously"
- BEHAVIOR: What it does — stated plainly with a dry wit. Not abstract.
- All three clues together should feel like a fun game show, not a meditation app

REFLECTION (Today's Thread):
- 260-300 words. Use the word naturally exactly 5 times
- Tone: honest, warm, grounded. Occasionally wry
- NOT motivational-poster language. Write like something you would underline in a good essay
- Connect to real human experience — relationships, work, nature, daily life

Return ONLY raw JSON. No markdown fences. No extra text.`;

  try {
    if (type === 'weekTheme') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 200,
          messages: [{ role: 'user', content: 'Generate a weekly theme for Whilo (a mindful word game). Themes should be universal and human. Return ONLY raw JSON: {"theme_name":"Patience","theme_description":"A week on the quiet art of waiting"}' }]
        })
      });
      const d = await r.json();
      if (d.error) return res.status(500).json({ error: d.error.message });
      const parsed = JSON.parse(d.content[0].text.trim().replace(/```json|```/g, '').trim());
      return res.status(200).json(parsed);
    }

    const parsedDate = new Date(date + 'T12:00:00');
    const dateLabel = parsedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const isSunday = parsedDate.getDay() === 0;
    const useWorld = Math.random() > 0.6;
    const worldInstruction = useWorld
      ? 'Include "world_note": 1-2 sentences connecting the word to a real universal human or natural observation — never political.'
      : 'Set "world_note": null.';

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1400,
        system: SYSTEM,
        messages: [{
          role: 'user',
          content: `Create a Whilo daily puzzle.
Date: ${dateLabel}
Week theme: "${theme}"
${isSunday ? 'This is Sunday — slightly harder than usual, word should connect to the week theme.' : ''}
${worldInstruction}

Return ONLY this raw JSON with no markdown:
{
  "word": "CONCRETE_WORD",
  "riddle": "2-3 sentence clever witty riddle — puzzle energy, not poetry energy",
  "concept_clue": "the idea or feeling this word evokes",
  "context_clue": "specific vivid real-world scene",
  "behavior_clue": "what this word actively does",
  "reflection": "260-300 words using the word exactly 5 times",
  "world_note": null,
  "challenge": "Today do one specific gentle action tied to the word",
  "journal_prompt": "One honest open-ended question connecting this word to the readers life",
  "solved_subtitle": "Short poetic line for the word reveal moment",
  "week_theme": "${theme}"
}`
        }]
      })
    });

    const d = await r.json();
    if (d.error) return res.status(500).json({ error: d.error.message });
    const text = d.content[0].text.trim().replace(/```json|```/g, '').trim();
    const puzzle = JSON.parse(text);
    return res.status(200).json({ ...puzzle, date, guesses: [], cluesUsed: [] });

  } catch (e) {
    console.error('Puzzle error:', e);
    return res.status(500).json({ error: e.message });
  }
}
