// middlewares/rateLimit.js
const hits = new Map();

module.exports = function rateLimit({ windowMs = 60_000, max = 60 } = {}) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const bucket = hits.get(key) || [];
    // drop old
    while (bucket.length && now - bucket[0] > windowMs) bucket.shift();
    bucket.push(now);
    hits.set(key, bucket);
    if (bucket.length > max) {
      return res.status(429).json({ error: 'RATE_LIMITED' });
    }
    next();
  };
};
