export const isThought = (b: string) => /^[（(]/.test(b) && /[）)]$/.test(b);
export const stripParen = (b: string) => b.replace(/^[（(]/, '').replace(/[）)]$/, '');
