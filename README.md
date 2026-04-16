# 🍽️ App Gestione Turni Ristorante

Un'applicazione web frontend-only (HTML, CSS, Vanilla JavaScript) per la pianificazione e la gestione visiva dei turni del personale di un ristorante. Sviluppata per sostituire i fogli di calcolo manuali, garantisce massima usabilità tramite drag & drop e protezione contro i cali di connessione.

## 🧠 Scelte Architetturali e Logica

Il sistema è progettato attorno alla tolleranza agli errori (fault tolerance) in un ambiente caotico come quello della ristorazione:
* **Logica Offline-First Parziale:** Se la connessione al database fallisce, i turni vengono salvati nel `localStorage` del browser. Al successivo avvio online, il sistema confronta i timestamp e ripristina automaticamente il salvataggio locale se più recente di quello sul server.
* **Personale in Read-Only Offline:** Per evitare conflitti di ID sul database relazionale, l'aggiunta e l'eliminazione dei dipendenti sono bloccate in assenza di rete. Il personale viene caricato da un backup locale nascosto per permettere comunque l'assegnazione dei turni.
* **Protezione Impaginazione:** Il selettore della data calamita matematicamente l'input sempre sul "Lunedì" della settimana selezionata, evitando che errori umani sfasino le colonne della tabella (strutturata fisicamente da Lunedì a Domenica).

## 🚀 Funzionalità Principali

* **Drag & Drop Intuitivo:** Trascina i nomi dalla sidebar direttamente nelle celle dei turni.
* **Controllo Sovraccarico:** Contatore automatico dei turni per singolo dipendente. Se un dipendente supera il suo limite contrattuale, il contatore si colora di rosso.
* **Gestione "In Dubbio":** Un clic singolo su un nome assegnato aggiunge un punto interrogativo ("?") per indicare un turno da confermare.
* **Esportazione PDF e Stampa Pulita:** Foglio di stile CSS dedicato alla stampa. Nasconde l'interfaccia (sidebar, bottoni) e formatta la tabella per l'orientamento orizzontale (A4 landscape) con font ottimizzati per la lettura rapida durante il servizio.
* **Backend BaaS:** Salvataggio dei dati in cloud tramite Supabase.

## 🛠️ Stack Tecnologico

* **Frontend:** HTML5, CSS3, JavaScript (Vanilla, nessun framework).
* **Backend & Database:** Supabase (PostgreSQL) interrogato tramite REST API.
* **Librerie Esterne:** `html2pdf.js` per l'esportazione lato client, `html2canvas.js`.

## 📂 Struttura dei File

- `index.html`: Struttura della pagina e importazione delle librerie.
- `style_v2.css`: Regole di stile visivo e media queries rigide per le modalità `@media print` e `body.print-mode`.
- `script.js`: Motore dell'applicazione. Contiene le logiche drag & drop, la generazione della griglia, la matematica delle date e le chiamate asincrone a Supabase e al LocalStorage.

## ⚙️ Setup e Installazione

Poiché l'applicazione è puramente frontend, non necessita di un server Node.js.
1. Clona la repository o ospita i file tramite GitHub Pages.
2. Apri `index.html` in un qualsiasi browser moderno.
3. **Nota per gli sviluppatori:** Le chiavi pubbliche anonime (`SUPABASE_URL` e `SUPABASE_ANON_KEY`) sono inserite all'inizio del file `script.js`. Se si cambia database, è necessario aggiornare esclusivamente queste due costanti.
