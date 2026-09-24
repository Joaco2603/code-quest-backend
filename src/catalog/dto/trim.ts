export const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
