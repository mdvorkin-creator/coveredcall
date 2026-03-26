exports.handler = async function(event) {
  const ticker  = event.queryStringParameters?.ticker;
  const expiry  = event.queryStringParameters?.expiry;
  const hdrs    = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (!ticker) return { statusCode: 400, headers: hdrs, body: JSON.stringify({ error: 'ticker requerido' }) };

  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

  try {
    // PASO 1: obtener cookie + crumb desde Yahoo
    let cookie = '';
    let crumb  = '';

    // Primer request a Yahoo para obtener cookie de sesión
    const initRes = await fetch('https://finance.yahoo.com/quote/' + ticker, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      redirect: 'follow'
    });

    // Extraer cookie del header set-cookie
    const setCookie = initRes.headers.get('set-cookie') || '';
    // Buscar cookie A1 o similar que Yahoo usa para autenticación
    const cookieParts = setCookie.split(',').map(c => c.trim().split(';')[0]);
    cookie = cookieParts.filter(c => c.includes('=')).join('; ');

    // PASO 2: obtener crumb usando la cookie
    const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/csrfToken', {
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json',
        'Cookie': cookie
      }
    });
    if (crumbRes.ok) {
      crumb = (await crumbRes.text()).trim();
      // El crumb a veces viene en JSON
      try { const j = JSON.parse(crumb); crumb = j.crumb || crumb; } catch(e) {}
    }

    const reqHeaders = {
      'User-Agent': UA,
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://finance.yahoo.com/',
      ...(cookie ? { 'Cookie': cookie } : {})
    };

    // PASO 3: precio actual
    const crumbParam = crumb ? `&crumb=${encodeURIComponent(crumb)}` : '';
    const qRes  = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d${crumbParam}`,
      { headers: reqHeaders }
    );
    if (!qRes.ok) throw new Error(`No se pudo obtener precio de ${ticker} (${qRes.status})`);
    const qData = await qRes.json();
    const meta  = qData?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) throw new Error(`Ticker ${ticker} no encontrado`);

    const stockPrice  = meta.regularMarketPrice;
    const prevClose   = meta.chartPreviousClose || meta.previousClose || stockPrice;
    const stockChange = ((stockPrice - prevClose) / prevClose * 100);
    const high52      = meta.fiftyTwoWeekHigh || 0;
    const low52       = meta.fiftyTwoWeekLow  || 0;

    // PASO 4: opciones
    const expTimestamp = expiry ? Math.floor(new Date(expiry + 'T12:00:00').getTime() / 1000) : '';
    const optUrl = `https://query1.finance.yahoo.com/v7/finance/options/${ticker}${expTimestamp ? '?date=' + expTimestamp + crumbParam.replace('&','&') : (crumb ? '?' + crumbParam.slice(1) : '')}`;

    const oRes  = await fetch(optUrl, { headers: reqHeaders });
    if (!oRes.ok) throw new Error(`Opciones no disponibles (${oRes.status}). Intentá de nuevo.`);
    const oData = await oRes.json();

    const result   = oData?.optionChain?.result?.[0];
    if (!result)   throw new Error('Sin datos de opciones para ' + ticker);

    const rawCalls        = result?.options?.[0]?.calls || [];
    const expirationDates = result.expirationDates || [];
    const actualTs        = result?.options?.[0]?.expirationDate || expirationDates[0];
    const actualDate      = new Date(actualTs * 1000);
    const expiryLabel     = actualDate.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
    const hoy             = new Date(); hoy.setHours(0,0,0,0);
    const dias            = Math.max(1, Math.ceil((actualDate - hoy) / 86400000));

    const calls = rawCalls
      .map(c => {
        let prima = (c.lastPrice && c.lastPrice > 0) ? c.lastPrice : 0;
        if (!prima && c.bid > 0 && c.ask > 0) prima = (c.bid + c.ask) / 2;
        return {
          strike:  parseFloat(c.strike),
          prima:   parseFloat(prima.toFixed(2)),
          bid:     c.bid          || null,
          ask:     c.ask          || null,
          volumen: c.volume       || null,
          oi:      c.openInterest || null,
          iv:      c.impliedVolatility ? parseFloat((c.impliedVolatility * 100).toFixed(1)) : null
        };
      })
      .filter(c => c.strike > stockPrice && c.prima > 0)
      .sort((a, b) => a.strike - b.strike)
      .slice(0, 10);

    if (calls.length === 0) {
      const available = expirationDates
        .map(ts => new Date(ts * 1000).toISOString().split('T')[0])
        .slice(0, 6).join(', ');
      throw new Error(`Sin calls OTM para ese vencimiento. Fechas disponibles: ${available}`);
    }

    return {
      statusCode: 200, headers: hdrs,
      body: JSON.stringify({ ticker, stockPrice, stockChange, high52, low52, expiryLabel, dias, calls })
    };

  } catch (err) {
    return { statusCode: 500, headers: hdrs, body: JSON.stringify({ error: err.message }) };
  }
};
