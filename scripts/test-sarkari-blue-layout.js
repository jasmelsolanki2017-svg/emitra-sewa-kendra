const assert = require('assert');
const { filterDuplicateSarkariBlueSections, DEFAULT_DUPLICATE_SECTION_TITLES } = require('../utils/sarkari-blue-layout');

const sections = [
  { title: 'Important Dates', type: 'list', data: ['Start: 1 Jan'] },
  { title: 'Application Fee', type: 'list', data: ['100'] },
  { title: 'Custom Section', type: 'list', data: ['One'] },
  { title: 'Custom Section', type: 'list', data: ['One'] },
  { title: 'Extra Custom Content', type: 'list', data: ['Text'] },
  { title: 'How to Apply', type: 'list', data: ['Online'] }
];

const filtered = filterDuplicateSarkariBlueSections(sections, { skipTitles: DEFAULT_DUPLICATE_SECTION_TITLES });
assert.strictEqual(filtered.length, 1, 'Duplicate built-in and repeated custom sections should be removed');
assert.strictEqual(filtered[0].title, 'Custom Section');
console.log('Sarkari blue layout duplicate filtering test passed');
