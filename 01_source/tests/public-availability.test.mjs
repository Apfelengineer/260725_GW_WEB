import assert from 'node:assert/strict';
import test from 'node:test';
import { japanToday, validatePublicAvailability } from '../origin/shared/app/lib/public-availability.ts';

const sample = () => ({ schemaVersion: 2, sourceVersion: 1, updatedAt: new Date().toISOString(), rangeStart: '2026-11-01', rangeEnd: '2027-01-31', rooms: [{ id: 'm6', name: '試験室', image: 'm6.png', description: '' }], availability: { m6: { '2026-11-06': 'morning_available' } } });
test('静的JSONを読み、空のPHP配列と将来の部屋追加を扱う', () => {
  const data = sample();
  data.rooms.push({ id: 'm9', name: '追加試験室', image: 'm9.png', description: '' });
  data.availability.m9 = [];
  assert.equal(validatePublicAvailability(data).rooms.length, 2);
});
test('予定原本、画像URL注入、未知の状態、期間外の日付を拒否する', () => {
  assert.throws(() => validatePublicAvailability({ ...sample(), schedules: [] }));
  const image = sample(); image.rooms[0].image = 'https://other.example/image.png';
  assert.throws(() => validatePublicAvailability(image));
  const state = sample(); state.availability.m6['2026-11-06'] = 'unknown';
  assert.throws(() => validatePublicAvailability(state));
  const outside = sample(); outside.availability.m6['2026-10-31'] = 'reserved';
  assert.throws(() => validatePublicAvailability(outside));
});
test('閲覧端末の時差によらず日本時間の月境界を使う', () => {
  const now = japanToday(Date.parse('2026-11-30T15:01:00Z'));
  assert.equal(now.getFullYear(), 2026);
  assert.equal(now.getMonth(), 11);
  assert.equal(now.getDate(), 1);
});
