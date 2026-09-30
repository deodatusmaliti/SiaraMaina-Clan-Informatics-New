const REPOSITORY = process.env.GITHUB_REPOSITORY || 'deodatusmaliti/SiaraMaina-Clan-Informatics';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const DATA_PATH = 'siara-maina-clan-data.json';
const USERS_PATH = 'siara-maina-clan-users.json';

function githubUrl(path) {
  return `https://api.github.com/repos/${REPOSITORY}/contents/${path}`;
}

function githubHeaders() {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json'
  };
}

async function readGithubFile(path) {
  const response = await fetch(githubUrl(path), { headers: githubHeaders() });
  if (!response.ok) throw new Error(`GitHub read failed (${response.status})`);
  const file = await response.json();
  return {
    sha: file.sha,
    value: JSON.parse(Buffer.from(file.content.replace(/\n/g, ''), 'base64').toString('utf8'))
  };
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  if (!process.env.GITHUB_TOKEN) return { statusCode: 500, body: JSON.stringify({ error: 'GitHub integration is not configured.' }) };

  try {
    const { action, file, value, message } = JSON.parse(event.body || '{}');
    const path = file === 'users' ? USERS_PATH : DATA_PATH;
    if (action === 'read') {
      const result = await readGithubFile(path);
      return { statusCode: 200, body: JSON.stringify(result.value) };
    }
    if (action !== 'write' || !value || typeof value !== 'object') {
      return { statusCode: 400, body: JSON.stringify({ error: 'A valid synchronization action and value are required.' }) };
    }
    const existing = await readGithubFile(path);
    const response = await fetch(githubUrl(path), {
      method: 'PUT',
      headers: githubHeaders(),
      body: JSON.stringify({
        message: message || `Update ${path}`,
        content: Buffer.from(JSON.stringify(value, null, 2), 'utf8').toString('base64'),
        sha: existing.sha,
        branch: BRANCH
      })
    });
    if (!response.ok) throw new Error(`GitHub write failed (${response.status})`);
    return { statusCode: 200, body: JSON.stringify({ success: true, value }) };
  } catch (error) {
    const statusCode = /401|403/.test(error.message) ? 502 : 500;
    return { statusCode, body: JSON.stringify({ error: error.message }) };
  }
};