import MarkdownIt from 'markdown-it';

const commonmark = new MarkdownIt('commonmark');

function normalize(source) {
  return source.replace(/\r\n?/g, '\n');
}

function excludedSourceRanges(source) {
  const tokens = commonmark.parse(source, {});
  const ranges = [];
  for (const token of tokens) {
    if (token.type === 'fence' || token.type === 'blockquote_open') {
      ranges.push({ start: token.map[0], end: token.map[1] });
    }
  }

  return ranges.sort((a, b) => a.start - b.start || b.end - a.end)
    .reduce((merged, range) => {
      const previous = merged.at(-1);
      if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
      else merged.push({ ...range });
      return merged;
    }, []);
}

function trimOuter(source) {
  let lines = source.split('\n');
  while (lines.length && lines[0].trim() === '') lines.shift();
  while (lines.length && lines.at(-1).trim() === '') lines.pop();
  if (!lines.length) return '';

  let first = lines[0];
  const indent = (first.match(/^[ \t]*/) ?? [''])[0];
  const columns = [...indent].reduce((column, char) => char === '\t' ? column + 4 - column % 4 : column + 1, 0);
  if (columns < 4) lines[0] = first.replace(/^[ \t]+/, '');
  else lines[0] = first;
  if (lines.length > 1 && lines.at(-1).trim() !== '') {
    const last = lines.at(-1);
    const leading = (last.match(/^[ \t]*/) ?? [''])[0];
    const trailingColumns = [...leading].reduce((column, char) => char === '\t' ? column + 4 - column % 4 : column + 1, 0);
    lines[lines.length - 1] = trailingColumns >= 4 ? last : last.replace(/[ \t]+$/, '');
  } else if (lines.length === 1 && columns < 4) {
    lines[0] = lines[0].replace(/[ \t]+$/, '');
  }
  return lines.join('\n');
}

export function prepareSection(value) {
  if (typeof value !== 'string') throw new TypeError('Section must be text.');
  const source = normalize(value);
  const ranges = excludedSourceRanges(source);
  if (!ranges.length) return trimOuter(source);
  const lines = source.split('\n');
  const retained = [];
  let cursor = 0;
  for (const range of ranges) {
    retained.push(lines.slice(cursor, range.start).join('\n'));
    cursor = range.end;
    if (cursor < lines.length && lines[cursor] === '') cursor++;
  }
  retained.push(lines.slice(cursor).join('\n'));
  return trimOuter(retained.join('\n\n'));
}

export function prepareSubmission(title, body = null) {
  if (typeof title !== 'string' || body !== null && typeof body !== 'string') {
    throw new TypeError('Title and body must be text or a null body.');
  }
  return [prepareSection(title), body === null ? '' : prepareSection(body)]
    .filter(Boolean)
    .join('\n\n');
}
