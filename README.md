# ChordGridGen — Interface A4 pour grilles d'accords

Objectif :
- Générer des grilles d’accords occupant au maximum une page A4.
- En-tête (titre souligné, tempo) ≤ 3 cm.
- Colonne gauche : 6 cm pour noms des parties.
- Grille droite : cases 1.5 cm, possibilité de couper case en deux (diagonale).
- Espacement 3 mm entre parties.
- Duplication et réarrangement (drag & drop) des parties.
- Transposition globale (+ / -) selon la gamme: A ; Bb ; B ; C ; C# ; D ; Eb ; E ; F ; F# ; G ; Ab.
- Export PDF (boutons masqués lors de l'export).
- Save / Load en .json (téléchargement).
- New pour réinitialiser.

Notes importantes :
- Le téléchargement .json s'effectue via le mécanisme standard du navigateur. Le navigateur enregistre habituellement les fichiers dans le dossier de téléchargements par défaut — il n'est pas possible de forcer l'enregistrement directement sur le Bureau depuis une page web pour des raisons de sécurité.
- L'export PDF est proposé via la boîte d'impression du navigateur (window.print()). J'ai inclus des règles @media print pour masquer les contrôles lors de l'impression. Si tu préfères générer un fichier PDF programmé (jsPDF/html2canvas), on peut intégrer cette lib et adapter.