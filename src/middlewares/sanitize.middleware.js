// Strips Mongo operator keys ($ne, $gt, $where...) and dotted paths from
// req.body/query/params so they can never reach a Mongoose filter as an
// object (NoSQL injection via `?building[$ne]=null`-style query strings).
const isPlainObject = (value) =>
  Object.prototype.toString.call(value) === "[object Object]";

const sanitizeValue = (value) => {
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (isPlainObject(value)) {
    const clean = {};
    for (const [key, val] of Object.entries(value)) {
      if (key.startsWith("$") || key.includes(".")) continue;
      clean[key] = sanitizeValue(val);
    }
    return clean;
  }
  return value;
};

const sanitizeInputs = (req, _res, next) => {
  if (req.body) req.body = sanitizeValue(req.body);
  if (req.query) {
    const clean = sanitizeValue(req.query);
    Object.keys(req.query).forEach((key) => delete req.query[key]);
    Object.assign(req.query, clean);
  }
  if (req.params) req.params = sanitizeValue(req.params);
  next();
};

module.exports = { sanitizeInputs };
