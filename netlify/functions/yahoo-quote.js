exports.handler = async function(event) {
  const ticker = event.queryStringParameters?.ticker;
  if (!ticker) return { statusCode: 400, body: JSON.stringify({ error: 'ticker requerido' }) };

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    });

    if (!res.ok) throw new Error(`Yahoo respondió ${res.status}`);
    const data = await res.json();

    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) throw new Error('No se encontró el ticker ' + ticker);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        price: meta.regularMarketPrice,
        change: ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose * 100),
        high52: meta.fiftyTwoWeekHigh,
        low52: meta.fiftyTwoWeekLow,
        currency: meta.currency
      })
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
