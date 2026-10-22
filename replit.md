# Regia su Replit

## Avvio

- Avvia il workflow **Regia** con il pulsante Run.
- Comando: `python3 server.py`.
- Il server ascolta su `0.0.0.0:5000`; apri l'anteprima web di Replit.
- Non occorrono pacchetti aggiuntivi, segreti o servizi esterni.
- `server.py` serve soltanto la pagina dell'app, senza esporre i file del progetto.

## Modalità locale

Il progetto importato mantiene la propria struttura: l'app è in `index.html`,
senza framework o passaggi di compilazione.

Su Replit l'app usa localStorage: i dati restano nel browser e nell'origine
in cui vengono creati. Non sono condivisi con altri dispositivi o persone.
Cancellando i dati del sito nel browser si perdono anche i dati locali.

Il database del team su claude.ai non è incluso nel repository e non viene
collegato. Le funzioni Claude non sono disponibili in questa modalità.
Il pulsante **Carica esempio** permette di esplorare l'app con dati fittizi;
non viene caricato automaticamente.
