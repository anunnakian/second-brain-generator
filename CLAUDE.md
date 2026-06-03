<!-- second-brain-starter:bootstrap-stub -->
# 🧠 Second Brain Starter — notice d'auto-installation (pour Claude)

> **Ce repo n'est pas encore installé.** Ce fichier est une **amorce** : le bootstrap la
> **remplacera** par la vraie constitution (`CLAUDE.md` personnalisé) une fois l'install faite.
>
> **Pour Claude.** Si l'utilisateur te demande de créer / installer son second cerveau (ou pose
> une question au second cerveau alors que cette amorce est encore là), **suis EXACTEMENT les
> étapes ci-dessous**. Tu peux piloter toute la mécanique toi-même : l'installateur tourne en
> mode **non-interactif** (`--non-interactive`) — tu n'as donc PAS besoin que l'utilisateur le
> lance au clavier. Tu récoltes les réponses **en chat**, puis tu appelles **une seule commande**.

## Étape 1 — Obtenir une COPIE détachée du starter

*(Souvent déjà fait si tu lis ce fichier depuis l'intérieur du dossier.)* Si tu pars d'une URL :

```bash
git clone --depth 1 <URL_DU_REPO> <nom-du-cerveau>
rm -rf <nom-du-cerveau>/.git   # copie détachée : pas un clone lié au starter
cd <nom-du-cerveau>
```

Le bootstrap **réinitialisera un dépôt git local** (socle de l'auto-commit) — c'est automatique,
pas une question à poser.

## Étape 2 — Poser les questions EN CHAT (groupées)

Demande, en une fois : **nom du projet/dossier**, **nom de l'utilisateur**, **son contexte**
(ex. « CTO d'une scale-up »), **langue par défaut des notes**.

> ⚠️ **Ne demande PAS la clé Gemini.** Elle ne transite **jamais** par le chat ni par la ligne de
> commande (elle ira directement dans `.env`, cf. étape 4).

## Étape 3 — Lancer LA commande exacte (copier, ne pas paraphraser)

```bash
node bootstrap.mjs --non-interactive --name "<nom>" --owner "<nom user>" --context "<contexte>" --lang "<langue>"
```

- `--non-interactive` est **obligatoire** (sinon le script attend le clavier et bloque ta session).
- **Idempotent** : relançable sans casse.
- Le **script fait TOUT** (git init, génération des fichiers, install du moteur RAG, smoke-test MCP)
  et **juge lui-même** la réussite : une **sortie non-zéro = échec** → relaie l'erreur telle quelle,
  **ne fais pas semblant** que ça a marché.

## Étape 4 — Relayer le résultat + 3 consignes finales

1. **Clé Gemini** : « Colle ta clé dans `.env` (ligne `GOOGLE_GEMINI_API_KEY=`). » L'index se
   construira au 1er démarrage du serveur MCP. *(Clé gratuite : https://aistudio.google.com/apikey ;
   pour un vault confidentiel, active la facturation — cf. SETUP §9.)*
2. **Dépôt distant (optionnel)** : demande — *« Veux-tu un dépôt git **distant** pour que ton
   second cerveau ait un **backup**, voire soit **utilisable depuis plusieurs machines** ? »*
   - **Si non** → ne fais rien. Tout reste versionné en local, rien ne se perd ; le hook
     auto-commit **ne tentera aucun push** (aucune erreur). On pourra en ajouter un plus tard.
   - **Si oui** → demande la **plateforme** (GitHub / GitLab / Azure DevOps…) et le **nom**, puis
     crée/branche le remote (`gh repo create` si dispo, sinon `git remote add` + `git push -u`,
     sinon guide l'utilisateur). GitHub = cas simple ; autres plateformes = best-effort + guidage.
3. **Redémarrage** : « Ferme et rouvre Claude Code dans le dossier `<nom>` » → cela active le
   serveur MCP `vault-rag` (chargé au démarrage), qui indexe le vault.

## Garde-fous (à ne jamais enfreindre)

- **Commande exacte** de l'étape 3 — copie-la, ne l'invente/ne la paraphrase pas.
- **La clé Gemini n'est JAMAIS un argument** ni un message de chat — toujours `.env`.
- **Idempotence** : en cas de doute, relancer la commande est sûr.
- **Ne fais pas semblant** : si le script sort en erreur, dis-le et relaie le message.
