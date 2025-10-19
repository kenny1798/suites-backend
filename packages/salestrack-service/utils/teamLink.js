// utils/teamLink.js
const crypto = require('crypto');

function hashTeamName(teamOrName) {
  const name = (typeof teamOrName === 'string' ? teamOrName : teamOrName?.name || '')
    .trim()
    .toLowerCase();
  // short, URL-friendly fingerprint (first 8 chars of sha1)
  return crypto.createHash('sha1').update(name).digest('hex').slice(0, 8);
}

function verifyHashedTeamName(team, given) {
  return String(given) === hashTeamName(team);
}

module.exports = { hashTeamName, verifyHashedTeamName };
