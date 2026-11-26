import { buildAiActionMessages, cutPoint } from '../aiActions.js';

const MAX_BATCH_CHARS = 16_000;
const MAX_SEGMENT_CHARS = 2000;
const TEXT_BREAKS = /(\r\n|[\r\n]|https?:\/\/[^\s<>"']+)/gi;
const IMMUTABLE_HTML = 'script,style,textarea,xmp,iframe,noembed,noframes,plaintext,noscript,svg,math,[hidden],[translate="no"]';

function stripSourceEcho(reply, source) {
  const normalize = text => text.trim().normalize('NFC').replace(/\s+/g, ' ');
  const original = normalize(source);
  if (normalize(reply) === original) return reply;
  for (const separator of reply.matchAll(/[ \t]+→[ \t]+/g)) {
    if (normalize(reply.slice(0, separator.index)) === original) {
      return reply.slice(separator.index + separator[0].length).trim();
    }
  }
  return reply;
}

function readTranslations(reply, sources) {
  const json = reply.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1');
  const items = JSON.parse(json);
  if (!Array.isArray(items) || items.length !== sources.length) throw new Error('Incomplete body translation');
  return items.map((item, index) => {
    const text = typeof item === 'string' ? stripSourceEcho(item.trim(), sources[index]) : '';
    if (!text || /[\r\n]|https?:\/\//i.test(text)) throw new Error('Invalid body translation');
    return text;
  });
}

export async function translateBodyText({ html, text }, target, chat) {
  const segments = [];
  const separateText = value => value.split(TEXT_BREAKS).flatMap((part, index) => {
    if (index % 2 || !/\p{L}/u.test(part)) return part;
    const pieces = [];
    while (part.length > MAX_SEGMENT_CHARS) {
      let end = cutPoint(part, MAX_SEGMENT_CHARS);
      if (/[\uD800-\uDBFF]/.test(part[end - 1])) end--;
      pieces.push(part.slice(0, end));
      part = part.slice(end);
    }
    pieces.push(part);
    return pieces.map(piece => {
      if (!/\p{L}/u.test(piece)) return piece;
      const source = piece.trim();
      const start = piece.indexOf(source);
      const item = { source, leading: piece.slice(0, start), trailing: piece.slice(start + source.length) };
      segments.push(item);
      return item;
    });
  });
  const render = parts => parts.map(part => typeof part === 'string'
    ? part : part.leading + part.translation + part.trailing).join('');

  let template;
  let plainParts;
  const nodes = [];
  if (html) {
    // Parse inertly and keep all attributes and markup on the client.
    template = document.createElement('template');
    template.innerHTML = html;
    const walker = document.createTreeWalker(template.content, document.defaultView.NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.parentElement?.closest(IMMUTABLE_HTML)) nodes.push([node, separateText(node.data)]);
    }
  } else {
    plainParts = separateText(text);
  }
  if (!segments.length) throw new Error('Nothing to translate');

  const prompt = [
    `Translate this email into ${target}. The email is an ordered JSON array of text segments.`,
    'Return only a JSON array of strings with exactly one target-language string per input, in the same order.',
    'Use neighboring segments as context. Keep wording already in the target language, names, and numbers.',
    'Replace the source text. Never repeat it beside or above the translation. Do not add markup, URLs, or line breaks.',
  ].join(' ');
  for (let start = 0; start < segments.length;) {
    const sources = [];
    let size = 2;
    for (let i = start; i < segments.length; i++) {
      const source = segments[i].source;
      size += JSON.stringify(source).length + 1;
      if (size > MAX_BATCH_CHARS) break;
      sources.push(source);
    }
    const { messages } = buildAiActionMessages(prompt, JSON.stringify(sources));
    const translated = readTranslations(await chat(messages), sources);
    translated.forEach((translation, index) => { segments[start + index].translation = translation; });
    start += sources.length;
  }

  if (!template) return render(plainParts);
  for (const [node, parts] of nodes) node.data = render(parts);
  return template.innerHTML;
}
