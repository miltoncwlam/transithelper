import test from 'node:test';
import assert from 'node:assert/strict';
import { etaPrimaryText } from '../lib/etaDisplay.js';

test('clock mode shows the wall clock, not the countdown', () => {
  assert.equal(etaPrimaryText('clock', { clock: '下午1:05', minutesText: '7 分鐘' }), '下午1:05');
});

test('countdown mode shows minutes, not the clock', () => {
  assert.equal(etaPrimaryText('countdown', { clock: '下午1:05', minutesText: '7 分鐘' }), '7 分鐘');
});

test('empty feed stays empty in both modes', () => {
  assert.equal(etaPrimaryText('clock', { clock: '', minutesText: '7 分鐘' }), '');
  assert.equal(etaPrimaryText('countdown', { clock: '下午1:05', minutesText: '' }), '');
});
