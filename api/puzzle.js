export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = process.env.ANTHROPIC_KEY;
  if (!apiKey) return res.status(500).json({ error: 'NO KEY' });
  const { date, weekTheme, type } = req.body;
  const theme = weekTheme || 'Reflection';
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1200,
        messages: [{ role: 'user', content: `Create a Whilo puzzle for ${date}. Theme: ${theme}. Return ONLY raw JSON no markdown: {"word":"STILLNESS","riddle":"I arrive when you stop looking for me","concept_clue":"The space between breaths","context_clue":"What settles over a house after an argument ends","behavior_clue":"It deepens when you stop chasing it","reflection":"270 words about STILLNESS using the word 5 times","world_note":null,"challenge":"Today pause somewhere unexpected","journal_prompt":"When did you last feel still?","solved_subtitle":"You found the quiet","week_theme":"${theme}"}` }]
      })
    });
    const d = await r.json();
    if (d.error) return res.status(500).json({ error: d.error.message });
    const puzzle = JSON.parse(d.content[0].text.trim().replace(/```json|```/g, '').trim());
    return res.status(200).json({ ...puzzle, date, guesses: [], cluesUsed: [] });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
