export function About({ onBack }: { onBack(): void }) {
    return (
        <main className="screen about">
            <h1>Règles et à propos</h1>
            <h2>Règles</h2>
            <ul>
                <li>108 galets : six couleurs, six glyphes (lune, goutte, feuille, éclair, spirale, cœur), trois exemplaires de chaque. Chaque couleur a aussi son motif.</li>
                <li>À ton tour, pose une ou plusieurs tuiles de ta main sur une même ligne ou colonne, collées au jeu. Une ligne partage une couleur (glyphes tous différents) ou un glyphe (couleurs toutes différentes), six tuiles au plus.</li>
                <li>Chaque ligne formée ou prolongée rapporte sa longueur ; une ligne complétée à six rapporte six points de plus.</li>
                <li>Après la première pose, tu peux échanger des tuiles si la réserve en contient assez. Un échange rapporte 0 point.
                    Sans pose possible, tu peux passer si la réserve est vide ou si la position est morte, c’est-à-dire si aucune tuile hors du plateau ne peut être posée. En position morte, tu peux aussi échanger si la réserve le permet.</li>
                <li>Le premier à vider sa main, réserve vide, gagne six points et termine la partie.</li>
            </ul>
            <h2>Modes de jeu</h2>
            <p>Joue à plusieurs sur le même appareil ou affronte l’ordinateur en niveau débutant, intermédiaire, avancé ou expert.</p>
            <p>Dans les défis, pars d’un plateau et d’une main imposés. Atteins le score indiqué dans la limite de tours. Tu peux revoir une solution après chaque essai.</p>
            <h2>Commandes</h2>
            <p>Touche ou clique une tuile puis une case. Au clavier : flèches pour la case, 1 à 6 pour la tuile, Entrée pour poser, Retour arrière pour retirer, Échap pour annuler, V pour valider, E pour échanger, P pour passer, + et − pour le zoom, I pour un indice.</p>
            <p>Le mode daltonien ajoute l’initiale de la couleur sur chaque galet, en plus du motif. Tu peux le combiner au contraste élevé depuis l’accueil.</p>
            <h2>À propos</h2>
            <p>Jeu hors ligne, sans compte, sans publicité ni mesure d’audience. Code sous licence MIT ; galets, glyphes et motifs dessinés pour le jeu par David Sevin, sous licence CC BY 4.0.</p>
            <button type="button" onClick={onBack}>Retour</button>
        </main>
    );
}
