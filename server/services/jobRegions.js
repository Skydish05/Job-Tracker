export const REGIONS = [
  { id: 'all', label: 'All regions', searchLocation: '' },
  { id: 'seoul', label: 'Seoul', searchLocation: 'Seoul, South Korea' },
  { id: 'north-america', label: 'North America', searchLocation: 'North America (United States, Canada, Mexico)' },
  { id: 'europe', label: 'Europe', searchLocation: 'Europe, including the United Kingdom' },
  { id: 'singapore', label: 'Singapore', searchLocation: 'Singapore' },
  { id: 'hong-kong', label: 'Hong Kong', searchLocation: 'Hong Kong' },
];

function normalize(value) {
  return typeof value === 'string' ? value.normalize('NFKC').normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC')
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim() : '';
}

function aliases(values) {
  const alternatives = [...new Set(values.map(normalize))].map((value) => value.replace(/ /g, '\\s+'));
  return new RegExp(`(?:^|\\s)(?:${alternatives.join('|')})(?=\\s|$)`, 'u');
}

const PATTERNS = {
  seoul: aliases(['Seoul', '서울', '서울시', '서울특별시']),
  'north-america': aliases([
    'North America', 'Northern America', 'US', 'U.S.', 'USA', 'U.S.A.', 'United States', 'United States of America',
    'Canada', 'Mexico', 'México', '북미', '북아메리카', '미국', '캐나다', '멕시코',
    'New York', 'NY', 'NYC', 'San Francisco', 'SF', 'Bay Area', 'Silicon Valley', 'Los Angeles', 'LA', 'Boston',
    'Seattle', 'Austin', 'Chicago', 'Denver', 'San Diego', 'Washington', 'Washington DC', 'Philadelphia',
    'Atlanta', 'Miami', 'Dallas', 'Houston', 'Phoenix', 'Portland', 'Pittsburgh', 'Raleigh', 'Salt Lake City',
    'California', 'New Jersey', 'Massachusetts', 'Texas', 'Florida', 'Colorado', 'Virginia', 'North Carolina',
    'Toronto', 'Vancouver', 'Montreal', 'Montréal', 'Ottawa', 'Calgary', 'Edmonton', 'Quebec', 'Québec',
    'Ontario', 'British Columbia', 'Alberta', 'Mexico City', 'Ciudad de Mexico', 'CDMX', 'Guadalajara', 'Monterrey',
    '뉴욕', '샌프란시스코', '로스앤젤레스', '시애틀', '보스턴', '토론토', '밴쿠버', '몬트리올',
  ]),
  europe: aliases([
    'Europe', 'European Union', 'EU', 'EEA', 'European Economic Area', '유럽', '유럽연합',
    'United Kingdom', 'UK', 'U.K.', 'Great Britain', 'Britain', 'England', 'Scotland', 'Wales', 'Northern Ireland', '영국',
    'Germany', 'Deutschland', '독일', 'France', '프랑스', 'Spain', 'España', '스페인', 'Italy', 'Italia', '이탈리아',
    'Netherlands', 'Holland', '네덜란드', 'Belgium', '벨기에', 'Austria', 'Österreich', '오스트리아',
    'Switzerland', 'Schweiz', '스위스', 'Portugal', '포르투갈', 'Poland', 'Polska', '폴란드',
    'Czech Republic', 'Czechia', '체코', 'Denmark', '덴마크', 'Sweden', '스웨덴', 'Norway', '노르웨이',
    'Finland', '핀란드', 'Ireland', '아일랜드', 'Iceland', '아이슬란드', 'Luxembourg', '룩셈부르크',
    'Greece', '그리스', 'Romania', '루마니아', 'Hungary', '헝가리', 'Bulgaria', '불가리아',
    'Croatia', '크로아티아', 'Slovakia', '슬로바키아', 'Slovenia', '슬로베니아',
    'Estonia', '에스토니아', 'Latvia', '라트비아', 'Lithuania', '리투아니아', 'Malta', '몰타', 'Cyprus', '키프로스',
    'Serbia', '세르비아', 'Ukraine', '우크라이나', 'Albania', '알바니아', 'Bosnia', 'Herzegovina', '보스니아',
    'North Macedonia', '북마케도니아', 'Moldova', '몰도바', 'Montenegro', '몬테네그로', 'Kosovo', '코소보',
    'Belarus', '벨라루스', 'Liechtenstein', '리히텐슈타인', 'Monaco', '모나코', 'Andorra', '안도라', 'San Marino',
    'London', 'Manchester', 'Edinburgh', 'Bristol', 'Belfast', 'Cambridge', 'Oxford', 'Dublin', 'Cork', '런던',
    'Paris', 'Lyon', 'Marseille', 'Toulouse', '파리', 'Madrid', 'Barcelona', 'Valencia', '마드리드', '바르셀로나',
    'Lisbon', 'Lisboa', 'Porto', 'Amsterdam', 'Rotterdam', 'Utrecht', 'Eindhoven', 'The Hague', '암스테르담',
    'Brussels', 'Bruxelles', 'Antwerp', 'Ghent', 'Vienna', 'Wien', 'Graz', '비엔나',
    'Zurich', 'Zürich', 'Geneva', 'Genève', 'Basel', 'Bern', 'Lausanne', '취리히',
    'Rome', 'Roma', 'Milan', 'Milano', 'Turin', 'Torino', 'Bologna', '로마', '밀라노',
    'Copenhagen', 'Stockholm', 'Oslo', 'Helsinki', 'Tallinn', 'Riga', 'Vilnius', 'Warsaw', 'Warszawa',
    'Krakow', 'Kraków', 'Wroclaw', 'Wrocław', 'Prague', 'Praha', 'Budapest', 'Bucharest', 'Athens', 'Zagreb',
    // Arbeitnow often supplies a German city without a country name.
    'Berlin', 'Hamburg', 'Munich', 'München', 'Muenchen', 'Cologne', 'Köln', 'Koeln', 'Frankfurt',
    'Düsseldorf', 'Duesseldorf', 'Stuttgart', 'Leipzig', 'Dortmund', 'Essen', 'Bremen', 'Dresden',
    'Hanover', 'Hannover', 'Nuremberg', 'Nürnberg', 'Nuernberg', 'Duisburg', 'Bochum', 'Wuppertal',
    'Bielefeld', 'Bonn', 'Münster', 'Muenster', 'Mannheim', 'Karlsruhe', 'Augsburg', 'Wiesbaden',
    'Mönchengladbach', 'Moenchengladbach', 'Gelsenkirchen', 'Aachen', 'Braunschweig', 'Kiel',
    'Chemnitz', 'Halle', 'Magdeburg', 'Freiburg', 'Krefeld', 'Mainz', 'Lübeck', 'Luebeck',
    'Erfurt', 'Oberhausen', 'Rostock', 'Kassel', 'Hagen', 'Potsdam', 'Saarbrücken', 'Saarbruecken',
    'Hamm', 'Ludwigshafen', 'Oldenburg', 'Osnabrück', 'Osnabrueck', 'Leverkusen', 'Heidelberg',
    'Darmstadt', 'Solingen', 'Regensburg', 'Paderborn', 'Ingolstadt', 'Würzburg', 'Wuerzburg',
    'Fürth', 'Fuerth', 'Offenbach', 'Ulm', 'Heilbronn', 'Pforzheim', 'Wolfsburg', 'Göttingen', 'Goettingen',
    'Reutlingen', 'Koblenz', 'Trier', 'Erlangen', 'Jena', 'Siegen', 'Hildesheim', 'Gütersloh', 'Guetersloh',
    'Konstanz', 'Bamberg', 'Bayreuth', 'Passau', 'Rosenheim', 'Bad Griesbach', 'Walldorf', 'Eschborn',
    '베를린', '함부르크', '뮌헨', '프랑크푸르트', '쾰른', '뒤셀도르프',
  ]),
  singapore: aliases(['Singapore', 'SG', '싱가포르', '新加坡']),
  'hong-kong': aliases(['Hong Kong', 'Hongkong', 'HK', 'HKG', '홍콩', '香港']),
};

