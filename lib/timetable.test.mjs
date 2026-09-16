import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseHHMM,
  formatHHMM,
  generateDayTimes,
  timesFromHour,
  dateNWeeksAgo,
  buildTimesForStation,
  estimateTravelMin,
} from './timetable.mjs';

test('parseHHMM accepts colon and compact forms', () => {
  assert.equal(parseHHMM('21:11'), 21 * 60 + 11);
  assert.equal(parseHHMM('440'), 4 * 60 + 40);
  assert.equal(parseHHMM('0440'), 4 * 60 + 40);
  assert.equal(parseHHMM(''), null);
});

test('generateDayTimes uses peak intervals on weekday evenings', () => {
  const times = generateDayTimes(parseHHMM('05:00'), parseHHMM('23:00'), 8, 15, 3);
  assert.ok(times.length > 20);
  const evening = times.filter((m) => m >= 17 * 60 && m < 20 * 60);
  const gaps = [];
  for (let i = 1; i < evening.length; i += 1) gaps.push(evening[i] - evening[i - 1]);
  assert.ok(gaps.every((g) => g === 8));
});

test('timesFromHour includes the next hour window', () => {
  const times = [21, 21, 22].map((h, i) => ({ min: h * 60 + i, hhmm: formatHHMM(h * 60 + i) }));
  const sliced = timesFromHour(times, 21);
  assert.equal(sliced.length, 3);
  assert.equal(timesFromHour(times, 20).length, 2);
});

test('dateNWeeksAgo labels match screenshot style', () => {
  const now = new Date('2026-09-16T12:00:00+09:00');
  const w1 = dateNWeeksAgo(3, 1, now);
  const w2 = dateNWeeksAgo(3, 2, now);
  const w3 = dateNWeeksAgo(3, 3, now);
  assert.equal(w1.label, '9.9.(수)');
  assert.equal(w2.label, '9.2.(수)');
  assert.equal(w3.label, '8.26.(수)');
});

test('buildTimesForStation adds travel time from origin', () => {
  const stations = [
    { stationId: '1', stationName: '기점', stationSeq: 1, lat: 37.2, lng: 127.07, turnYn: 'N' },
    { stationId: '2', stationName: '솔빛마을', stationSeq: 2, lat: 37.21, lng: 127.07, turnYn: 'N' },
    { stationId: '3', stationName: '서울', stationSeq: 10, lat: 37.5, lng: 127.03, turnYn: 'Y' },
  ];
  const info = {
    upFirstTime: '05:00',
    upLastTime: '22:40',
    peekAlloc: 15,
    nPeekAlloc: 20,
    routeTypeCd: 14,
    endStationName: '서울',
    startStationName: '기점',
  };
  const result = buildTimesForStation(info, stations, '2', 3);
  assert.equal(result.error, undefined);
  assert.ok(result.travelMin >= 0);
  assert.ok(result.times.length > 0);
  assert.equal(result.times.at(-1).last, true);
  assert.equal(result.nextStationName, '서울');
  assert.ok(result.times[0].min >= parseHHMM('05:00'));
});

test('estimateTravelMin is zero at origin', () => {
  const stations = [
    { lat: 37.2, lng: 127.0 },
    { lat: 37.3, lng: 127.0 },
  ];
  assert.equal(estimateTravelMin(stations, 0, 0, 14), 0);
  assert.ok(estimateTravelMin(stations, 0, 1, 14) > 0);
});

test('dateNWeeksAgo uses this week minus N weeks', () => {
  const now = new Date('2026-09-16T12:00:00+09:00');
  const fri = dateNWeeksAgo(5, 1, now);
  assert.equal(fri.label, '9.11.(금)');
});
