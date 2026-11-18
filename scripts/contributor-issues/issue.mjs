// One contributor issue. Bodies are written as line arrays so the surrounding
// module can stay readable and Markdown inline code needs no escaping.
//
//   issue(title, labels, '## Summary', '', '...')
export const issue = (title, labels, ...body) => ({
  title,
  labels,
  body: body.join('\n'),
});
