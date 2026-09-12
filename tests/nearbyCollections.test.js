import test from 'node:test';
import assert from 'node:assert/strict';
import {
  nearbyKindOf,
  nearbyCollectionTitle,
  replaceNearbyKind,
  collapseNearbyKinds,
  splitHomes
} from '../lib/nearbyCollections.js';

test('nearby kind defaults to home and treats work separately', () => {
  assert.equal(nearbyKindOf({ type: 'arrival' }), null);
  assert.equal(nearbyKindOf({ type: 'nearby', payload: { lat: 1, lng: 2 } }), 'home');
  assert.equal(nearbyKindOf({ type: 'nearby', payload: { kind: 'work' } }), 'work');
});

test('saving home nearby replaces the previous home and keeps work', () => {
  const home1 = { id: 'a', type: 'nearby', payload: { kind: 'home', lat: 22.3, lng: 114.1 } };
  const work = { id: 'b', type: 'nearby', payload: { kind: 'work', lat: 22.4, lng: 114.2 } };
  const route = { id: 'c', type: 'arrival', payload: { route: '1' } };
  const home2 = { id: 'd', type: 'nearby', payload: { kind: 'home', lat: 22.31, lng: 114.17 } };
  const next = replaceNearbyKind([home1, work, route], 'home', home2);
  assert.deepEqual(next.map((row) => row.id), ['d', 'b', 'c']);
});

test('collapse keeps one home nearby even if two ids exist', () => {
  const older = { id: 'old', type: 'nearby', payload: { kind: 'home' }, createdAt: '2026-01-01T00:00:00.000Z' };
  const newer = { id: 'new', type: 'nearby', payload: { kind: 'home' }, createdAt: '2026-09-12T00:00:00.000Z' };
  const work = { id: 'w', type: 'nearby', payload: { kind: 'work' }, createdAt: '2026-09-01T00:00:00.000Z' };
  assert.deepEqual(collapseNearbyKinds([older, newer, work]).map((row) => row.id), ['new', 'w']);
});

test('collections sit above saved routes, home before work', () => {
  const { collections, routes } = splitHomes([
    { id: 'r', type: 'arrival', title: { zh: '1' } },
    { id: 'w', type: 'nearby', payload: { kind: 'work' } },
    { id: 'h', type: 'nearby', payload: { kind: 'home' } }
  ]);
  assert.deepEqual(collections.map((row) => row.id), ['h', 'w']);
  assert.deepEqual(routes.map((row) => row.id), ['r']);
  assert.equal(nearbyCollectionTitle('home').zh, '回家附近');
  assert.equal(nearbyCollectionTitle('work').en, 'Work nearby');
});
