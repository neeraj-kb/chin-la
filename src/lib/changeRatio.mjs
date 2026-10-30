export function changeRatio(previous, current) {
  if (!previous || previous.length !== current.length) return 1;
  let changed = 0;
  for (let i = 0; i < current.length; i += 1) {
    if (Math.abs(current[i] - previous[i]) >= 2) changed += 1;
  }
  return changed / current.length;
}
