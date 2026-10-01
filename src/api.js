const API_BASE = '';

export async function submitContact(name, email, message) {
  const res = await fetch(`${API_BASE}/api/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, message }),
  });
  return res.json();
}

export async function getContacts() {
  const res = await fetch(`${API_BASE}/api/contact`);
  return res.json();
}

export async function subscribeNewsletter(email) {
  const res = await fetch(`${API_BASE}/api/newsletter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  return res.json();
}

export async function getStats() {
  const res = await fetch(`${API_BASE}/api/stats`);
  return res.json();
}

export async function saveContent(key, value) {
  const res = await fetch(`${API_BASE}/api/content`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  });
  return res.json();
}

export async function getContent(key) {
  const res = await fetch(`${API_BASE}/api/content?key=${encodeURIComponent(key)}`);
  return res.json();
}

export async function trackVisitor(path) {
  const res = await fetch(`${API_BASE}/api/visitor?path=${encodeURIComponent(path)}`, { method: 'POST' });
  return res.json();
}