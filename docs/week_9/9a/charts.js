/* Aggregated timing judgments. Text counts convey everything the dot plot shows. */
(() => {
  'use strict';
  const ns = 'http://www.w3.org/2000/svg';
  function element(tag, text) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function svgElement(tag, attributes) {
    const node = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  }
  function render(target, submissions, clips) {
    target.replaceChildren();
    clips.forEach((clip, index) => {
      const marks = submissions.map(s => s.marks[index]).filter(t => Number.isFinite(t));
      const offsets = marks.map(t => window.TRPCore.offset(t, clip));
      const section = element('section');
      section.className = 'trp-distribution';
      section.append(element('h4', clips.length > 1 ? `${index + 1}. ${clip.title}` : clip.title));
      section.append(element('p', `${submissions.length} participants, ${marks.length} choices, ${submissions.length - marks.length} without a choice.`));
      section.append(element('p', 'Click offset (seconds): negative = before the annotated turn end; positive = after. Each translucent dot is one choice; darker areas contain more choices.'));
      const minimum = -Math.ceil(clip.turnEnd);
      const maximum = Math.max(0.5, Math.ceil(clip.duration - clip.turnEnd));
      const x = t => 40 + (t - minimum) / (maximum - minimum) * 520;
      const svg = svgElement('svg', { viewBox: '0 0 600 64', 'aria-hidden': 'true', class: 'trp-dot-plot' });
      svg.append(svgElement('line', { x1: 40, x2: 560, y1: 42, y2: 42, stroke: '#555' }));
      svg.append(svgElement('line', { x1: x(0), x2: x(0), y1: 12, y2: 62, stroke: '#555', 'stroke-dasharray': '4 3' }));
      for (const t of offsets) svg.append(svgElement('circle', { cx: x(t), cy: 42, r: 7, fill: '#9b0028', 'fill-opacity': 0.2 }));
      section.append(svg);
      const axis = element('div'); axis.className = 'trp-axis';
      axis.append(element('span', `${minimum.toFixed(1)} s`), element('span', `${maximum.toFixed(1)} s`));
      section.append(axis, element('p', 'The dashed line marks offset 0: the annotated final turn end.'));
      const frequencies = new Map();
      for (const value of offsets) {
        const bin = Math.floor(value / 0.25);
        frequencies.set(bin, (frequencies.get(bin) || 0) + 1);
      }
      const details = element('details');
      details.className = 'glossary-box';
      details.append(element('summary', 'Read distribution counts as text'));
      const table = element('table'); table.className = 'trp-table';
      table.append(element('caption', 'Nonempty 0.25-second offset intervals; lower bound included, upper bound excluded'));
      const head = element('thead'), header = element('tr');
      for (const text of ['Click offset interval (s)', 'Choices']) {
        const th = element('th', text); th.scope = 'col'; header.append(th);
      }
      head.append(header); table.append(head);
      const body = element('tbody');
      for (const [bin, count] of [...frequencies].sort((a, b) => a[0] - b[0])) {
        const row = element('tr'); row.append(element('td', `${(bin * 0.25).toFixed(2)} to ${((bin + 1) * 0.25).toFixed(2)}`), element('td', String(count))); body.append(row);
      }
      const missing = element('tr'); missing.append(element('td', 'No choice'), element('td', String(submissions.length - marks.length))); body.append(missing);
      table.append(body); details.append(table); section.append(details);
      if (clip.internalTRPNote) section.append(element('p', `Discussion: ${clip.internalTRPNote} The possible internal completion is around ${clip.internalTRP.toFixed(2)} seconds into the excerpt, not an answer key.`));
      section.append(element('p', 'Early choices may suggest a possible overlap and late choices a possible gap. Clicks include reaction time; they are not actual speech onsets.'));
      target.append(section);
    });
  }
  window.TRPCharts = { render };
})();
