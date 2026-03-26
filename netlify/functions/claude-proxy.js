exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'API key no configurada. Agregá ANTHROPIC_API_KEY en las variables de entorno de Netlify.' })
    };
  }

  try {
    const body = JSON.parse(event.body);

    // Web search va en top-level beta header, no en el body
    const requestBody = { ...body };
    // Asegurarse que tools esté bien formado
    if (requestBody.tools) {
      requestBody.tools = requestBody.tools.map(t => {
        if (t.type === 'web_search_20250305') {
          return { type: 'web_search_20250305', name: 'web_search' };
        }
        return t;
      });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05'
      },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();

    // Si Anthropic devuelve error, propagarlo con mensaje claro
    if (!response.ok) {
      const msg = data?.error?.message || data?.error || JSON.stringify(data);
      return {
        statusCode: response.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: `Anthropic API error (${response.status}): ${msg}` })
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(data)
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message || String(err) })
    };
  }
};
