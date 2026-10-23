# Regia su Replit

## Avvio e verifica

- Il pulsante Run avvia il workflow **Regia**: `npm run dev`.
- Il server Express ascolta su `0.0.0.0:5000`, con Vite in modalità middleware.
- `npm run build` compila l’interfaccia di accesso; `npm start` serve la versione compilata.
- `npm test` verifica autorizzazioni, inviti, revoche e separazione dei dati locali.
- `npx tsc --noEmit` controlla i tipi.
- `python3 server.py` è solo un avvio compatibile dello stesso server autenticato:
  non deve tornare a servire l’HTML senza controlli.

## Autenticazione e inviti

L’autenticazione usa Clerk gestito da Replit. Le chiavi sono configurate
dall’ambiente; mai inserirle nei file o mostrarle nei log.

- `/` è una presentazione pubblica con il collegamento all’accesso.
- `/sign-in` gestisce login e recupero password tramite Clerk.
- `/sign-up` completa gli inviti, senza offrire registrazione pubblica nell’app.
- `/user-portal` carica Regia solo dopo la verifica server.
- `/team` permette agli amministratori di invitare persone e revocare accessi.
- `/workspace` serve il file originale solo dopo la verifica di sessione,
  email principale verificata e autorizzazione al team.

Il controllo di accesso effettivo avviene sul server, non nel pulsante di
registrazione: un account Clerk senza autorizzazione Regia non può entrare.
La fonte delle autorizzazioni sono i metadati pubblici Clerk, modificabili
solo dal backend: `regiaAccess`, `regiaRole`. Gli inviti trasferiscono questi
metadati al nuovo account. Le attività non vengono spostate su Clerk.

Inviti nuovi: email Clerk, scadenza 7 giorni. Per una persona già registrata
con email principale verificata si abilita l’accesso senza inviare un’email;
l’interfaccia lo indica esplicitamente. Revocare accesso non elimina l’identità
Clerk né i dati del browser. Le sessioni aperte ricontrollano i permessi ogni
30 secondi e al ritorno alla finestra.

## Primo amministratore

L’indirizzo iniziale è in `REGIA_ADMIN_EMAIL`, configurazione dell’ambiente,
non nel codice. `npm run seed-admin` invia l’invito iniziale o autorizza un
account già esistente con quell’email principale verificata. La procedura
è idempotente e non ripristina privilegi già revocati a un account inizializzato.

Gli account Development e Production sono separati. Non copiare ID o chiavi.
Per inizializzare Production eseguire lo stesso script nell’ambiente pubblicato,
con `APP_URL` impostato al suo URL pubblico effettivo. Lo script non viene
eseguito automaticamente a ogni avvio. Non pubblicare senza conferma.

## App originale e dati

Il file `index.html` conserva l’app importata; il server lo inserisce in una
cornice autenticata, senza riscriverne le funzioni. Le pagine di accesso e
gestione inviti sono in `auth/`. L’aspetto segue l’identità originale Regia.

**Le attività sono ancora locali:** non esiste un database condiviso del team
e le funzioni Claude dell’Artifact originale non vengono collegate.
Il salvataggio nel browser è separato per account. Al primo accesso solo
l’amministratore iniziale può copiare i dati precedenti al login nello spazio
del suo account, senza sovrascrivere dati esistenti né eliminare gli originali.

L’autenticazione non cifra i dati in localStorage: chi controlla fisicamente
il browser o ne cancella i dati può leggerli o eliminarli. Login e inviti
non sono un backup né una sincronizzazione tra persone o dispositivi.

## Dipendenze

Node 20, React, Vite 6, Express e SDK Clerk. Conservare il proxy Clerk
canonico e la risoluzione delle chiavi per hostname per lo sviluppo e
l’eventuale pubblicazione. Non esporre la radice del progetto con un
server statico né permettere accesso anonimo a `/workspace`.
