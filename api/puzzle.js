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

CLUE RULES:
- CONCEPT clue: the idea or feeling the word evokes. Narrows thinking significantly
- CONTEXT clue: specific vivid real-world scene where this word lives. NOT vague
- BEHAVIOR clue: what the word actively does to people, places, or things

RIDDLE RULES:
- 2-3 sentences MAX. Every sentence must earn its place. No filler.
- Clever and playful with a light wit — like you are teasing the player, not lecturing them
- Use unexpected comparisons that make someone smile or raise an eyebrow
- A little mischief is good. Think game not meditation prompt
- Still poetic but with personality — the player should feel like they are being outsmarted by a friend
- After reading it players should have a general direction even without clues

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
  "riddle": "2-3 sentence playful poetic riddle",
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
