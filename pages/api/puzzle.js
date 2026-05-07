export default async function handler(req, res) {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY;
  
  if (!apiKey) {
    return res.status(200).json({ status: 'NO KEY FOUND' });
  }

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 50,
        messages: [{ role: 'user', content: 'Say hello in 5 words.' }]
      })
    });

    const data = await r.json();
    return res.status(200).json({ status: 'GOT RESPONSE', data });

  } catch (e) {
    return res.status(200).json({ status: 'FETCH ERROR', error: e.message });
  }
}
