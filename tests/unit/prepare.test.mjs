import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareSubmission, prepareSection } from '../../src/prepare.mjs';

const regressions = [
  ['plain', 'Title', 'My explanation.', 'Title\n\nMy explanation.'],
  ['backticks', 'Title', 'before\n```go\nsecret()\n```\nafter', 'Title\n\nbefore\n\nafter'],
  ['tilde', '', 'before\n~~~text\nsecret\n~~~\nafter', 'before\n\nafter'],
  ['unclosed fence', 'Title', 'before\n```\nsecret', 'Title\n\nbefore'],
  ['empty fence', '', 'before\n```\n```\nafter', 'before\n\nafter'],
  ['fence in list item', '', '- ```js\n  secret\n  ```\n\nsafe', 'safe'],
  ['quote', '', '> copied\n> text\n\nmy words', 'my words'],
  ['lazy quote', '', '> copied\nlazy continuation\n\nmy words', 'my words'],
  ['nested quote', '', '> > nested\n> continuation\n\nsafe', 'safe'],
  ['blank nested quote', '', '> first\n>\n> > inner\n> tail\n\nsafe', 'safe'],
  ['quoted heading and unquoted text', '', '> # quoted heading\nsafe', 'safe'],
  ['quoted fence', '', '> ```\n> secret\n> ```\n\nsafe', 'safe'],
  ['quote only', '', '> copied', ''],
  ['normalize', ' Title\r', ' first\r\nsecond\rthird ', 'Title\n\nfirst\nsecond\nthird'],
  ['ignore excluded title if body exists', '```', 'body must survive', 'body must survive'],
  ['empty', ' \t', ' \n', ''],
  ['indented then quote', '', '    example()\n\n> removed\n\nsafe', '    example()\n\n\nsafe'],
  ['text around removed span separated', '', 'left\n```\ncode\n```\nright', 'left\n\nright'],
  ['template', '', '## Summary\n\n- [ ] Explain the change', '## Summary\n\n- [ ] Explain the change'],
  ['inline code', '', 'Use `fmt.Println` in prose', 'Use `fmt.Println` in prose'],
  ['indented code', '', '    example()\n\nparagraph', '    example()\n\nparagraph'],
  ['tab-indented code', '', '\tcode()\n\nparagraph', '\tcode()\n\nparagraph'],
  ['blank lines before code', '', '\n \t\n    example()\n\nparagraph\n \t\n', '    example()\n\nparagraph'],
  ['ordinary spaces', '', '   plain text  ', 'plain text'],
  ['HTML', '', '<div>retained</div>', '<div>retained</div>'],
  ['short title', 'Fix', '', 'Fix'],
  ['null body', 'hello', null, 'hello'],
  ['blank lines around excluded quote', '', 'safe\n\n> copied\n\nnext', 'safe\n\n\nnext'],
];

test('prepares literal CommonMark source regressions independently', () => {
  for (const [name, title, body, expected] of regressions) {
    assert.equal(prepareSubmission(title, body), expected, name);
  }
});

test('keeps four-column indentation and tabs while trimming ordinary spaces', () => {
  assert.equal(prepareSection('   \n  text  \n'), 'text');
  assert.equal(prepareSection('\tcode  \n'), '\tcode  ');
  assert.equal(prepareSection('    code  \n'), '    code  ');
  assert.equal(prepareSection('    first\n  second  \n'), '    first\n  second');
});

test('preserves inline markup and HTML without rendering or interpreting it', () => {
  assert.equal(prepareSection('`<script>not executed</script>`'), '`<script>not executed</script>`');
  assert.equal(prepareSection('## {{ template }}\n- [ ] <b>literal</b>'), '## {{ template }}\n- [ ] <b>literal</b>');
});
