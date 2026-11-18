/** Message du tour. Le nom par défaut du joueur est « Toi » : on évite « À toi, Toi ». */
export function turnLabel(o: { name: string | undefined; myTurn: boolean; aiThinking: boolean }): string {
  const name = o.name ?? '';
  if (o.aiThinking) return `${name} réfléchit…`;
  if (!o.myTurn) return `Au tour de ${name}`;
  return name.trim().toLowerCase() === 'toi' ? 'À toi !' : `À toi, ${name}`;
}
