import jwt from 'jsonwebtoken';

export function createAuth(jwtSecret) {
  const sign = (user) => jwt.sign({ sub: String(user._id), username: user.username }, jwtSecret, { expiresIn: '30d' });

  const verify = (token) => {
    try {
      const p = jwt.verify(token, jwtSecret);
      return { id: p.sub, username: p.username };
    } catch {
      return null;
    }
  };

  const fromHeader = (req) => {
    const h = req.headers.authorization || '';
    return h.startsWith('Bearer ') ? verify(h.slice(7)) : null;
  };

  const optionalAuth = (req, _res, next) => {
    req.user = fromHeader(req);
    next();
  };

  const requireAuth = (req, res, next) => {
    req.user = fromHeader(req);
    if (!req.user) return res.status(401).json({ error: 'Avval akkauntga kiring' });
    next();
  };

  return { sign, verify, optionalAuth, requireAuth };
}
