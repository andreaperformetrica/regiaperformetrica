# Regia su Replit

## Vincolo di prodotto

L’utente ha chiesto di rimuovere Clerk e usare un login semplice email e
password gestito da Regia. Non reintrodurre Clerk né un altro provider di
accesso senza una richiesta esplicita. Si mantiene l’accesso solo su invito.

## Avvio

- Run avvia il workflow **Regia** con `npm run dev`.
- Server Express su `0.0.0.0:5000`, Vite in modalità middleware.
- `npm run build` compila le pagine di accesso, `npm start` serve la build.
- `npm test` verifica password, sessioni, inviti, revoche e dati locali.
- `npx tsc --noEmit` controlla i tipi.
- `python3 server.py` avvia lo stesso server autenticato, non un server statico.

## Account e password

Gli account sono nel PostgreSQL del progetto. Le attività non vengono migrate.
La definizione dello schema è `server/schema.sql`, applicata al database di
sviluppo durante l’implementazione. La pubblicazione gestisce lo schema di
produzione tramite il flusso supportato Replit: non aggiungere DDL all’avvio.

Le password sono salvate con scrypt, sale casuale e confronto costante.
Sessioni casuali valide 7 giorni, memorizzate solo come hash nel database,
cookie HttpOnly / SameSite=Lax / Secure su HTTPS. Login e attivazioni hanno
limiti sui tentativi; le richieste che modificano dati verificano l’origine.

`REGIA_ADMIN_EMAIL` configura l’indirizzo del super admin.
`REGIA_ADMIN_PASSWORD` deve essere inserita tramite Secrets, mai nella chat
o nel codice, e deve contenere da 12 a 128 caratteri.
All’avvio la password iniziale viene usata solo se l’account non ha ancora
una password: non sovrascrive cambi password successivi.

`npm run seed-admin` inizializza l’amministratore senza stampare credenziali.
Per recuperare l’accesso del super admin, aggiornare il Secret e usare
esplicitamente `npm run seed-admin -- --reset-password`. Questo invalida le
sessioni dell’amministratore. Non eseguire reset senza richiesta dell’utente.
Il recupero dei membri avviene con un link generato dal super admin.

## Pagine

- `/` e `/sign-in`: form email e password, nessuna registrazione pubblica.
- `/sign-up#token=…`: invito monouso o reimpostazione password.
- `/user-portal`: cornice autenticata dell’app originale.
- `/team`: super admin, inviti e revoca accessi.
- `/password`: cambio password personale, con verifica di quella attuale.
- `/workspace`: HTML originale, protetto da sessione verificata sul server.

I link invito durano 7 giorni e vanno condivisi privatamente. Non viene
inviata alcuna email automaticamente. Rigenerare un link invalida il
precedente. Il database conserva solo l’hash del token. Il token sta nel
frammento URL per non finire nelle richieste HTTP o nei referrer.
La revoca di un membro invalida sessioni e inviti pendenti. Il super admin
non può essere revocato dalla gestione membri.

## Dati preesistenti

La migrazione da Clerk conserva le identità di salvataggio dei vecchi account
autorizzati, ma non ne importa le password. Serve una nuova password Regia.
Gli inviti e le sessioni Clerk non sono usati dal nuovo sistema.
Le vecchie chiavi eventualmente presenti nei Secrets non vengono più lette
dall’app; l’istanza esterna non è stata cancellata né sono stati distrutti account.

`index.html` conserva l’app importata. I dati locali sono separati per account.
L’amministratore iniziale può copiare i dati anteriori al login nel proprio
spazio, senza cancellare gli originali o sovrascrivere dati esistenti.
Non esporre la radice del progetto con un server statico.

**Le attività restano nel browser**, non sono condivise con colleghi o altri
dispositivi. Login e inviti non cifrano localStorage e non sono un backup.

## Test

I test di integrazione usano account sintetici e sessioni reali in uno schema
PostgreSQL temporaneo, poi eliminano solo quello schema di prova.
Non sostituiscono utenti reali e non inviano email. Non eseguirli in produzione.
