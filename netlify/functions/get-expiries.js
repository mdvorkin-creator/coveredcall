exports.handler = async function(event) {
  const ticker = event.queryStringParameters?.ticker;
  const hdrs   = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (!ticker) return { statusCode: 400, headers: hdrs, body: JSON.stringify({ error: 'ticker requerido' }) };

  const TOKEN = process.env.MARKETDATA_TOKEN;
  if (!TOKEN) return { statusCode: 500, headers: hdrs, body: JSON.stringify({ error: 'MARKETDATA_TOKEN no configurado' }) };

  try {
    // Traer toda la cadena sin filtrar expiry para obtener todas las fechas
    // Usamos strikeLimit=1 para minimizar datos — solo necesitamos las fechas
    const res = await fetch(
      `https://api.marketdata.app/v1/options/chain/${ticker}/?side=call&strikeLimit=1`,
      { headers: { 'Authorization': `Bearer ${TOKEN}` } }
    );
    if (!res.ok) throw new Error(`MarketData respondió ${res.status}`);
    const data = await res.json();

    if (!data.expiration || data.expiration.length === 0)
      throw new Error('Sin fechas de expiración disponibles');

    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const seisMeses = new Date(hoy); seisMeses.setMonth(seisMeses.getMonth() + 6);

    // Agrupar por fecha y sumar volumen
    const fechaMap = {};
    data.expiration.forEach((ts, i) => {
      const d = new Date(ts * 1000);
      if (d < hoy || d > seisMeses) return;
      const key = d.toISOString().split('T')[0]; // YYYY-MM-DD
      if (!fechaMap[key]) fechaMap[key] = { ts, vol: 0, oi: 0, count: 0 };
      fechaMap[key].vol   += data.volume?.[i]       || 0;
      fechaMap[key].oi    += data.openInterest?.[i] || 0;
      fechaMap[key].count += 1;
    });

    // Ordenar por fecha, tomar las que tienen mayor volumen total
    const expiries = Object.entries(fechaMap)
      .map(([date, v]) => ({
        date,
        label: new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' }),
        dias: Math.ceil((new Date(date + 'T12:00:00') - hoy) / 86400000),
        vol: v.vol,
        oi: v.oi
      }))
      .sort((a, b) => a.dias - b.dias); // ordenar por fecha asc

    // Marcar las 3 de mayor volumen
    const maxVol = Math.max(...expiries.map(e => e.vol));
    expiries.forEach(e => { e.topVol = e.vol >= maxVol * 0.5; });

    return {
      statusCode: 200, headers: hdrs,
      body: JSON.stringify({ ticker, expiries })
    };

  } catch(err) {
    return { statusCode: 500, headers: hdrs, body: JSON.stringify({ error: err.message }) };
  }
};
