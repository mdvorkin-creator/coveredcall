exports.handler = async function(event) {
  const ticker = event.queryStringParameters?.ticker;
  const expiry = event.queryStringParameters?.expiry; // YYYY-MM-DD
  const TRADIER_KEY = process.env.TRADIER_API_KEY;

  const hdrs = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  if (!ticker) return { statusCode: 400, headers: hdrs, body: JSON.stringify({ error: 'ticker requerido' }) };
  if (!TRADIER_KEY) return { statusCode: 500, headers: hdrs, body: JSON.stringify({ error: 'TRADIER_API_KEY no configurada en Netlify' }) };

  const TRADIER = 'https://api.tradier.com/v1/markets';
  const AUTH = { 'Authorization': `Bearer ${TRADIER_KEY}`, 'Accept': 'application/json' };

  try {
    // 1. Precio actual de la acción
    const quoteRes = await fetch(`${TRADIER}/quotes?symbols=${ticker}&greeks=false`, { headers: AUTH });
    const quoteData = await quoteRes.json();
    const q = quoteData?.quotes?.quote;
    if (!q) throw new Error(`No se encontró el ticker ${ticker}`);

    const stockPrice = q.last || q.close;
    const stockChange = q.change_percentage || 0;
    const high52 = q['52_week_high'] || 0;
    const low52 = q['52_week_low'] || 0;

    // 2. Expirations disponibles si no se pasó fecha
    let useExpiry = expiry;
    if (!useExpiry) {
      const expRes = await fetch(`${TRADIER}/options/expirations?symbol=${ticker}&includeAllRoots=false`, { headers: AUTH });
      const expData = await expRes.json();
      const dates = expData?.expirations?.date;
      if (!dates || dates.length === 0) throw new Error(`No hay vencimientos disponibles para ${ticker}`);
      useExpiry = Array.isArray(dates) ? dates[0] : dates;
    }

    // 3. Cadena de opciones para esa fecha
    const chainRes = await fetch(`${TRADIER}/options/chains?symbol=${ticker}&expiration=${useExpiry}&greeks=false`, { headers: AUTH });
    const chainData = await chainRes.json();
    const options = chainData?.options?.option;
    if (!options) throw new Error(`No hay opciones para ${ticker} en ${useExpiry}`);

    // Filtrar solo CALL OTM
    const calls = (Array.isArray(options) ? options : [options])
      .filter(o => o.option_type === 'call' && o.strike > stockPrice)
      .sort((a, b) => a.strike - b.strike)
      .slice(0, 10)
      .map(o => {
        let prima = o.last || 0;
        if (prima === 0 && o.bid > 0 && o.ask > 0) prima = (o.bid + o.ask) / 2;
        return {
          strike: o.strike,
          prima: parseFloat(prima.toFixed(2)),
          bid: o.bid || null,
          ask: o.ask || null,
          volumen: o.volume || null,
          oi: o.open_interest || null,
          iv: o.greeks?.mid_iv ? parseFloat((o.greeks.mid_iv * 100).toFixed(1)) : null
        };
      })
      .filter(c => c.prima > 0);

    // Formatear fecha para mostrar
    const expDate = new Date(useExpiry + 'T12:00:00');
    const expiryLabel = expDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const dias = Math.max(1, Math.ceil((expDate - hoy) / 86400000));

    return {
      statusCode: 200, headers: hdrs,
      body: JSON.stringify({ ticker, stockPrice, stockChange, high52, low52, expiryLabel, expiry: useExpiry, dias, calls })
    };

  } catch (err) {
    return { statusCode: 500, headers: hdrs, body: JSON.stringify({ error: err.message }) };
  }
};
