exports.handler = async function(event) {
  const ticker = event.queryStringParameters?.ticker;
  const date   = event.queryStringParameters?.date;
  if (!ticker) return { statusCode: 400, body: JSON.stringify({ error: 'ticker requerido' }) };

  const hdrs = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  const BASE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://finance.yahoo.com/'
  };

  try {
    // 1. Cookie
    let cookie = '';
    try {
      const cookieRes = await fetch('https://fc.yahoo.com', { headers: BASE_HEADERS, redirect: 'follow' });
      const rawCookie = cookieRes.headers.get('set-cookie') || '';
      const match = rawCookie.match(/A1=[^;]+/);
      if (match) cookie = match[0];
    } catch(e) {}

    // 2. Crumb
    let crumb = '';
    try {
      const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/csrfToken', {
        headers: { ...BASE_HEADERS, ...(cookie ? { Cookie: cookie } : {}) }
      });
      crumb = (await crumbRes.text()).trim();
    } catch(e) {}

    const crumbQ = crumb ? `&crumb=${encodeURIComponent(crumb)}` : '';
    const cookieH = cookie ? { Cookie: cookie } : {};
    const dateQ = date ? `&date=${date}` : '';

    const url = `https://query2.finance.yahoo.com/v7/finance/options/${ticker}?${dateQ}${crumbQ}`;
    const res = await fetch(url, { headers: { ...BASE_HEADERS, ...cookieH } });

    if (!res.ok) throw new Error(`Yahoo Finance respondió ${res.status} al obtener opciones`);

    const data = await res.json();
    const result = data?.optionChain?.result?.[0];
    if (!result) throw new Error('No se encontraron opciones para ' + ticker);

    const rawCalls = result?.options?.[0]?.calls || [];
    const expirations = result.expirationDates || [];

    const calls = rawCalls.map(c => {
      let prima = (c.lastPrice && c.lastPrice > 0) ? c.lastPrice : 0;
      if (prima === 0 && c.bid > 0 && c.ask > 0) prima = (c.bid + c.ask) / 2;
      return {
        strike: parseFloat(c.strike),
        prima: parseFloat((prima).toFixed(2)),
        bid: c.bid || null,
        ask: c.ask || null,
        volumen: c.volume || null,
        oi: c.openInterest || null,
        iv: c.impliedVolatility ? parseFloat((c.impliedVolatility * 100).toFixed(1)) : null
      };
    }).filter(c => c.prima > 0);

    return {
      statusCode: 200, headers: hdrs,
      body: JSON.stringify({ calls, expirations })
    };

  } catch (err) {
    return { statusCode: 500, headers: hdrs, body: JSON.stringify({ error: err.message }) };
  }
};
