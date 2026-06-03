---
name: prepare-1-1
description: "Prépare un 1-1 avec n'importe qui (report, pair, manager). Prend un nom/alias en argument, croise la fiche de la personne, le dernier 1-1 et le delta de signaux récents (via sync-sources, LECTURE SEULE), et produit un briefing de coaching scannable en 2 minutes : Top 3, signaux faibles, axes récurrents, checklist. Version méta, à adapter à tes axes et tes connecteurs."
version: 1.0.0
---

# /prepare-1-1 — Préparer un 1-1 (version méta)

Produit un **briefing de coaching** pour ton prochain 1-1 avec une personne donnée. Pensé pour
être lu en 2 minutes avant d'entrer en réunion. **Version méta** : agnostique de la personne et
de l'organisation — tu l'adaptes à *tes* axes récurrents et à *tes* connecteurs.

## Paramètre

Un **nom ou alias** de personne, passé dans `$ARGUMENTS`. Exemple : `/prepare-1-1 jane`.
Il sert à retrouver `vault/people/<prenom-nom>.md` (kebab-case, sans accents) et le cache
d'actions `vault/backlog/<nom>.md`. Si aucune fiche ne correspond, lister les fiches de
`vault/people/` proches et s'arrêter.

## Contrainte absolue

**LECTURE SEULE.** Ne jamais envoyer de message, mail ou réaction, ne jamais poster nulle part.
Produire uniquement un fichier markdown local dans le vault.

## Procédure

### Étape 0 — Cache backlog (en parallèle du reste)
Lire `vault/backlog/<nom>.md` s'il existe : c'est le cache des actions ouvertes / récurrentes
avec cette personne. Il alimente le Top 3, la checklist et la section « Actions à suivre ». Une
action demandée 2+ fois sans clôture **doit** remonter dans le Top 3.

### Étape 1 — Dernier 1-1 (pièce maîtresse)
Retrouver la note du **dernier 1-1** avec la personne dans `vault/meetings/` (ou via ton
connecteur Calendar si branché : chercher l'événement « 1-1 … <prénom> » récent). C'est le
document central. Noter aussi le **prochain** 1-1 s'il existe (sert à dater le fichier de sortie ;
à défaut, utiliser la date du jour).

### Étape 2 — Delta de signaux depuis le dernier 1-1 (fan-out, LECTURE SEULE)
Déléguer la collecte à des **sous-agents parallèles** (architecture de [`sync-sources`](../sync-sources/SKILL.md)),
pour ne ramener dans le contexte principal que des résumés compacts (~500 tokens chacun). Selon
tes connecteurs branchés :

- **transcript du dernier 1-1** — lu par un sous-agent isolé (ne jamais charger un transcript
  brut dans le contexte principal), qui en extrait : résumé, décisions, actions (qui/quand/statut),
  points ouverts, signaux faibles, 1-2 verbatims courts ;
- **messagerie** (chat/Slack…) — messages de la personne ET tes propres messages la concernant,
  depuis le dernier 1-1 ;
- **mail** — fils de discussion pertinents depuis le dernier 1-1 ;
- **réunions partagées** depuis le dernier 1-1 — enrichissement (3-5 bullets max chacune).

Chaque sous-agent : ne pas inventer, regrouper par thème, citer ses sources (backlinks /
permalinks), rester sous ~500-800 tokens.

### Étape 3 — Synthèse & écriture
Croiser les retours (un sujet vu dans le 1-1 ET dans la messagerie = signal fort) et écrire le
briefing dans `vault/prep-1-1/YYYY-MM-DD-prep-1-1-<nom>.md` (date du **prochain** 1-1 ; créer le
dossier au besoin), selon ce plan :

```markdown
# Prep 1-1 — [Prénom] — [date du prochain 1-1]

> Dernier : [date] | Prochain : [date] | Sources : [liens]

## Top 3
Les 3 sujets prioritaires (impact / urgence), formulés de ton point de vue.
1. **[Titre court]** — [contexte 1 ligne] → Demander : « [question concrète] » → Si rien : [conséquence]
2. …
3. …

## Signaux faibles
Tensions, frustrations, surcharge, sujets esquivés — avec tact, sans langue de bois.
(Omettre la section si rien de notable.)

## Axes récurrents          # 🔧 À TOI de définir : les 3-5 thèmes que tu veux suivre
| Axe | Signal détecté | Question suggérée |
|---|---|---|
| [ton axe 1] | [signal ou « aucun »] | [question par défaut] |

## Checklist
Actions concrètes à faire avant/pendant le 1-1 (inclure celles du backlog encore pertinentes).
- [ ] …

---

<details><summary>Contexte complet</summary>

### Résumé du dernier 1-1
### Décisions prises
### Actions à suivre (depuis le dernier 1-1)   | # | Action | Qui | Quand | Statut |
### Actions ouvertes (backlog)                  (triées par ancienneté)
### Verbatims clés
### Activité messagerie / mail / réunions récentes   (sections optionnelles, avec liens cliquables)
### Qualité des sources

</details>
```

### Étape 4 — Mettre à jour le backlog
Dans `vault/backlog/<nom>.md` : **ajouter** les nouvelles actions extraites, **cocher** celles
dont on a la preuve de réalisation, **mettre à jour** la date `updated:`. Append-only sur les
faits déjà consignés.

## Règles de rédaction
- Français, ton direct et ultra-concis ; listes à puces plutôt que paragraphes.
- Le Top 3 est la pièce maîtresse — y investir le plus de réflexion.
- Ne pas inventer ; signaler une source partielle ou de mauvaise qualité.
- Pas de section vide (sauf « Axes récurrents », toujours présente).
- Jamais d'URL nue : toujours `[texte](url)`. Backlinks `[[people/prenom-nom]]` (jamais de prénom seul).

## Critère de succès
En < 2 minutes de lecture, tu sais quoi aborder, pourquoi, et avec quelle question d'ouverture —
zéro engagement important oublié depuis le dernier 1-1.
