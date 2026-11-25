import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kstHour, collectionRoleAt } from './collection-window.mjs';

// KST 벽시계 문자열 → 타임스탬프
const kst = (hhmm) => Date.parse(`2026-11-25T${hhmm}:00+09:00`);

test('kstHour converts UTC to KST', () => {
  assert.equal(kstHour(Date.parse('2026-11-25T20:00:00Z')), 5); // KST 05:00
  assert.equal(kstHour(Date.parse('2026-11-25T07:00:00Z')), 16); // KST 16:00
  assert.equal(kstHour(Date.parse('2026-11-25T15:00:00Z')), 0); // KST 자정
});

test('home window is 05:00 ~ 06:59 KST only', () => {
  assert.equal(collectionRoleAt(kst('04:59')), null);
  assert.equal(collectionRoleAt(kst('05:00')), 'home');
  assert.equal(collectionRoleAt(kst('06:30')), 'home');
  assert.equal(collectionRoleAt(kst('06:59')), 'home');
  assert.equal(collectionRoleAt(kst('07:00')), null);
});

test('work window is 16:00 ~ 17:59 KST only', () => {
  assert.equal(collectionRoleAt(kst('15:59')), null);
  assert.equal(collectionRoleAt(kst('16:00')), 'work');
  assert.equal(collectionRoleAt(kst('17:30')), 'work');
  assert.equal(collectionRoleAt(kst('17:59')), 'work');
  assert.equal(collectionRoleAt(kst('18:00')), null);
});

test('other hours are outside the collection windows', () => {
  for (const hhmm of ['00:00', '07:01', '09:00', '12:00', '15:00', '18:01', '21:00', '23:59']) {
    assert.equal(collectionRoleAt(kst(hhmm)), null, hhmm);
  }
});
