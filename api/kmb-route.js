const cache = new Map();
const TTL = 24 * 60 * 60 * 1000;
const timeoutFetch = async (url) => {
  const ctl = new AbortController();
  const id = setTimeout(() => ctl.abort(), 10000);
  try { const r = await fetch(url, { signal: ctl.signal }); return r.json(); }
  finally { clearTimeout(id); }
};
export default async function handler(req, res) {
  const { route, direction, serviceType = 1, departureStopId, arrivalStopId } = req.query;
  if (!route || !direction || !departureStopId || !arrivalStopId) return res.status(400).json({ error: 'Missing params' });
  const key = `${route}:${direction}:${serviceType}`;
  let seqData = cache.get(key);
  if (!seqData || Date.now() - seqData.t > TTL) {
    const seq = await timeoutFetch(`https://data.etabus.gov.hk/v1/transport/kmb/route-stop/${route}/${direction}/${serviceType}`);
    seqData = { t: Date.now(), data: seq.data || [] }; cache.set(key, seqData);
  }
  const a = seqData.data.findIndex(s => s.stop === departureStopId || s.stop_id === departureStopId);
  const b = seqData.data.findIndex(s => s.stop === arrivalStopId || s.stop_id === arrivalStopId);
  if (a < 0 || b < 0 || b < a) return res.status(400).json({ error: 'Invalid stop range' });
  const slice = seqData.data.slice(a, b + 1).map(s => ({ stopId: s.stop || s.stop_id, seq: s.seq }));
  const names = await Promise.all(slice.map(s => timeoutFetch(`https://data.etabus.gov.hk/v1/transport/kmb/stop/${s.stopId}`)));
  const depEta = await timeoutFetch(`https://data.etabus.gov.hk/v1/transport/kmb/eta/${departureStopId}/${route}/${serviceType}`);
  const first = depEta.data?.find(x => x.eta)?.eta;
  if (!first) return res.status(200).json({ noService: true, stops: [] });
  const t0 = new Date(first);
  const etas = await Promise.all(slice.map(s => timeoutFetch(`https://data.etabus.gov.hk/v1/transport/kmb/eta/${s.stopId}/${route}/${serviceType}`)));
  const stops = slice.map((s, i) => {
    const eta = etas[i].data?.find(x => x.eta)?.eta;
    const offsetMinutes = eta ? Math.round((new Date(eta) - t0) / 60000) : 0;
    const projectedTime = new Date(t0.getTime() + offsetMinutes * 60000).toISOString();
    return { stopId: s.stopId, nameEn: names[i].data?.name_en || '', nameTc: names[i].data?.name_tc || '', seq: s.seq, isDeparture: i === 0, isArrival: i === slice.length - 1, projectedTime, offsetMinutes };
  });
  res.status(200).json({ departureTime: t0.toISOString(), totalMinutes: stops.at(-1)?.offsetMinutes || 0, noService: false, stops });
}
