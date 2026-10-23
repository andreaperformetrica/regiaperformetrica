# Regia

Gestore di attività per il team di Performetrica. Prende spunto da ClickUp e Asana: elenco, bacheca, timeline e calendario, clienti, carico di lavoro, approvazioni, dipendenze, automazioni e Claude integrato.

L’app operativa originale resta in `index.html` (HTML, CSS e JavaScript).
Su Replit è protetta da un server Express e da pagine di accesso React con
Clerk; solo gli account autorizzati dal team possono caricarla.

## Avvio su Replit

Avvia il workflow **Regia** con Run oppure esegui `npm run dev`.
Per dettagli su login, primo amministratore e inviti consulta `replit.md`.
`npm test` esegue i controlli automatici e `npm run build` prepara la versione
compilata.

Gli inviti proteggono l’accesso all’app, ma le attività restano nel browser,
separate per account: non sono sincronizzate tra membri o dispositivi.

## Dove gira oggi

La versione usata dal team è pubblicata come Artifact su claude.ai:
https://claude.ai/artifact/LN429WBUmvQzQJU9G8vbf5

Lì la pagina usa tre funzioni della piattaforma claude.ai:

| Funzione | A cosa serve |
|---|---|
| `db` | Database condiviso: attività, clienti, persone, notifiche, automazioni, modelli |
| `user` | Riconosce chi apre la pagina e collega l'account al nome nel team |
| `sample` | Le funzioni di Claude (riepiloghi, brief, piano del giorno, stato progetti, ribilanciamento, domande) |

I dati non stanno in questo repository: sono nel database dell'Artifact su claude.ai.

## Aprirla in locale

Per studiare la sola versione importata, puoi ancora aprire `index.html`
direttamente nel browser. Questo non usa il nuovo login e non è il modo
corretto di servire Regia su Replit o su un dominio pubblico.

Solo per consultazione locale offline:

```bash
python3 -m http.server 8765
```

e vai su http://localhost:8765. Fuori da claude.ai la pagina parte in **modalità locale**: i dati restano solo in quel browser (localStorage) e le funzioni di Claude sono nascoste. Il pulsante "Carica esempio" crea un workspace di prova.

## Struttura del codice

Tutto è in `index.html`, diviso in sezioni commentate:

- **Store**: legge e scrive i dati. Con `claude.use("db")` usa il database condiviso; altrimenti usa localStorage.
- **Modello dati**: collezioni `spaces`, `lists`, `clients`, `members`, `tasks`, `notifs`, `rules`, `templates`.
- **Render**: funzioni che generano l'HTML di ogni pagina (home, In arrivo, panoramica, attività, clienti, team).
- **Azioni**: un unico gestore di clic basato sugli attributi `data-act`.
- **Automazioni**: `runRules()` esegue le regole "Quando… allora…".
- **Claude**: le funzioni `ai*` costruiscono i prompt e chiamano `claude.use("sample")`.

## Portarla fuori da claude.ai

Per un dominio proprio (es. app.performetrica.it), login e notifiche via email bisogna sostituire le tre funzioni della piattaforma:

- `db` → un database come Supabase o Firebase (lo Store è già isolato, va riscritto solo quello)
- `user` → il login di Supabase Auth o simile
- `sample` → chiamate all'API di Anthropic da un piccolo backend (la chiave non va mai messa nel browser)

Hosting consigliato: Vercel o Netlify.
