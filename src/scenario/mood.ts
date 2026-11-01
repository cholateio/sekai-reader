// Order matters: the first matching pattern wins (e.g. "shock_" before generic matches).
const MOODS: [RegExp, string][] = [
  [/cry|tear|naki/, '哭'], [/angry|anger|ikari/, '生氣'], [/sad|down|depress|shock_|ochikomi/, '低落'],
  [/surprise|odoroki|bikkuri/, '驚訝'], [/shy|blush|tere/, '害羞'], [/worr|trouble|komaru|anx|uneasy|confus/, '困擾'],
  [/think|ponder|kangae/, '思考'], [/laugh|grin|happy|joy|wara/, '開心'], [/smile|hohoemi/, '微笑'],
  [/serious|majime|shinken/, '認真'], [/doya|smug|proud/, '得意'], [/sleep|tired|nemu/, '睏'], [/cool|calm|reisei/, '冷靜'],
];

export function moodOf(face: string): string | null {
  if (!face) return null;
  const f = face.toLowerCase();
  for (const [re, label] of MOODS) if (re.test(f)) return label;
  return null;
}
