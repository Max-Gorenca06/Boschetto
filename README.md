# 🌲🍽️ Turni Boschetto - App Gestione Turni Ristorante

Un'applicazione web serverless, progressiva e mobile-friendly per la pianificazione, gestione visiva e condivisione in tempo reale dei turni di lavoro del personale. Sviluppata per sostituire i fogli di calcolo manuali, garantisce massima usabilità tramite drag & drop e una robusta tolleranza agli errori (fault tolerance) per sopravvivere in un ambiente caotico come quello della ristorazione.

## 🧠 Scelte Architetturali e Logica

Il sistema non è solo un'interfaccia visiva, ma è progettato con rigide regole di logica aziendale e sicurezza dei dati:

* **Architettura a Doppio Slot (Bozza / Produzione):** Il management lavora su una bozza invisibile (Salvataggio automatico - Slot 1). Il personale vede le modifiche solo dopo che l'Admin ha premuto il tasto "Pubblica Turni" (Slot 2).
* **Logica Offline-First Parziale:** Se la connessione al database fallisce, i turni vengono salvati nel `localStorage` del browser. Al successivo avvio online, il sistema confronta i timestamp e ripristina automaticamente il salvataggio locale se più recente di quello sul server.
* **Personale in Read-Only Offline:** Per evitare conflitti di ID sul database relazionale, l'aggiunta e l'eliminazione dei dipendenti sono bloccate in assenza di rete. Il personale viene caricato da un backup locale nascosto per permettere comunque l'assegnazione ininterrotta dei turni.
* **Protezione Impaginazione:** Il selettore della data calamita matematicamente l'input sempre sul "Lunedì" della settimana selezionata, evitando che errori umani sfasino le colonne della tabella.

## ✨ Funzionalità Principali

* 🖱️ **Drag & Drop Intuitivo:** Trascina i nomi dalla sidebar direttamente nelle celle dei turni (supportato anche su touch screen).
* 📅 **Sincronizzazione Calendario Live (Webcal):** Generazione automatica di file `.ics` in tempo reale tramite server. Il personale può iscriversi al calendario dal telefono e ricevere aggiornamenti automatici su Google/Apple Calendar.
* 🛑 **Controllo Sovraccarico:** Contatore automatico dei turni per singolo dipendente. Se un dipendente supera il suo limite massimo impostato, il contatore segnala l'anomalia colorandosi di rosso.
* ❓ **Gestione "In Dubbio":** Un clic singolo (o tap da mobile) su un nome assegnato aggiunge un "?" per indicare un turno da confermare. Questo flag genera automaticamente un avviso speciale anche all'interno del calendario `.ics` del dipendente.
* 🖨️ **Esportazione PDF e Stampa Pulita:** Foglio di stile CSS dedicato (`@media print`). Nasconde l'interfaccia e formatta la tabella in orizzontale (A4 landscape) con font ottimizzati per la lettura rapida durante il servizio.

## 📱 Architettura UI (I Compartimenti Stagni)

L'interfaccia si adatta dinamicamente all'hardware in uso:
1. **PC (Desktop):** Flusso di scorrimento naturale standard.
2. **Tablet (iPad):** Struttura "a gabbia" (Posizione Fissa). L'overscroll elastico del browser è disabilitato per evitare fastidiosi rimbalzi durante il trascinamento.
3. **Mobile (Smartphone):** La griglia complessa scompare, lasciando spazio a un'interfaccia a schede verticali (Cards) ottimizzata per la lettura a colpo d'occhio da parte dello staff.

## 🛠️ Stack Tecnologico

Il progetto è stato sviluppato volutamente senza l'ausilio di framework frontend pesanti (come React o Angular) per garantire la massima velocità, leggerezza e una facile manutenzione.

* **Frontend:** HTML5, CSS3, JavaScript (Vanilla).
* **Backend & Database:** [Supabase](https://supabase.com/) (PostgreSQL) interrogato tramite REST API.
* **Serverless Functions:** Deno / TypeScript (Supabase Edge Functions per il generatore `.ics`).
* **Librerie Esterne:** `html2pdf.js` & `html2canvas.js` (Esportazione locale), `mobile-drag-drop` (Polyfill touch).

## 📂 Struttura dei File

- `index.html`: Struttura della pagina, modali e importazione delle librerie.
- `style_v2.css`: Regole di stile visivo, compartimenti stagni per i device e media queries rigide per la modalità stampa.
- `script.js`: Motore dell'applicazione. Contiene le logiche drag & drop, la matematica delle date, i sensori di rete per l'offline e le chiamate asincrone.
- `manifest.json`: Configurazione PWA per le icone e l'installazione su home screen.

## 🗄️ Struttura del Database

Il database cloud è composto da due tabelle principali:
1. **`staff`**: Contiene l'anagrafica (`id`, `name`, `group`, `maxShifts`).
2. **`turni_salvati`**: Contiene la griglia dei turni in formato JSON.
   * `id = 1`: **Bozza**. (Autosave live).
   * `id = 2`: **Vetrina**. (Pubblicata per la lettura esterna).

## ⚙️ Setup e Installazione

### 1. Frontend (L'App visiva)
Poiché l'applicazione è puramente frontend, non necessita di un server Node.js per girare.
1. Clona la repository o ospita i file tramite GitHub Pages/Vercel.
2. Apri `index.html` in un qualsiasi browser moderno.
3. **Configurazione Database:** Le costanti `SUPABASE_URL` e `SUPABASE_ANON_KEY` sono all'inizio del file `script.js`. Aggiornale se cambi progetto Supabase.

### 2. Backend (Motore Calendario Live)
Per far funzionare l'iscrizione automatica ai calendari, devi pubblicare la funzione Serverless. Assicurati di avere la [Supabase CLI](https://supabase.com/docs/guides/cli) installata e lancia:
```bash
supabase functions deploy calendario_live --no-verify-jwt
