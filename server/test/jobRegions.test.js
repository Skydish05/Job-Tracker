import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REGIONS, regionMatches, regionSearchLocation } from '../services/jobRegions.js';

const selected = REGIONS.filter((region) => region.id !== 'all').map((region) => region.id);
const job = (location, remote = false) => ({ location, remote });

test('all requested regions have stable IDs and explicit search locations', () => {
  assert.deepEqual(REGIONS.map((region) => region.id), ['all', 'seoul', 'north-america', 'europe', 'singapore', 'hong-kong']);
  assert.equal(regionMatches({}, 'all'), true);
  assert.equal(regionMatches(job('Seoul'), 'unknown'), false);
  assert.equal(regionSearchLocation('all'), '');
  assert.equal(regionSearchLocation('seoul'), 'Seoul, South Korea');
  assert.match(regionSearchLocation('north-america'), /United States, Canada, Mexico/);
});

test('country names, common cities and Korean aliases match their region', () => {
  const locations = {
    seoul: ['Seoul, South Korea', '서울', '서울특별시 강남구'],
    'north-america': ['US', 'U.S.', 'USA', 'United States', 'Canada', 'México', 'NY', 'NYC', 'New York', 'SF', 'San Francisco', 'Toronto', '몬트리올', '미국 / 캐나다'],
    europe: ['Europe', 'EU only', 'EEA', 'UK', 'United Kingdom', 'Germany', 'Deutschland', 'Berlin', 'München', 'Duesseldorf', 'Köln', 'Bad Griesbach', 'Frankfurt am Main', 'Paris', 'Warsaw', 'Prague', '유럽', '독일', '영국'],
    singapore: ['Singapore', '싱가포르', 'Singapore (Hybrid)'],
    'hong-kong': ['Hong Kong', 'Hong-Kong', 'Hongkong', 'HK', '홍콩', '香港'],
  };
  for (const [region, values] of Object.entries(locations)) {
    for (const location of values) assert.equal(regionMatches(job(location), region), true, `${location} should match ${region}`);
  }
});

test('whole words prevent country-code and city substring false positives', () => {
  for (const location of ['Australia', 'Austria', 'Russia', 'Business district', 'AUS', 'Belarus', 'Lausanne']) {
    assert.equal(regionMatches(job(location), 'north-america'), false, location);
  }
  assert.equal(regionMatches(job('New York'), 'europe'), false);
  assert.equal(regionMatches(job('Australia'), 'europe'), false);
  assert.equal(regionMatches(job('Hongkongers worldwide'), 'hong-kong'), false);
  assert.equal(regionMatches(job('Seoulton'), 'seoul'), false);
});

test('explicit global remote availability matches every selected region', () => {
  for (const location of ['Worldwide', 'Anywhere', 'Global', '전 세계']) {
    for (const region of selected) assert.equal(regionMatches(job(location, true), region), true, `${location}: ${region}`);
  }
  for (const region of selected) assert.equal(regionMatches(job('Remote — worldwide'), region), true);
});

test('generic remote, unknown locations and worldwide without remote evidence do not infer a region', () => {
  for (const location of ['', 'Remote', 'Unknown', 'Global', 'Worldwide']) {
    for (const region of selected) assert.equal(regionMatches(job(location), region), false, `${location}: ${region}`);
  }
  for (const region of selected) assert.equal(regionMatches(job('Remote', true), region), false);
});

test('nationwide South Korea remote work includes Seoul; onsite elsewhere does not', () => {
  for (const location of ['South Korea', '대한민국', '한국']) {
    assert.equal(regionMatches(job(location, true), 'seoul'), true);
    assert.equal(regionMatches(job(location), 'seoul'), false);
  }
  assert.equal(regionMatches(job('Remote, South Korea'), 'seoul'), true);
  assert.equal(regionMatches(job('Busan, South Korea'), 'seoul'), false);
  assert.equal(regionMatches(job('North Korea', true), 'seoul'), false);
});

test('explicit restrictions override conflicting global labels', () => {
  for (const location of ['Worldwide (US only)', 'United States only; Worldwide', 'Global remote; candidates in Canada', 'Anywhere in North America']) {
    assert.equal(regionMatches(job(location, true), 'north-america'), true, location);
    for (const region of selected.filter((id) => id !== 'north-america')) assert.equal(regionMatches(job(location, true), region), false, `${location}: ${region}`);
  }
  assert.equal(regionMatches(job('Worldwide (EU only)', true), 'europe'), true);
  assert.equal(regionMatches(job('Worldwide (EU only)', true), 'singapore'), false);
  assert.equal(regionMatches(job('Worldwide (US only); Europe team', true), 'europe'), false);
  assert.equal(regionMatches(job('Worldwide, United States', true), 'seoul'), false);
});

test('global exclusion clauses are respected and multiple listed regions remain available', () => {
  assert.equal(regionMatches(job('Worldwide (excluding US)', true), 'north-america'), false);
  assert.equal(regionMatches(job('Worldwide (excluding US)', true), 'singapore'), true);
  assert.equal(regionMatches(job('전 세계 (미국 제외)', true), 'north-america'), false);
  assert.equal(regionMatches(job('전 세계 (미국 제외)', true), 'seoul'), true);
  assert.equal(regionMatches(job('Europe; Singapore', true), 'europe'), true);
  assert.equal(regionMatches(job('Europe; Singapore', true), 'singapore'), true);
  assert.equal(regionMatches(job('Europe; Singapore', true), 'hong-kong'), false);
});
