export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
  }

  try {
    const { model, contents } = req.body;
    const targetModel = model || 'gemini-3.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`;
    const body = JSON.stringify({ contents });
    const maxRetries = 6;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      if (response.status === 429 && attempt < maxRetries) {
        // Exponential backoff: 2s, 4s, 8s, 16s, 32s, 64s
        const waitMs = Math.pow(2, attempt + 1) * 1000 + Math.random() * 2000;
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }

      const data = await response.json();

      if (!response.ok) {
        return res.status(response.status).json(data);
      }

      return res.status(200).json(data);
    }

    return res.status(429).json({ error: 'Rate limited after retries' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
