# Create a Notion token — step by step (for your golden source)

To mirror a Notion zone into your second brain (a **[golden source](../CONNECTORS.md#-golden-sources--mirror-a-live-source-into-your-vault--a-search-connector)** —
see the connectors doc),
the brain needs a **Notion integration token**: a secret key that lets it **read** the pages you
explicitly share with it — nothing else.

This guide walks you through it **click by click**. It takes about **3 minutes**. No coding.

> 🔒 **The token is a secret.** It goes **only into your `.env` file** — never paste it into the chat,
> never commit it, never send it to anyone. Your brain reads it straight from `.env`.

---

## What you'll end up with

- An **Internal integration** in your Notion workspace (a read-only robot account).
- Its **secret key** (starts with `ntn_` or `secret_`), pasted into your brain's `.env`.
- That integration **shared on the root page** of the zone you want to mirror.

Miss the last step and the first sync returns **0 pages** — so don't skip it.

---

## Step 1 — Open the integrations page

Go to **<https://www.notion.so/my-integrations>** and sign in with the same account you use for Notion.

![Notion integrations page](img/notion-token-01.png)

---

## Step 2 — Create a new integration

Click **“+ New integration”**.

![New integration button](img/notion-token-02.png)

---

## Step 3 — Make it *Internal* and name it

- **Type:** choose **Internal** (it stays private to your workspace — not published).
- **Associated workspace:** pick the workspace that holds the pages you want to mirror.
- **Name:** something you'll recognize, e.g. `second brain — PA/SC`.

Then click **Save** (or **Submit**).

![Internal integration form](img/notion-token-03.png)

> 💡 **Read-only is enough.** Under capabilities, **“Read content”** is all your brain needs. You can
> leave “Insert” and “Update” content **off** — the golden source only *reads* Notion.

---

## Step 4 — Copy the secret key

On the integration's page, find **“Internal Integration Secret”**, click **Show**, then **Copy**.

The value starts with **`ntn_`** (newer integrations) or **`secret_`** (older ones).

![Internal Integration Secret](img/notion-token-04.png)

> 🔒 Treat it like a password. If it ever leaks, come back here and **regenerate** it.

---

## Step 5 — Share the integration on your root page

The token alone can read **nothing** yet — you must give the integration access to the page(s) you want
mirrored. Open the **root page** of your zone in Notion, then:

1. Click the **•••** menu (top-right of the page).
2. Open **Connections** (sometimes **“+ Add connections”**).
3. Search for your integration's name and **select it** to confirm.

![Share via the ••• Connections menu](img/notion-token-05.png)

Sub-pages **inherit** this access automatically — sharing the root is enough for the whole sub-tree.

> ⚠️ **This is the step everyone forgets.** Without it, your brain's first sync returns **0 pages**
> (the token is valid but sees nothing). If you get 0 pages, come back and do this.

---

## Step 6 — Paste the secret into your brain's `.env`

When you ask your brain to *“set up a golden source from Notion”*, it **opens your `.env` file** on the
right line for you. Paste the secret right after the `=`, then **save** (⌘S on macOS, Ctrl+S on
Windows/Linux):

```dotenv
NOTION_TOKEN_PASC=ntn_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

(The variable name — here `NOTION_TOKEN_PASC` — is whatever your brain chose for this source; use the
exact line it opened.)

![Paste the token into .env](img/notion-token-06.png)

That's it — tell your brain it's done, and it will run the first sync.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| First sync returns **0 pages** | The integration isn't shared on the root page | Redo **Step 5** (••• → Connections), then re-run the sync |
| **401 / unauthorized** error | Wrong or expired secret in `.env` | Re-copy the secret (**Step 4**), paste it again, save |
| Some pages are **missing** | They live in **another Notion space / tree**, merely *linked* from the zone | Expected — only the root page's sub-tree is mirrored (a link is not a local copy) |
| Attached **PDFs / Google Slides** aren't searchable | Only the page's **Notion text** is mirrored; embedded files aren't extracted | Expected limitation — paste the key facts into the Notion page as text if you need them indexed |

---

> Maintainers / screenshots: the images above live in [`docs/img/`](img/) as `notion-token-01..06.png`.
> Replace the placeholders with real captures of the **English** Notion UI; keep the filenames so the
> links don't break.