const SOUTH_KOREA = aliases(['South Korea', 'Republic of Korea', '대한민국', '한국', '남한']);
const GLOBAL = aliases(['Worldwide', 'World wide', 'Anywhere', 'Global', 'Globally', 'Around the world', '전세계', '전 세계', '어디서나']);
const REMOTE = aliases(['Remote', 'Remotely', '원격', '재택', '재택근무']);
const EMEA = aliases(['EMEA']);
const LIMITATION = /\b(?:only|must (?:be )?(?:based|located|reside)|(?:restricted|limited) to|(?:candidates?|applicants?|residents?) (?:in|from|of)|anywhere (?:in|within))\b|거주자|한정|제한/iu;
const EXCLUSION = /\b(?:except|excluding|not (?:in|for)|outside(?: of)?)\b|제외/iu;

function matchesLocation(location, region, remote) {
  if (PATTERNS[region]?.test(location)) return true;
  if (region === 'seoul' && remote && SOUTH_KOREA.test(location)) return true;
  return region === 'europe' && remote && EMEA.test(location);
}

export function regionMatches(job, region = 'all') {
  if (region === 'all') return true;
  if (!PATTERNS[region]) return false;
  const rawLocation = typeof job?.location === 'string' ? job.location : '';
  const location = normalize(rawLocation);
  if (!location) return false;
  const remote = job?.remote === true || REMOTE.test(location);

  // A restriction takes precedence over a worldwide label elsewhere in the field.
  // Keep comma-separated country lists together, but distinguish parenthetical clauses.
  const clauses = rawLocation.split(/[;|()\n]/).map(normalize).filter(Boolean);
  const restricted = clauses.filter((clause) => LIMITATION.test(clause));
  const relevant = restricted.length ? restricted : clauses;
  const excluded = relevant.filter((clause) => EXCLUSION.test(clause));
  for (const clause of excluded) {
    const marker = clause.match(EXCLUSION);
    const exclusionText = marker[0] === '제외' ? clause.slice(0, marker.index) : clause.slice(marker.index + marker[0].length);
    if (matchesLocation(exclusionText, region, remote)) return false;
  }
  const positive = relevant.map((clause) => clause.includes('제외') ? '' : clause.split(EXCLUSION)[0]).join(' ');
  if (matchesLocation(positive, region, remote)) return true;
  if (restricted.length || !remote || !GLOBAL.test(location)) return false;

  // "Worldwide, US" is ambiguous. Prefer the stated geography to claiming global eligibility.
  const namedRegion = Object.keys(PATTERNS).some((id) => matchesLocation(positive, id, remote));
  return !namedRegion;
}

export function regionSearchLocation(region) {
  return REGIONS.find((entry) => entry.id === region)?.searchLocation || '';
}
