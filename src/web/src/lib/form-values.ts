/** A submitted form's fields as text, without React's own `$ACTION…` fields: to read, and to give back after a refusal. */
export const formValues = (form: FormData): Record<string, string> =>
  Object.fromEntries([...form.entries()].filter(([k]) => !k.startsWith('$')).map(([k, v]) => [k, String(v)]));
