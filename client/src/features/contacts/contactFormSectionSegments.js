/** Split flat order into full-width breaks vs pair blocks (odd/even → left/right columns). */

export function splitOrderSegments(order, fullWidth) {
  const segments = [];
  let buf = [];
  const flush = () => {
    if (buf.length) segments.push({ type: 'pair', ids: [...buf] });
    buf = [];
  };
  for (const id of order) {
    if (fullWidth[id]) {
      flush();
      segments.push({ type: 'full', id });
    } else {
      buf.push(id);
    }
  }
  flush();
  return segments;
}

/** Even indices → left column, odd → right (reading order for pair block). */
export function pairBlockToColumns(ids) {
  const left = [];
  const right = [];
  ids.forEach((id, i) => {
    if (i % 2 === 0) left.push(id);
    else right.push(id);
  });
  return { left, right };
}
