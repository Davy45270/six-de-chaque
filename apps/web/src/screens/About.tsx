export function About({ onBack }: { onBack(): void }) {
    return (
        <main className="screen about">
            <h1>Règles et à propos</h1>
            <h2>Règles</h2>
            <ul>
                <li>108 galets : six couleurs, six glyphes (lune, goutte, feuille, éclair, spirale, cœur), trois exemplaires de chaque. Chaque couleur a aussi son motif.</li>
                <li>À ton tour, pose une ou plusieurs tuiles de ta main sur une même ligne ou colonne, collées au jeu. Une ligne partage une couleur (glyphes tous différents) ou un glyphe (couleurs toutes différentes), six tuiles au plus.</li>
                <li>Chaque ligne formée ou prolongée rapporte sa longueur ; une ligne complétée à six rapporte six points de plus.</li>
                <li>Sans pose possible, échange des tuiles avec la réserve (0 point). Passer n’est permis que si plus rien n’est possible.</li>
                <li>Le premier à vider sa main, réserve vide, gagne six points et termine la partie.</li>
            </ul>
            <h2>Commandes</h2>
            <p>Touche ou clique une tuile puis une case. Au clavier : flèches pour la case, 1 à 6 pour la tuile, Entrée pour poser, Retour arrière pour retirer, Échap pour annuler, V pour valider, E pour échanger, P pour passer, + et − pour le zoom, I pour un indice.</p>
            <h2>À propos</h2>
            <p>Jeu hors ligne, sans compte, sans publicité ni mesure d’audience. Code sous licence MIT ; galets, glyphes et motifs dessinés pour le jeu par David Sevin, sous licence CC BY 4.0.</p>
            <button type="button" onClick={onBack}>Retour</button>
        </main>
    );
}
