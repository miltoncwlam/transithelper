import { NextResponse } from 'next/server';

export function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

export function deviceIdFrom(request) {
  return String(request.headers.get('x-device-id') || '').trim();
}

export function requireDevice(request) {
  const id = deviceIdFrom(request);
  if (!id) {
    return { id: null, error: json({ error: 'Missing X-Device-Id header' }, 400) };
  }
  return { id, error: null };
}
