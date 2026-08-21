#!/bin/sh
# ============================================================
# Retire la mention "Co-Authored-By: Claude" de TOUS les commits.
#
# À lancer depuis Git Bash, à la racine du dépôt :
#     sh nettoyer-historique.sh
#
# Chaque commit change d'identifiant : il faudra un "push --force".
# Une branche de sauvegarde est créée avant toute modification.
# Ce fichier n'est pas suivi par git — supprimez-le quand c'est fait.
# ============================================================
set -e

cd "$(dirname "$0")"

if [ ! -d .git ]; then
  echo "Erreur : ce script doit être lancé à la racine du dépôt rx_app."
  exit 1
fi

# Un travail non validé serait perdu par la réécriture. Les fichiers non
# suivis (dont ce script) ne sont pas concernés : on les ignore.
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "Erreur : des modifications ne sont pas validées."
  echo "Faites 'git commit' ou 'git stash' d'abord."
  git status --short --untracked-files=no
  exit 1
fi

avant=$(git log --format='%H' | wc -l | tr -d ' ')
echo "Dépôt propre. $avant commits à traiter."

# Filet de sécurité : on pourra toujours revenir ici.
git branch -f sauvegarde-avant-reecriture
echo "Sauvegarde créée : branche 'sauvegarde-avant-reecriture'"
echo

FILTER_BRANCH_SQUELCH_WARNING=1 \
  git filter-branch -f --msg-filter 'sed "/^Co-Authored-By: Claude/d"' -- --all

echo
echo "--- Vérification ---"
restant=$(git log --all --format='%H' --grep='Co-Authored-By: Claude' | wc -l | tr -d ' ')
apres=$(git log --format='%H' | wc -l | tr -d ' ')

if [ "$restant" != "0" ]; then
  echo "ÉCHEC : $restant commit(s) portent encore la mention."
  echo "Rien n'a été poussé. Restaurez avec :"
  echo "    git reset --hard sauvegarde-avant-reecriture"
  exit 1
fi

if [ "$apres" != "$avant" ]; then
  echo "ATTENTION : $avant commits avant, $apres après — la réécriture a perdu des commits."
  echo "Restaurez avec : git reset --hard sauvegarde-avant-reecriture"
  exit 1
fi

echo "OK : plus aucune mention de co-auteur, et les $apres commits sont tous là."
echo
git log --format='%h %an — %s' -5
echo
echo "============================================================"
echo "Dernière étape, à lancer vous-même une fois le résultat vérifié :"
echo
echo "    git push --force origin main"
echo
echo "Puis, quand GitHub est à jour :"
echo "    git branch -D sauvegarde-avant-reecriture"
echo "    rm nettoyer-historique.sh"
echo "============================================================"
