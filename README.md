# odg-capecl2A

Projet d'ordre de grandeur / problème ouvert de 2e année.

## Structure

Le site est un site statique avec une page d'entrée à la racine :

- `index.html` : page d'accueil / liste des articles
- `pages/` : pages secondaires du site (`article.html`, `article-2.html`, `diagram.html`)
- `styles/` : feuilles de style globales et spécifiques
- `scripts/` : scripts front
- `assets/` : images et illustrations

## Lancer localement

```bash
python3 -m http.server 8123
```

Puis ouvrir [http://127.0.0.1:8123](http://127.0.0.1:8123).
