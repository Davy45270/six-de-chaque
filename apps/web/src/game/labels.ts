// Libellés accordés : vainqueurs de la partie, tuiles choisies pour un échange.

/** « Victoire : Ordinateur », sans élision à faire quel que soit le nom choisi. */
export function winnerLabel(names: readonly string[]): string {
  const n = names.map(s => s.trim());
  if (n.length <= 1) return `Victoire : ${n[0] ?? '?'}`;
  return `Victoire partagée : ${n.slice(0, -1).join(', ')} et ${n[n.length - 1] ?? ''}`;
}

/** « aucune tuile choisie », « 1 tuile choisie », « 3 tuiles choisies ». */
export function exchangeLabel(count: number): string {
  if (count === 0) return 'Échange : aucune tuile choisie';
  return `Échange : ${count} tuile${count > 1 ? 's' : ''} choisie${count > 1 ? 's' : ''}`;
}
