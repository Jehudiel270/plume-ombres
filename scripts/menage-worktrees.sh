#!/usr/bin/env bash
# Ménage des worktrees de Plume.
# Protocole : 1) ne toucher qu'aux branches DÉJÀ fusionnées dans main ;
#             2) retirer la jonction node_modules par son API NTFS (jamais rm -rf :
#                rm suivrait le lien et effacerait le node_modules partagé) ;
#             3) git worktree remove, puis vérifier la cible partagée.
set -u
cd /c/Users/dosso/dev/dark-romance-w6d || exit 1
CIBLE=/c/Users/dosso/dev/dark-romance-translator/node_modules

echo "=== état initial ==="
git worktree list | wc -l

# Liste : chemin natif <TAB> branche
git worktree list --porcelain | awk '
  /^worktree /{p=substr($0,10)}
  /^branch /{b=substr($0,8); sub("refs/heads/","",b); print p"\t"b}
' > "$LOCALAPPDATA/Temp/wt-list.tsv"

SUPPRIMES=0; GARDES=0; ECHECS=0
while IFS=$'\t' read -r path branch; do
  [ "$path" = "C:/Users/dosso/dev/dark-romance-w6d" ] && continue
  [ -z "${branch:-}" ] && { echo "SKIP (pas de branche) : $path"; GARDES=$((GARDES+1)); continue; }

  if git merge-base --is-ancestor "$branch" main 2>/dev/null; then
    # 1. jonction node_modules
    if [ -e "$path/node_modules" ] || [ -L "$path/node_modules" ]; then
      powershell -NoProfile -Command "(Get-Item '$(cygpath -w "$path" 2>/dev/null || echo "$path")\\node_modules' -Force).Delete()" >/dev/null 2>&1
    fi
    # 2. suppression du worktree
    if git worktree remove "$path" --force >/dev/null 2>&1; then
      echo "SUPPRIME  $branch"
      SUPPRIMES=$((SUPPRIMES+1))
      # 3. branche fusionnée : on la garde (trace), seuls les répertoires partent
    else
      echo "ECHEC     $branch  ($path)"
      ECHECS=$((ECHECS+1))
    fi
  else
    echo "GARDE     $branch  (non fusionnee)  ($path)"
    GARDES=$((GARDES+1))
  fi
done < "$LOCALAPPDATA/Temp/wt-list.tsv"

git worktree prune
echo "=== bilan ==="
echo "supprimes=$SUPPRIMES gardes=$GARDES echecs=$ECHECS"
echo "worktrees restants : $(git worktree list | wc -l)"
if [ -e "$CIBLE/next/package.json" ]; then echo "NODE_MODULES_PARTAGE: INTACT"; else echo "NODE_MODULES_PARTAGE: CASSE"; fi
