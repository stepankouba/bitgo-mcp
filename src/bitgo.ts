const BASE_URL = 'https://app.bitgo.com';

export function getToken(): string {
  const token = process.env.BITGO_ACCESS_TOKEN;
  if (!token) throw new Error('BITGO_ACCESS_TOKEN environment variable is required');
  return token;
}

export async function bitgoGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`BitGo API error ${res.status} ${res.statusText}: ${body}`);
  }

  return res.json() as Promise<T>;
}
