// Assign only when visible data changes; repeated textContent writes still
// invalidate layout and wake ResizeObservers even when the text is identical.
export const textIfChanged = (node, value) => {
  const text = String(value);
  if (node.textContent !== text) node.textContent = text;
};
export const hiddenIfChanged = (node, hidden) => {
  if (node.hidden !== hidden) node.hidden = hidden;
};
