const AppError = require('./AppError');

const MIN_PASSWORD_LENGTH = 12;

// Offline denylist — nothing about the password ever leaves this process.
// Kept small on purpose: the 12-character minimum already removes the bulk of
// guessable values, so this only needs to cover the long ones people still pick.
const COMMON_PASSWORDS = new Set([
  '123456', '1234567', '12345678', '123456789', '1234567890', '123456789012',
  'password', 'password1', 'password123', 'passw0rd', 'p@ssw0rd', 'p@ssword123',
  'qwerty', 'qwerty123', 'qwertyuiop', 'azerty', 'abc123', 'iloveyou',
  'admin', 'admin123', 'administrator', 'root', 'letmein', 'welcome',
  'welcome123', 'monkey', 'dragon', 'sunshine', 'princess', 'football',
  'baseball', 'superman', 'trustno1', 'master', 'shadow', 'michael',
  'changeme', 'changeit', 'secret', 'default', 'test1234', 'temp1234',
  'parking', 'parking123', 'pbms', 'pbms1234', 'vietnam', 'vietnam123',
  'khongbiet', 'matkhau', 'matkhau123',
]);

const isRepeatedCharacter = (value) => /^(.)\1+$/.test(value);

// "123456789012" / "abcdefghijkl" and their reverses — a 12-char minimum alone
// happily accepts these, so check the whole string for a single run.
const isSequentialRun = (value) => {
  if (value.length < 4) return false;
  const step = value.charCodeAt(1) - value.charCodeAt(0);
  if (step !== 1 && step !== -1) return false;
  for (let i = 2; i < value.length; i += 1) {
    if (value.charCodeAt(i) - value.charCodeAt(i - 1) !== step) return false;
  }
  return true;
};

// "password1234!" and "Password2024" are the same guess as "password".
const stripDecoration = (value) => value.replace(/[^a-z]+$/, '').replace(/^[^a-z]+/, '');

const findPasswordWeakness = (password) => {
  if (typeof password !== 'string' || !password) return 'Password is required';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }

  const normalized = password.toLowerCase();
  if (COMMON_PASSWORDS.has(normalized) || COMMON_PASSWORDS.has(stripDecoration(normalized))) {
    return 'This password is too common. Please choose a less predictable one.';
  }
  if (isRepeatedCharacter(normalized)) {
    return 'Password cannot be a single repeated character.';
  }
  if (isSequentialRun(normalized)) {
    return 'Password cannot be a sequential run of characters.';
  }
  return null;
};

const assertStrongPassword = (password) => {
  const weakness = findPasswordWeakness(password);
  if (weakness) throw new AppError(weakness, 400, 'WEAK_PASSWORD');
};

module.exports = { assertStrongPassword, findPasswordWeakness, MIN_PASSWORD_LENGTH };
