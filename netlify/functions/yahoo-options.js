exports.handler = async function(event) {
  const ticker = event.queryStringParameters?.ticker;
  const date   = event.queryStringParameters?.date; // Unix timestamp

  if (!ticker) return { statusCode: 400, body: JSON.stringify({ error: 'ticker requerido' }) };

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };

  try {
    const dateParam = date ? `&date=${date}` : '';
    const url = `https://query1.finance.yahoo.com/v7/finance/options/${ticker}?${dateParam}`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    });

    if (!res.ok) throw new Error(`Yahoo respondió ${res.status}`);
    const data = await res.json();

    const result = data?.optionChain?.result?.[0];
    if (!result) throw new Error('No se encontraron opciones para ' + ticker);

    const rawCalls = result?.options?.[0]?.calls || [];

    // Mapear al formato que necesita el frontend
    const calls = rawCalls.map(c => {
      // Prima: usar lastPrice, o mid de bid/ask si lastPrice es 0
      let prima = c.lastPrice || 0;
      if (prima === 0 && c.bid && c.ask) prima = (c.bid + c.ask) / 2;

      return {
        strike: c.strike,
        prima: parseFloat(prima.toFixed(2)),
        bid: c.bid || null,
        ask: c.ask || null,
        volumen: c.volume || null,
        oi: c.openInterest || null,
        iv: c.impliedVolatility ? parseFloat((c.impliedVolatility * 100).toFixed(1)) : null
      };
    }).filter(c => c.prima > 0);

    // Fechas de vencimiento disponibles
    const expirations = result.expirationDates || [];

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ calls, expirations })
    };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
