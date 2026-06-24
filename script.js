/* global supabase, html2pdf, html2canvas, Capacitor */

document.addEventListener('DOMContentLoaded', () => {
    MobileDragDrop.polyfill({
        dragImageTranslateOverride: MobileDragDrop.scrollBehaviourDragImageTranslateOverride
    });

// --- INIZIO FIX DEFINITIVO APPLE ---
    // 1. Calcola l'altezza reale al millimetro e la passa al CSS
    function setAppHeight() {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
    }
    window.addEventListener('resize', setAppHeight);
    window.addEventListener('orientationchange', setAppHeight);
    setAppHeight();

    // 2. Uccide il rimbalzo elastico di iOS su tutto lo schermo
    document.addEventListener('touchmove', function(e) {
        // Permetti il trascinamento dei nomi (drag)
        if (e.target.closest('.placed')) {
            e.preventDefault();
            return;
        }
        // Permetti lo scorrimento SOLO dentro la barra, i turni o i modali
        const isScrollable = e.target.closest('#mobile-view, #sidebar.mobile-open, .modal-content');
        if (!isScrollable) {
            e.preventDefault(); // Blocca il resto della pagina come una roccia
        }
    }, { passive: false });
    // --- FINE FIX APPLE ---
  
  const SUPABASE_URL = 'https://fwmixkwojjdgljcynycu.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3bWl4a3dvampkZ2xqY3lueWN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE3MjU1MzYsImV4cCI6MjA3NzMwMTUzNn0.Nun5QolQqtGZX61RbC8gFqL6ojA9KmoiZI7T6JtSmss';
  const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  let isLoggedIn = false;
  let isOffline = false;
  window.isHistoricalMode = false;
  window.assenzeGlobali = [];
  window.assenzeSettimana = {}; 

  // --- FUNZIONE CERVELLO: RACCOGLIE TUTTI I DATI DELLA GRIGLIA ---
  function getGridData() {
      const data = {};
      data["_metadata_title"] = elements.tableHeaderTitle.value;
      data["_metadata_start_date"] = elements.startDatePicker.value;
      data["_metadata_assenze"] = window.assenzeSettimana;
      
      document.querySelectorAll('.cell').forEach(cell => {
          const names = Array.from(cell.querySelectorAll('.placed')).map(p => ({ 
              name: p.dataset.name,
              inDubbio: p.classList.contains('in-dubbio')
          }));
          if (names.length) data[cell.dataset.cellId] = names;
      });
      return data;
  }

  async function controllaStatoLogin() {
      const { data: { session } } = await supabaseClient.auth.getSession();
      isLoggedIn = !!session; 
      aggiornaInterfacciaLogin();
  }

  async function effettuaLogin() {
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;
      if (!email || !password) return showToast("Inserisci email e password.");

      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) {
          showToast("Errore di accesso: credenziali errate.");
      } else {
          showToast("Sblocco sistema in corso...");
          setTimeout(() => location.reload(), 1000); 
      }
  }

  async function effettuaLogout() {
      await supabaseClient.auth.signOut();
      showToast("Chiusura sistema in corso...");
      setTimeout(() => location.reload(), 1000); 
  }

  function aggiornaInterfacciaLogin() {
      const loginForm = document.getElementById('login-form');
      const logoutForm = document.getElementById('logout-form');
      if (loginForm && logoutForm) {
          loginForm.style.display = isLoggedIn ? 'none' : 'block';
          logoutForm.style.display = isLoggedIn ? 'block' : 'none';
      }
      
      const staffTitle = document.querySelector('#sidebar h3');
      const sidebarContent = document.getElementById('sidebar-content');

      if (staffTitle) staffTitle.style.display = isLoggedIn ? 'block' : 'none';
      if (sidebarContent) sidebarContent.style.display = isLoggedIn ? 'block' : 'none';
      const btnReset = document.getElementById('resetBtn'); 
      const btnManageStaff = document.getElementById('manageStaffBtn'); 
      const btnPublish = document.getElementById('publishBtn');

      if(btnReset) btnReset.style.display = isLoggedIn ? 'inline-block' : 'none';
      if(btnManageStaff) btnManageStaff.style.display = isLoggedIn ? 'inline-block' : 'none';
      if(btnPublish) btnPublish.style.display = isLoggedIn ? 'inline-block' : 'none';

      if (typeof renderMobileView === 'function') renderMobileView();
  }

  const elements = {
    tableHeaderTitle: document.getElementById('table-header-title'),
    gridBody: document.getElementById("grid"),
    sidebarContent: document.getElementById("sidebar-content"),
    saveStatus: document.getElementById('save-status'),
    staffModal: document.getElementById('staff-modal'),
    staffList: document.getElementById('staff-list-container'),
    staffForm: document.getElementById('staff-form'),
    exportStaffBtn: document.getElementById('export-staff-btn'),
    resetBtn: document.getElementById('resetBtn'),
    printBtn: document.getElementById('printBtn'),
    exportPdfBtn: document.getElementById('export-pdf-btn'),
    manageStaffBtn: document.getElementById('manageStaffBtn'),
    addNewStaffBtn: document.getElementById('add-new-staff-btn'),
    cancelEditBtn: document.getElementById('cancel-edit'),
    startDatePicker: document.getElementById('start-date-picker'),
    closeModalBtn: document.querySelector('#staff-modal .close-button')
  };

  const nomiGiorniBase = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
  let giorni = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
  const turni = ["Camere", "Cucina pranzo", "Sala pranzo", "Cucina cena", "Sala cena"];
  const fasceOrarie = {
      "camere": "mattina",
      "cucina_pranzo": "pranzo",
      "sala_pranzo": "pranzo",
      "cucina_cena": "cena",
      "sala_cena": "cena"
  };
  let staff = [];
  let currentDraggedElement = null;
  let selectedForPlacement = null;

  async function loadStaff() {
    const { data, error } = await supabaseClient.from('staff').select('*').order('name');
    
    if (error) {
        console.error("Errore di rete durante il caricamento staff:", error);
        const localStaffRaw = localStorage.getItem('staff_backup');
        if (localStaffRaw) {
            try {
                staff = JSON.parse(localStaffRaw);
                isOffline = true;
                showToast("Personale caricato offline (Sola lettura) ⚠️");
            } catch (e) {
                staff = [];
            }
        } else {
            alert("Nessuna connessione e nessun backup del personale trovato.");
            staff = [];
        }
    } else {
        staff = data || [];
        localStorage.setItem('staff_backup', JSON.stringify(staff));
        isOffline = false;
    }
  }
 async function caricaAssenzeGlobali() {
        if (!isLoggedIn) return;
        const { data, error } = await supabaseClient
            .from('assenze_globali')
            .select('*')
            .eq('stato', 'APPROVATA');
        
        if (error) {
            console.error("Errore di rete durante il caricamento assenze globali:", error);
            const localAssenzeRaw = localStorage.getItem('assenze_backup');
            if (localAssenzeRaw) {
                try {
                    window.assenzeGlobali = JSON.parse(localAssenzeRaw);
                    showToast("Assenze caricate offline (Sola lettura) ⚠️");
                } catch (e) {
                    window.assenzeGlobali = [];
                }
            } else {
                window.assenzeGlobali = [];
            }
        } else {
            window.assenzeGlobali = data || [];
            // Salva silenziosamente il backup aggiornato nel cassetto del telefono
            localStorage.setItem('assenze_backup', JSON.stringify(window.assenzeGlobali));
        }
    }
    function isDipendenteAssente(nome, cellId) {
        const parti = cellId.split('-'); 
        const nomeGiornoGriglia = parti[0]; // es. "venerdì"
        const turnoGriglia = parti[1]; // es. "cucina_pranzo"
        
        const dataInizioGriglia = new Date(elements.startDatePicker.value);
        if(isNaN(dataInizioGriglia.getTime())) return false;
        
        const offsetGiorno = giorni.map(g => g.toLowerCase()).indexOf(nomeGiornoGriglia);
        if(offsetGiorno === -1) return false;
        
        let dataCella = new Date(dataInizioGriglia);
        dataCella.setDate(dataCella.getDate() + offsetGiorno);
        dataCella.setHours(0,0,0,0);

        for (const assenza of window.assenzeGlobali) {
            if (assenza.nome_dipendente.toLowerCase() === nome.toLowerCase()) {
                let inizioAssenza = new Date(assenza.data_inizio);
                inizioAssenza.setHours(0,0,0,0);
                let fineAssenza = new Date(assenza.data_fine);
                fineAssenza.setHours(0,0,0,0);

                if (dataCella >= inizioAssenza && dataCella <= fineAssenza) {
                    if (assenza.turno_specifico === 'TUTTI') return true;
                    
                    const fascia = fasceOrarie[turnoGriglia]; 
                    if (assenza.turno_specifico.toLowerCase() === fascia.toLowerCase() || 
                        assenza.turno_specifico.toLowerCase() === turnoGriglia.toLowerCase()) {
                        return true;
                    }
                }
            }
        }
        return false;
    }
  async function loadState() {
    const databaseId = isLoggedIn ? 1 : 2;

    const { data } = await supabaseClient.from('turni_salvati').select('dati_griglia, updated_at').eq('id', databaseId).single();
    
    const localBackupRaw = localStorage.getItem('turni_backup');
    let localBackup = null;
    if (localBackupRaw) {
        try { localBackup = JSON.parse(localBackupRaw); } catch (e) { console.error("Errore lettura backup locale"); }
    }

    let datiDaCaricare = null;
    let orarioDisplay = "";

    const timeSupabase = data && data.updated_at ? new Date(data.updated_at).getTime() : 0;
    const timeLocale = localBackup && localBackup.timestamp ? localBackup.timestamp : 0;

    if (timeLocale > timeSupabase) {
        datiDaCaricare = localBackup.dati_griglia;
        const d = new Date(timeLocale);
        orarioDisplay = `Recuperato backup locale: ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')} ⚠️`;
        elements.saveStatus.style.color = "#e65100";
        if(isLoggedIn) {
            supabaseClient.from('turni_salvati').update({ dati_griglia: datiDaCaricare, updated_at: new Date(timeLocale) }).eq('id', 1).then();
        }
    } else if (data && data.dati_griglia) {
        datiDaCaricare = data.dati_griglia;
        const d = new Date(timeSupabase);
        orarioDisplay = `Caricato dal server: ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
        elements.saveStatus.style.color = "#666";
    }

    if (datiDaCaricare) {
      if (datiDaCaricare["_metadata_title"]) {
        elements.tableHeaderTitle.value = datiDaCaricare["_metadata_title"];
      }
    if (datiDaCaricare["_metadata_start_date"]) {
        elements.startDatePicker.value = datiDaCaricare["_metadata_start_date"];
        const startObj = new Date(datiDaCaricare["_metadata_start_date"]);
        
        if (!isNaN(startObj.getTime())) {
            // Svuota e ricalcola i veri nomi dei giorni prima di stamparli
            giorni = [];
            for(let i = 0; i < 7; i++) {
                let d = new Date(startObj);
                d.setDate(d.getDate() + i);
                giorni.push(nomiGiorniBase[d.getDay()]);
            }
            
            aggiornaDateInGriglia(startObj, false); 
        }
      }
      
      window.assenzeSettimana = datiDaCaricare["_metadata_assenze"] || {};

      Object.entries(datiDaCaricare).forEach(([id, people]) => {
        const cellDiv = document.querySelector(`.cell[data-cell-id="${id}"]`);
        if (cellDiv && !id.startsWith("_metadata")) {
          cellDiv.innerHTML = '';
          people.forEach(p => cellDiv.appendChild(createPlacedElement(p)));
          updateCellCounter(cellDiv);
        }
      });
      elements.saveStatus.textContent = orarioDisplay;
    }
    updateAllSidebarCounts();
    
    if (typeof updateMobileHeader === 'function') updateMobileHeader();
  }

  async function saveState() {
    if (!isLoggedIn || window.isHistoricalMode) return; 

    elements.saveStatus.textContent = 'Salvataggio...';
    elements.saveStatus.style.color = "#666";
    
    const data = getGridData();
    
    const backupData = {
        timestamp: new Date().getTime(),
        dati_griglia: data
    };
    localStorage.setItem('turni_backup', JSON.stringify(backupData));

    const { error } = await supabaseClient.from('turni_salvati').update({ dati_griglia: data, updated_at: new Date() }).eq('id', 1);
    
    if (error) {
        elements.saveStatus.textContent = "Salvato in locale (Offline) ⚠️";
        elements.saveStatus.style.color = "#e65100";
    } else {
        elements.saveStatus.textContent = `Salvato: ${new Date().toLocaleTimeString()}`;
        elements.saveStatus.style.color = "#666";
    }
  }

  function generateGrid() {
    elements.gridBody.innerHTML = "";
    turni.forEach(turno => {
      const tr = document.createElement("tr");
      const tdLabel = document.createElement("td");
      tdLabel.textContent = turno;
      tdLabel.style.fontWeight = "bold";
      tr.appendChild(tdLabel);

      giorni.forEach(giorno => {
        const td = document.createElement("td");
        const cellDiv = document.createElement("div");
        cellDiv.className = "cell";
        cellDiv.dataset.cellId = `${giorno.toLowerCase()}-${turno.toLowerCase().replace(/\s+/g, "_")}`;
        td.appendChild(cellDiv);
        tr.appendChild(td);
      });
      elements.gridBody.appendChild(tr);
    });
  }

  function updateCellCounter(cellDiv) {
    const count = cellDiv.querySelectorAll('.placed').length;
    let counter = cellDiv.querySelector('.cell-counter');
    
    if (count > 0) {
        if (!counter) {
            counter = document.createElement('div');
            counter.className = 'cell-counter';
            cellDiv.appendChild(counter);
        }
        counter.textContent = count;
        counter.style.display = 'block';
    } else if (counter) {
        counter.style.display = 'none';
    }
  }

  function createPlacedElement(person) {
    const el = document.createElement('div');
    el.className = 'placed';
    el.dataset.name = person.name;
    
    el.draggable = isLoggedIn; 
    
    if (person.inDubbio) {
        el.classList.add('in-dubbio');
    }

    // LOGICA CONTRATTO FISSO (Con Lucchetto)
    const datiStaff = staff.find(s => s.name.toLowerCase() === person.name.toLowerCase());
    if (datiStaff && datiStaff.is_fisso) {
        el.textContent = person.name + " 🔒";
    } else {
        el.textContent = person.name;
    }

    let clickTimer = null; 

    el.addEventListener('click', (e) => {
        if (!isLoggedIn || window.isHistoricalMode) return; 
        e.stopPropagation(); 
        
        if (clickTimer) {
            clearTimeout(clickTimer);
            clickTimer = null;
            
            if (confirm(`Rimuovere "${person.name}"?`)) {
                const parent = el.parentElement;
                el.remove();
                updateCellCounter(parent);
                saveState().then(() => {
                    updateAllSidebarCounts();
                    if (typeof renderMobileView === 'function') renderMobileView(); 
                });
            }
        } else {
            clickTimer = setTimeout(() => {
                const giaInDubbio = el.classList.contains('in-dubbio');
                if (giaInDubbio) {
                    el.classList.remove('in-dubbio');
                    showToast(`Turno confermato per ${person.name}`);
                } else {
                    el.classList.add('in-dubbio');
                    showToast(`${person.name} messo in dubbio (?)`);
                }
                saveState();
                clickTimer = null; 
            }, 250); 
        }
    });
    
    el.addEventListener('dragstart', e => {
        if (!isLoggedIn || window.isHistoricalMode) { e.preventDefault(); return; } 
        currentDraggedElement = el;
        e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'move', name: person.name }));
        setTimeout(() => el.classList.add('dragging'), 0);
    });
    
    el.addEventListener('dragend', () => {
        el.classList.remove('dragging');
        currentDraggedElement = null;
    });
    return el;
  }

  function populateSidebar() {
    elements.sidebarContent.innerHTML = '';
    const groups = staff.reduce((acc, p) => { (acc[p.group || 'Sala'] ||= []).push(p); return acc; }, {});
    
    Object.keys(groups).sort().forEach(g => {
      const div = document.createElement('div');
      div.innerHTML = `<div class="group-title">${g}</div>`;
      // --- AGGIUNTA: Ordina le persone del gruppo mettendo i fissi in cima ---
      groups[g].sort((a, b) => (b.is_fisso ? 1 : 0) - (a.is_fisso ? 1 : 0));
      groups[g].forEach(p => {
        const b = document.createElement('div');
        b.className = 'block';
        
        b.draggable = isLoggedIn;
        b.dataset.name = p.name;
        b.innerHTML = `${p.name} <span class="shift-count">[0]</span>`;
        
        b.addEventListener('dragstart', e => {
            if (!isLoggedIn || window.isHistoricalMode) { e.preventDefault(); return; } 
            e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'new', name: p.name }));
        });
        
        b.addEventListener('click', () => {
            if (!isLoggedIn || window.isHistoricalMode) return; 
            document.querySelectorAll('.selected-for-placement').forEach(el => el.classList.remove('selected-for-placement'));
            if (selectedForPlacement?.name === p.name) {
                selectedForPlacement = null;
            } else {
                selectedForPlacement = p;
                b.classList.add('selected-for-placement');
            }
        });
        div.appendChild(b);
      });
      elements.sidebarContent.appendChild(div);
    });
    updateAllSidebarCounts();
  }

  function updateAllSidebarCounts() {
    const counts = {};
    
    document.querySelectorAll('.placed').forEach(p => {
      const cell = p.closest('.cell');
      const nomeDipendente = p.dataset.name;
      const datiDipendente = staff.find(s => s.name === nomeDipendente);

      if (cell && cell.dataset.cellId.includes('camere')) {
        if (!datiDipendente || datiDipendente.group !== 'Camere') {
            return; 
        }
      }
      
      counts[nomeDipendente] = (counts[nomeDipendente] || 0) + 1;
    });

    document.querySelectorAll(".block").forEach(b => {
      const name = b.dataset.name;
      const person = staff.find(p => p.name === name);
      const count = counts[name] || 0;
      const span = b.querySelector('.shift-count');
      if (span) {
        span.textContent = `[${count}]`;
        span.classList.toggle('limit-reached', person && count >= person.maxShifts);
      }
    });
  }

  function addPersonToCell(cellDiv, name) {
    if (!isLoggedIn) return; 
    if (window.isHistoricalMode) return alert("⚠️ Sei in Modalità Archivio. Clicca 'Clona per oggi' se vuoi modificare questa griglia.");

    const parts = cellDiv.dataset.cellId.split('-'); 
    const giorno = parts[0]; 
    const turno = parts[1];  
    const fasciaSelezionata = fasceOrarie[turno]; 

    if (isDipendenteAssente(name, cellDiv.dataset.cellId)) {
        const procedi = confirm(`⚠️ ATTENZIONE ASSENZA:\n\n"${name}" ha un'assenza registrata in questa data/turno.\n\nVuoi forzare l'inserimento nella griglia lo stesso?`);
        if (!procedi) return; // Se il capo preme "Annulla", il codice si ferma qui. Se preme "Ok", va avanti e lo inserisce.
    }

    let conflittoTrovato = false;
    let nomeTurnoConflitto = "";

    const celleDelGiorno = document.querySelectorAll(`.cell[data-cell-id^="${giorno}-"]`);
    
    celleDelGiorno.forEach(altraCella => {
        const altroTurno = altraCella.dataset.cellId.split('-')[1];
        if (fasceOrarie[altroTurno] === fasciaSelezionata) {
            const presente = Array.from(altraCella.querySelectorAll('.placed')).some(c => c.dataset.name === name);
            if (presente) {
                conflittoTrovato = true;
                nomeTurnoConflitto = altroTurno.replace('_', ' '); 
            }
        }
    });

    if (conflittoTrovato) {
        alert(`Impossibile inserire: "${name}" è già assegnato al turno "${nomeTurnoConflitto}" per il ${fasciaSelezionata.toUpperCase()} di questo giorno.`);
        return; 
    }

    cellDiv.appendChild(createPlacedElement({ name }));
    updateCellCounter(cellDiv);

    // ==========================================
    // AUTOMAZIONE CAMERE
    // ==========================================
    const datiStaff = staff.find(s => s.name.toLowerCase() === name.toLowerCase());
    
    // Se la persona ha il superpotere attivato E il turno è un pranzo
    if (datiStaff && datiStaff.fa_camere) {
        if (turno === 'cucina_pranzo' || turno === 'sala_pranzo') {
            
            // Cerca la cella delle camere per lo stesso giorno
            const idCellaCamere = `${giorno}-camere`;
            const cellaCamere = document.querySelector(`.cell[data-cell-id="${idCellaCamere}"]`);
            
            if (cellaCamere) {
                // Controlla che non sia già dentro per evitare doppioni grafici
                const giaPresente = Array.from(cellaCamere.querySelectorAll('.placed')).some(c => c.dataset.name === name);
                
                if (!giaPresente) {
                    cellaCamere.appendChild(createPlacedElement({ name }));
                    updateCellCounter(cellaCamere);
                    showToast(`${name} aggiunto in automatico anche alle camere 🛏️`);
                }
            }
        }
    }
    // ==========================================
    updateAllSidebarCounts();
    saveState();
    
    if (typeof renderMobileView === 'function') renderMobileView();
  }

  elements.gridBody.addEventListener('dragover', e => {
      if (!isLoggedIn) return;
      e.preventDefault();
      const cell = e.target.closest('.cell');
      if (cell) cell.classList.add('drag-over');
  });

  elements.gridBody.addEventListener('dragleave', e => {
      if (!isLoggedIn) return;
      const cell = e.target.closest('.cell');
      if (cell) cell.classList.remove('drag-over');
  });

  elements.gridBody.addEventListener('drop', e => {
    if (!isLoggedIn) return;
    e.preventDefault();
    const cell = e.target.closest('.cell');
    if (!cell) return;
    cell.classList.remove('drag-over');
    
    const data = JSON.parse(e.dataTransfer.getData('text/plain'));
    
    if (data.type === 'move' && currentDraggedElement) {
        const oldParent = currentDraggedElement.parentElement;
        if (oldParent === cell) return;
        currentDraggedElement.remove();
        updateCellCounter(oldParent);
    }
    
    addPersonToCell(cell, data.name);
    currentDraggedElement = null;
  });

  elements.gridBody.addEventListener('click', e => {
    if (!isLoggedIn) return;
    const cell = e.target.closest('.cell');
    if (cell && selectedForPlacement) {
        addPersonToCell(cell, selectedForPlacement.name);
    }
  });

  elements.resetBtn.addEventListener('click', async () => {
    if (!isLoggedIn) return showToast("Devi accedere per resettare i turni.");
    if(confirm('Resettare tutto?')) {
        document.querySelectorAll('.cell').forEach(c => {
            c.innerHTML = '';
            updateCellCounter(c);
        });
        await saveState();
        updateAllSidebarCounts();
        if (typeof renderMobileView === 'function') renderMobileView();
    }
  });

  

 
  // --- FUNZIONE UNIFICATA PER STAMPA E PDF ---
  // --- FUNZIONE UNIFICATA PER STAMPA E PDF ---
// --- FUNZIONE UNIFICATA PER STAMPA E PDF ---
// --- FUNZIONE UNIFICATA PER STAMPA E PDF ---
 // --- FUNZIONE UNIFICATA PER STAMPA E PDF ---
  async function gestisciEsportazione(azione) {
    const element = document.getElementById('main');
    const originalTitle = document.title;
    
    let customName = elements.tableHeaderTitle.value.trim() || "Turni";
    customName = customName.replace(/\//g, '-');
    const finalFilename = `${customName}.pdf`;
    
    showToast(azione === 'stampa' ? "Preparazione stampa..." : "Generazione in corso...");
    
    document.body.classList.add('print-mode');
    
    // Cambiamo temporaneamente il titolo del sito così il PDF nativo prenderà questo nome!
    document.title = customName; 
    window.scrollTo(0, 0);

    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.remove('mobile-open');

    await new Promise(resolve => setTimeout(resolve, 400));

    const opt = {
        margin: [2, 2, 2, 2],
        filename: finalFilename,
        image: { type: 'jpeg', quality: 1 },
        html2canvas: { scale: 2, useCORS: true, scrollX: 0, scrollY: 0 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
    };

    try {
        if (window.Capacitor && window.Capacitor.isNativePlatform()) {
            // App Nativa iPad (Xcode)
            const pdfDataUri = await html2pdf().from(element).set(opt).output('datauristring');
            const base64Data = pdfDataUri.split(',')[1];
            const savedFile = await window.Capacitor.Plugins.Filesystem.writeFile({
                path: finalFilename, data: base64Data, directory: 'CACHE' 
            });
            await window.Capacitor.Plugins.Share.share({
                title: azione === 'stampa' ? 'Stampa Turni' : 'Esporta PDF', url: savedFile.uri
            });
        } else {
            // BROWSER STANDARD
            if (azione === 'stampa') {
                window.print();
            } else {
                const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || 
                                     (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

                if (isMobileDevice) {
                    const pdfBlob = await html2pdf().from(element).set(opt).output('blob');
                    let condiviso = false;

                    // TENTATIVO A: Condivisione Nativa File 
                    if (navigator.share) {
                        try {
                            const file = new File([pdfBlob], finalFilename, { type: 'application/pdf' });
                            if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
                                await navigator.share({ title: 'Turni Boschetto', files: [file] });
                                condiviso = true;
                            }
                        } catch (shareError) {
                            if (shareError.name === 'AbortError') condiviso = true; 
                        }
                    }

                    // TENTATIVO B: LA MOSSA DI JUDO (Senza blocchi strani)
                    if (!condiviso) {
                        showToast("Apertura anteprima di sistema...");
                        setTimeout(() => {
                            window.print();
                        }, 500);
                    }
                } else {
                    // PC DESKTOP: Download classico
                    await html2pdf().from(element).set(opt).save();
                }
            }
        }
    }
    catch (error) {
        console.error("Errore:", error);
        showToast("Errore durante l'operazione");
    } finally {
        setTimeout(() => {
            document.body.classList.remove('print-mode');
            document.title = originalTitle; 
            const toast = document.getElementById("toast-notification");
            if(toast) toast.classList.remove("show");
        }, 1000);
    }
  }

  // Colleghiamo i bottoni alla nuova funzione unificata
  elements.printBtn.addEventListener('click', () => gestisciEsportazione('stampa'));
  elements.exportPdfBtn.addEventListener('click', () => gestisciEsportazione('pdf'));


  elements.manageStaffBtn.addEventListener('click', () => {
      populateStaffModal();
      elements.staffModal.classList.add('show');
      
      // Chiude la barra laterale sul telefono automaticamente
      const sidebar = document.getElementById('sidebar');
      if (sidebar) sidebar.classList.remove('mobile-open');
  });
  
  elements.closeModalBtn.addEventListener('click', () => elements.staffModal.classList.remove('show'));
  
  // Mini-funzione per creare la riga di ogni dipendente senza ripetere il codice
function createStaffListItem(p) {
      const isFissoStr = p.is_fisso ? '<span style="background: #e0e0e0; color: #555; padding: 2px 5px; border-radius: 3px; font-size: 10px;">Fisso</span>' : '';
      const faCamereStr = p.fa_camere ? '<span style="background: #e1f5fe; color: #0277bd; padding: 2px 5px; border-radius: 3px; font-size: 10px; margin-left: 5px;">+ Camere</span>' : '';
      
      const li = document.createElement('li');
      li.innerHTML = `
          <span style="display: flex; align-items: center; gap: 5px;">${p.name} <small>(${p.group})</small> ${isFissoStr} ${faCamereStr}</span> 
          <div>
              <button class="btn secondary btn-edit" style="padding: 2px 8px; font-size: 11px;">Modifica</button>
              <button class="btn secondary btn-del" style="padding: 2px 8px; font-size: 11px; color:red; border-color:red;">X</button>
          </div>
      `;

      // Logica tasto Modifica
      li.querySelector('.btn-edit').addEventListener('click', () => {
          elements.staffForm.style.display = 'flex';
          elements.addNewStaffBtn.style.display = 'none';
          document.getElementById('staff-name').value = p.name;
          document.getElementById('staff-group').value = p.group;
          document.getElementById('staff-max-shifts').value = p.maxShifts;
          document.getElementById('original-name').value = p.id; 
          document.getElementById('staff-fisso').checked = p.is_fisso || false;
          document.getElementById('staff-fa-camere').checked = p.fa_camere || false; // RIGA NUOVA
      });

      // Logica tasto Elimina
      li.querySelector('.btn-del').addEventListener('click', async () => {
          if (isOffline) return alert("Sei offline! Impossibile eliminare il personale.");
          
          if(confirm(`Eliminare ${p.name}? Verrà rimosso anche dai turni.`)) {
              await supabaseClient.from('staff').delete().eq('id', p.id);
              document.querySelectorAll(`.placed[data-name="${p.name}"]`).forEach(el => {
                  const parent = el.parentElement;
                  el.remove();
                  updateCellCounter(parent);
              });
              await loadStaff(); 
              populateSidebar(); 
              populateStaffModal();
              await saveState(); 
              if (typeof renderMobileView === 'function') renderMobileView();
          }
      });
      return li;
  }

  // La nuova funzione principale che divide e impagina
  function populateStaffModal() {
      elements.staffList.innerHTML = '';

      // 1. BLOCCO PERSONALE FISSO
      const fissi = staff.filter(p => p.is_fisso);
      if (fissi.length > 0) {
          const h3Fissi = document.createElement('h3');
          h3Fissi.textContent = '🔒 PERSONALE FISSO';
          h3Fissi.className = 'staff-modal-section-title';
          elements.staffList.appendChild(h3Fissi);

          const ulFissi = document.createElement('ul');
          fissi.forEach(p => ulFissi.appendChild(createStaffListItem(p)));
          elements.staffList.appendChild(ulFissi);
      }

      // 2. BLOCCHI A CHIAMATA (Divisi per reparto usando .reduce)
      const aChiamata = staff.filter(p => !p.is_fisso);
      const groups = aChiamata.reduce((acc, p) => { 
          (acc[p.group || 'Sala'] ||= []).push(p); 
          return acc; 
      }, {});

      Object.keys(groups).sort().forEach(g => {
          const h3Group = document.createElement('h3');
          h3Group.textContent = `📋 A CHIAMATA - ${g.toUpperCase()}`;
          h3Group.className = 'staff-modal-section-title';
          elements.staffList.appendChild(h3Group);

          const ulGroup = document.createElement('ul');
          groups[g].forEach(p => ulGroup.appendChild(createStaffListItem(p)));
          elements.staffList.appendChild(ulGroup);
      });
  }
  
  elements.addNewStaffBtn.addEventListener('click', () => {
      elements.staffForm.style.display = 'flex';
      elements.addNewStaffBtn.style.display = 'none';
  });

  elements.cancelEditBtn.addEventListener('click', () => {
      elements.staffForm.reset();
      document.getElementById('original-name').value = ''; 
      elements.staffForm.style.display = 'none';
      elements.addNewStaffBtn.style.display = 'block';
  });
  
elements.staffForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (isOffline) {
          alert("Sei offline! Impossibile salvare modifiche al personale.");
          return;
      }
      const id = document.getElementById('original-name').value; 
      const name = document.getElementById('staff-name').value.trim();
      const group = document.getElementById('staff-group').value;
      const maxShifts = document.getElementById('staff-max-shifts').value;
      const is_fisso = document.getElementById('staff-fisso').checked;
      const fa_camere = document.getElementById('staff-fa-camere').checked; // RIGA NUOVA

      if (!name || !group) return alert("Dati mancanti");

      if (id) {
          const oldPerson = staff.find(p => p.id == id);
          const { error } = await supabaseClient.from('staff').update({ name, group, maxShifts, is_fisso, fa_camere }).eq('id', id); // RIGA AGGIORNATA

          if (!error && oldPerson && oldPerson.name !== name) {
              document.querySelectorAll(`.placed[data-name="${oldPerson.name}"]`).forEach(el => {
                  el.dataset.name = name;
                  el.textContent = name;
              });
              await saveState(); 
          }
      } else {
          await supabaseClient.from('staff').insert([{ name, group, maxShifts, is_fisso, fa_camere }]); 
      }

      await loadStaff(); 
      populateSidebar(); 
      populateStaffModal();
      elements.staffForm.reset();
      document.getElementById('original-name').value = ''; 
      elements.staffForm.style.display = 'none';
      elements.addNewStaffBtn.style.display = 'block';
      
      // Forza l'aggiornamento della griglia
      document.querySelectorAll('.cell').forEach(c => { c.innerHTML = ''; });
      await loadState();

      if (typeof renderMobileView === 'function') renderMobileView();
  });

  document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
          selectedForPlacement = null;
          document.querySelectorAll('.selected-for-placement').forEach(el => el.classList.remove('selected-for-placement'));
      }
  });

  function showToast(message) {
      let toast = document.getElementById("toast-notification");
      if (!toast) {
          toast = document.createElement("div");
          toast.id = "toast-notification";
          toast.className = "toast";
          document.body.appendChild(toast);
      }
      
      toast.textContent = message;
      toast.classList.add("show");
      
      if (toast.timeoutId) clearTimeout(toast.timeoutId);
      
      toast.timeoutId = setTimeout(() => {
          toast.classList.remove("show");
      }, 2500);
  }

async function init() {
    await controllaStatoLogin(); 

    document.getElementById('btn-login')?.addEventListener('click', effettuaLogin);
    document.getElementById('btn-logout')?.addEventListener('click', effettuaLogout);

    const spinner = document.getElementById('loading-spinner');
    if(spinner) spinner.style.display = 'block';
    await controllaNotifiche();
    attivaAscoltoRealtime();
    await loadStaff();
    await caricaAssenzeGlobali();
    // Imposta la prima volta al Lunedì corrente per comodità
    let oggi = new Date();
    let giornoOggi = oggi.getDay();
    let diffOggi = oggi.getDate() - giornoOggi + (giornoOggi === 0 ? -6 : 1);
    let lunediCorrente = new Date(oggi.setDate(diffOggi));
    lunediCorrente.setHours(0,0,0,0);
    const offset = lunediCorrente.getTimezoneOffset() * 60000;
    const targetStr = new Date(lunediCorrente - offset).toISOString().split('T')[0];
    
    elements.startDatePicker.value = targetStr;

    // Crea l'array per l'avvio
    giorni = [];
    for(let i = 0; i < 7; i++) {
        let d = new Date(lunediCorrente);
        d.setDate(d.getDate() + i);
        giorni.push(nomiGiorniBase[d.getDay()]);
    }

    generateGrid();
    populateSidebar();
    aggiornaDateInGriglia(lunediCorrente, true);
    await loadState();
    
    
    elements.tableHeaderTitle.addEventListener('blur', () => {
        if(isLoggedIn) saveState(); 
    }); 
    elements.tableHeaderTitle.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') elements.tableHeaderTitle.blur(); 
    });

    if(spinner) spinner.style.display = 'none';
  }

  // --- MACCHINA DEL TEMPO E CLONAZIONE ---
 // --- MACCHINA DEL TEMPO E CLONAZIONE ---
  elements.startDatePicker.addEventListener('change', async (e) => {
      if (!isLoggedIn) return e.preventDefault(); 
      
      const dataCercataStr = e.target.value;
      let dataSelezionata = new Date(dataCercataStr);
      if (isNaN(dataSelezionata.getTime())) return;

      elements.saveStatus.textContent = "Verifica sovrapposizioni...";

// =================================================================
      // INTERCETTAZIONE EFFETTO CALAMITA (SAAS / MULTI-WEEK FLEX)
      // =================================================================
      
      // 1. Controllo preliminare sulla BOZZA ATTIVA (id: 1)
      const { data: activeDraft } = await supabaseClient.from('turni_salvati').select('dati_griglia').eq('id', 1).single();
      let dataBozzaAttiva = activeDraft?.dati_griglia?.["_metadata_start_date"];
      
      if (dataBozzaAttiva && dataCercataStr !== dataBozzaAttiva) {
          let startBozza = new Date(dataBozzaAttiva);
          let fineBozza = new Date(startBozza);
          fineBozza.setDate(startBozza.getDate() + 6);
          
          // Se il giorno scelto è dentro la bozza attiva, chiedi conferma prima di spostare
          if (dataSelezionata >= startBozza && dataSelezionata <= fineBozza) {
              if (confirm(`⚠️ ATTENZIONE\nQuesta data è già compresa nella bozza in corso (iniziata il ${dataBozzaAttiva}).\n\nVuoi allinearti a quella bozza per continuare a modificarla?\n\n(Premi "Annulla" per ignorare e creare una griglia da zero)`)) {
                  e.target.value = dataBozzaAttiva;
                  elements.startDatePicker.dispatchEvent(new Event('change'));
                  showToast("Allineato alla bozza attiva corrente 📝");
                  return;
              }
          }
      }

      // 2. Controllo sullo STORICO delle settimane pubblicate
      const { data: records } = await supabaseClient
          .from('storico_turni')
          .select('id')
          .lte('id', dataCercataStr)
          .order('id', { ascending: false })
          .limit(1);

      if (records && records.length > 0 && dataCercataStr !== records[0].id) {
          const possibileInizioStr = records[0].id;
          let startArchivio = new Date(possibileInizioStr);
          let fineArchivio = new Date(startArchivio);
          fineArchivio.setDate(startArchivio.getDate() + 6);

          // Se il giorno scelto cade dentro un archivio, chiedi conferma prima di spostare
          if (dataSelezionata >= startArchivio && dataSelezionata <= fineArchivio) {
              if (confirm(`⚠️ ARCHIVIO TROVATO\nQuesta data fa parte di una settimana già archiviata (iniziata il ${possibileInizioStr}).\n\nVuoi visualizzare quel documento storico?\n\n(Premi "Annulla" per ignorare e creare una griglia da zero)`)) {
                  e.target.value = possibileInizioStr;
                  elements.startDatePicker.dispatchEvent(new Event('change'));
                  showToast("Allineato a blocco esistente in archivio 🕰️");
                  return;
              }
          }
      }
      // =================================================================

      // Se non trova sovrapposizioni, procede normalmente creando l'array dinamico da questo giorno
      giorni = [];
      for(let i = 0; i < 7; i++) {
          let d = new Date(dataSelezionata);
          d.setDate(d.getDate() + i);
          giorni.push(nomiGiorniBase[d.getDay()]);
      }

      generateGrid();
      aggiornaDateInGriglia(dataSelezionata, true);

      document.querySelectorAll('.cell').forEach(c => { c.innerHTML = ''; updateCellCounter(c); });
      window.assenzeSettimana = {};
      elements.saveStatus.textContent = "Caricamento in corso...";

      let oggi = new Date();
      oggi.setHours(0,0,0,0);
      let dataSceltaObj = new Date(dataSelezionata);
      dataSceltaObj.setHours(0,0,0,0);

      let dataFineObj = new Date(dataSceltaObj);
      dataFineObj.setDate(dataSceltaObj.getDate() + 6);
      
      const isPast = oggi > dataFineObj;

      if (dataCercataStr === dataBozzaAttiva) {
          window.isHistoricalMode = false;
          document.getElementById('historical-banner').style.display = 'none';
          await loadState(); 
          showToast("Bozza attiva caricata 📝");
      } else {
          const { data: archive } = await supabaseClient.from('storico_turni').select('dati_griglia').eq('id', dataCercataStr).single();

          if (archive && archive.dati_griglia) {
              const dati = archive.dati_griglia;
              Object.entries(dati).forEach(([id, people]) => {
                  const cellDiv = document.querySelector(`.cell[data-cell-id="${id}"]`);
                  if (cellDiv && !id.startsWith("_metadata")) {
                      people.forEach(p => cellDiv.appendChild(createPlacedElement(p)));
                      updateCellCounter(cellDiv);
                  }
              });
              window.assenzeSettimana = dati["_metadata_assenze"] || {};
              showToast("Dati recuperati dall'archivio 🕰️");
          } else {
              showToast("Nuova settimana, pronta per l'inserimento ✏️");
          }

          if (isPast) {
              window.isHistoricalMode = true;
              document.getElementById('historical-banner').style.display = 'block';
          } else {
              window.isHistoricalMode = false;
              document.getElementById('historical-banner').style.display = 'none';
          }
      }
      
      if (typeof updateMobileHeader === 'function') updateMobileHeader();
  });
  
  

document.getElementById('clone-week-btn')?.addEventListener('click', async () => {
      if(confirm("Vuoi trasportare questa griglia per usarla come base dei nuovi turni?")) {
          window.isHistoricalMode = false; 
          document.getElementById('historical-banner').style.display = 'none';
          
          // Prende la data attualmente visualizzata e aggiunge esattamente 7 giorni
          let dataAttuale = new Date(elements.startDatePicker.value);
          dataAttuale.setDate(dataAttuale.getDate() + 7);
          
          const offset = dataAttuale.getTimezoneOffset() * 60000;
          const targetStr = new Date(dataAttuale - offset).toISOString().split('T')[0];
          
          elements.startDatePicker.value = targetStr;
          
          // Scatena l'evento "change" per far fare tutto il lavoro al blocco che abbiamo scritto sopra!
          elements.startDatePicker.dispatchEvent(new Event('change'));
          
          await saveState();
          showToast("Settimana clonata con successo! ✨");
      }
  });

  function aggiornaDateInGriglia(dataLunedi, aggiornaTitolo) {
      const thElements = document.querySelectorAll('thead th');
      const dataFine = new Date(dataLunedi);
      dataFine.setDate(dataLunedi.getDate() + 6); 

      const formatta = (d) => `${d.getDate()}/${d.getMonth() + 1}`; 

      if (aggiornaTitolo) {
          elements.tableHeaderTitle.value = `TURNI DAL ${formatta(dataLunedi)} AL ${formatta(dataFine)}`;
      }

      for (let i = 0; i < 7; i++) {
          const dataCorrente = new Date(dataLunedi);
          dataCorrente.setDate(dataLunedi.getDate() + i);
          
          if (thElements[i + 1]) { 
              thElements[i + 1].textContent = `${giorni[i]} ${dataCorrente.getDate()}`;
          }
      }
  }

  // =========================================
  // MOTORE VISTA TELEFONO (MOBILE-FIRST)
  // =========================================
  
  let mobileCurrentDayIndex = 0;

  function updateMobileHeader() {
      const dataRiferimento = new Date(elements.startDatePicker.value);
      if (isNaN(dataRiferimento.getTime())) return;
      
      dataRiferimento.setDate(dataRiferimento.getDate() + mobileCurrentDayIndex);
      
      const dayName = giorni[mobileCurrentDayIndex];
      const headerEl = document.getElementById('mobile-current-day');
      if(headerEl) {
          headerEl.textContent = `${dayName} ${dataRiferimento.getDate()}`;
      }
      renderMobileView();
  }

  document.getElementById('mobile-prev-day')?.addEventListener('click', () => {
      mobileCurrentDayIndex = (mobileCurrentDayIndex - 1 + 7) % 7; 
      updateMobileHeader();
  });

  document.getElementById('mobile-next-day')?.addEventListener('click', () => {
      mobileCurrentDayIndex = (mobileCurrentDayIndex + 1) % 7; 
      updateMobileHeader();
  });

  function renderMobileView() {
      const container = document.getElementById('mobile-cards-container');
      if (!container) return;
      container.innerHTML = ''; 

      const giornoKey = giorni[mobileCurrentDayIndex].toLowerCase();

      turni.forEach(turno => {
          const turnoKey = turno.toLowerCase().replace(/\s+/g, "_");
          const cellId = `${giornoKey}-${turnoKey}`;
          const desktopCell = document.querySelector(`.cell[data-cell-id="${cellId}"]`);

          if (!desktopCell) return;

          const card = document.createElement('div');
          card.className = 'mobile-shift-card';

          const titleDiv = document.createElement('div');
          titleDiv.className = 'mobile-shift-title';
          titleDiv.innerHTML = `<span>${turno}</span>`;

          if (isLoggedIn) {
              const addWrapper = document.createElement('div');
              addWrapper.style.display = 'flex';
              addWrapper.style.alignItems = 'center';
              addWrapper.style.gap = '5px';

              const select = document.createElement('select');
              select.style.display = 'none'; 
              select.style.padding = '4px';
              select.style.borderRadius = '4px';
              select.innerHTML = `<option value="" disabled selected>Aggiungi...</option>`;
              
              staff.forEach(p => {
                  const opt = document.createElement('option');
                  opt.value = p.name;
                  opt.textContent = p.name;
                  select.appendChild(opt);
              });

              const addBtn = document.createElement('button');
              addBtn.className = 'mobile-add-btn';
              addBtn.textContent = '+';
              
              addBtn.onclick = () => {
                  select.style.display = select.style.display === 'none' ? 'block' : 'none';
              };

              select.onchange = () => {
                  if (select.value) {
                      addPersonToCell(desktopCell, select.value); 
                      select.value = ""; 
                      select.style.display = 'none'; 
                  }
              };

              addWrapper.appendChild(select);
              addWrapper.appendChild(addBtn);
              titleDiv.appendChild(addWrapper);
          }
          card.appendChild(titleDiv);

          const people = desktopCell.querySelectorAll('.placed');
          people.forEach(pEl => {
              const personName = pEl.dataset.name;
              const inDubbio = pEl.classList.contains('in-dubbio');
              
              const row = document.createElement('div');
              row.className = 'mobile-person-row';

              const nameSpan = document.createElement('span');
              const datiStaff = staff.find(s => s.name.toLowerCase() === personName.toLowerCase());
              const isFissoStr = (datiStaff && datiStaff.is_fisso) ? " 🔒" : "";
              
              nameSpan.textContent = personName + isFissoStr + (inDubbio ? " ?" : "");
              if (inDubbio) nameSpan.style.fontWeight = 'bold';

              if (isLoggedIn) {
                  nameSpan.style.cursor = 'pointer';
                  nameSpan.style.padding = '5px 10px';
                  nameSpan.style.marginLeft = '-10px';
                  nameSpan.style.borderRadius = '5px';
                  nameSpan.style.backgroundColor = inDubbio ? '#fff3cd' : 'transparent';

                  nameSpan.onclick = async () => {
                      if (inDubbio) {
                          pEl.classList.remove('in-dubbio'); 
                          showToast(`Turno confermato per ${personName}`);
                      } else {
                          pEl.classList.add('in-dubbio'); 
                          showToast(`${personName} messo in dubbio (?)`);
                      }
                      await saveState(); 
                      renderMobileView(); 
                  };
              }
              row.appendChild(nameSpan);

              if (isLoggedIn) {
                  const delBtn = document.createElement('button');
                  delBtn.textContent = '❌';
                  delBtn.style.background = 'none';
                  delBtn.style.border = 'none';
                  delBtn.style.color = 'red';
                  delBtn.style.padding = '0 5px';
                  delBtn.style.cursor = 'pointer';
                  
                  delBtn.onclick = async () => {
                      if (confirm(`Rimuovere ${personName} da questo turno?`)) {
                          pEl.remove();
                          updateCellCounter(desktopCell);
                          await saveState();
                          updateAllSidebarCounts();
                          renderMobileView(); 
                      }
                  };
                  row.appendChild(delBtn);
              }
              card.appendChild(row);
          });

          if (people.length === 0) {
              const empty = document.createElement('div');
              empty.style.color = '#999';
              empty.style.fontSize = '14px';
              empty.style.padding = '10px 0';
              empty.textContent = 'Nessuno assegnato';
              card.appendChild(empty);
          }

          container.appendChild(card);
      });
  }

  // =========================================
  // LOGICA MENU HAMBURGER E ESPORTAZIONI
  // =========================================
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const sidebar = document.getElementById('sidebar');
  const mobileCloseBtn = document.getElementById('mobile-close-sidebar');

  if (mobileMenuBtn && sidebar) {
      mobileMenuBtn.addEventListener('click', () => {
          sidebar.classList.add('mobile-open');
      });
  }

  if (mobileCloseBtn && sidebar) {
      mobileCloseBtn.addEventListener('click', () => {
          sidebar.classList.remove('mobile-open');
      });
  }

  const icsModal = document.getElementById('ics-modal');
  const selectIcs = document.getElementById('select-staff-ics');

document.getElementById('export-ics-btn')?.addEventListener('click', () => {
      selectIcs.innerHTML = '<option value="" disabled selected>Scegli il tuo nome...</option>';
      staff.forEach(p => {
          const opt = document.createElement('option');
          opt.value = p.name;
          opt.textContent = p.name;
          selectIcs.appendChild(opt);
      });
      icsModal.classList.add('show');
      
      const sidebar = document.getElementById('sidebar');
      if (sidebar) sidebar.classList.remove('mobile-open');
  });

  if(document.getElementById('close-ics-modal')) {
      document.getElementById('close-ics-modal').onclick = () => icsModal.classList.remove('show');
  }
  if(document.getElementById('cancel-export-ics')) {
      document.getElementById('cancel-export-ics').onclick = () => icsModal.classList.remove('show');
  }

  if(document.getElementById('confirm-export-ics')) {
      document.getElementById('confirm-export-ics').onclick = () => {
          const nomeSelezionato = selectIcs.value;
          if (!nomeSelezionato) return alert("Per favore, seleziona un nome.");
          
          iscrivitiAlCalendarioLive(nomeSelezionato);
          icsModal.classList.remove('show');
      };
  }

  function iscrivitiAlCalendarioLive(nome) {
      const baseUrl = "fwmixkwojjdgljcynycu.supabase.co/functions/v1/calendario_live";
      const webcalUrl = `webcal://${baseUrl}?nome=${encodeURIComponent(nome)}`;
      window.location.href = webcalUrl;
      const httpsUrl = `https://${baseUrl}?nome=${encodeURIComponent(nome)}`;
      setTimeout(() => {
          prompt(`Se l'App Calendario non si è aperta da sola, copia questo link e usalo per iscriverti:`, httpsUrl);
      }, 500);
  }

  // =========================================
  // LOGICA PUBBLICAZIONE E ARCHIVIAZIONE
  // =========================================
  document.getElementById('publishBtn')?.addEventListener('click', async () => {
      if (!isLoggedIn) return; 
      
      if (confirm("Sei sicuro di voler PUBBLICARE questi turni?\n\nI calendari dei dipendenti si aggiorneranno automaticamente con questa versione.")) {
          showToast("Pubblicazione in corso...");
          const data = getGridData(); 

          const { error } = await supabaseClient.from('turni_salvati').upsert({ 
              id: 2, 
              dati_griglia: data, 
              updated_at: new Date() 
          });

          if (data["_metadata_start_date"]) {
              await supabaseClient.from('storico_turni').upsert({ 
                  id: data["_metadata_start_date"], 
                  dati_griglia: data 
              });
          }
          
          if (error) {
              console.error("Errore pubblicazione:", error);
              alert("Errore di rete durante la pubblicazione. Riprova.");
          } else {
              showToast("Turni pubblicati e archiviati! 🚀");
          }
      }
  });

  //=========================================
  // LOGICA OFFLINE-ONLINE
  //========================================= 
  window.addEventListener('offline', () => {
      showToast("Sei offline. Le modifiche verranno salvate solo su questo dispositivo ⚠️");
  });

  window.addEventListener('online', async () => {
      if (!isLoggedIn) return; 
      showToast("Wi-Fi tornato! Sincronizzazione in corso... ⏳");
      await saveState();
      showToast("Sincronizzazione completata ✅");
  });

  // =========================================
  // LOGICA ASSENZE (MENU A TENDINA) 
  // =========================================
  const absencesModal = document.getElementById('absences-modal');
  document.getElementById('open-absences-btn')?.addEventListener('click', () => {
      elements.staffModal.classList.remove('show'); 
      popolaTendinaAssenze();
      aggiornaListaAssenze();
      absencesModal.classList.add('show');
  });

  document.getElementById('close-absences-modal')?.addEventListener('click', () => {
      absencesModal.classList.remove('show');
  });

  function popolaTendinaAssenze() {
      const selectName = document.getElementById('abs-name');
      
      if(!selectName) return;

      // Svuota e riempie solo la tendina dei nomi (i giorni ora si scelgono coi calendari HTML)
      selectName.innerHTML = '<option value="" disabled selected>Persona...</option>';
      staff.forEach(p => selectName.innerHTML += `<option value="${p.name}">${p.name}</option>`);
  }

 document.getElementById('add-abs-btn')?.addEventListener('click', async () => {
      const nome = document.getElementById('abs-name').value;
      const dataInizio = document.getElementById('abs-data-inizio').value; // INPUT DATE DA AGGIUNGERE IN HTML
      const dataFine = document.getElementById('abs-data-fine').value;     // INPUT DATE DA AGGIUNGERE IN HTML
      const turno = document.getElementById('abs-shift').value; 

      if (!nome || !dataInizio || !dataFine || !turno) return alert("Compila tutti i campi richiesti.");
      
      showToast("Salvataggio nel database globale...");
      
      const { error } = await supabaseClient.from('assenze_globali').insert([{
          nome_dipendente: nome,
          data_inizio: dataInizio,
          data_fine: dataFine,
          turno_specifico: turno,
          stato: 'APPROVATA'
      }]);

      if (error) {
          alert("Errore durante il salvataggio dell'assenza.");
          console.error(error);
      } else {
          showToast(`Assenza globale impostata per ${nome}`);
          await caricaAssenzeGlobali(); // Aggiorna subito la memoria
          aggiornaListaAssenze(); // Aggiorna la grafica (se hai mantenuto la funzione)
      }
  });

  function aggiornaListaAssenze() {
      const ul = document.getElementById('absences-list');
      if(!ul) return;
      ul.innerHTML = '';

      // Legge dalla nuova memoria globale che abbiamo scaricato dal server
      if (!window.assenzeGlobali || window.assenzeGlobali.length === 0) {
          ul.innerHTML = '<li style="color:#999; font-style:italic;">Nessuna richiesta o assenza salvata.</li>';
          return;
      }

      window.assenzeGlobali.forEach(assenza => {
          const li = document.createElement('li');
          li.style.cssText = "display: flex; justify-content: space-between; padding: 6px; border-bottom: 1px solid #eee; font-size: 13px;";
          
          let dateStr = "";
          // Formatta le date in modo carino
          if (assenza.data_inizio === assenza.data_fine) {
              dateStr = assenza.data_inizio.split('-').reverse().join('/');
          } else {
              dateStr = `dal ${assenza.data_inizio.split('-').reverse().join('/')} al ${assenza.data_fine.split('-').reverse().join('/')}`;
          }

            let testoMotivo = assenza.motivo ? `<br><span style="font-size: 11px; color: #888;">📝 ${assenza.motivo}</span>` : '';
            li.innerHTML = `<span><b>${assenza.nome_dipendente}</b>: ${dateStr} (${assenza.turno_specifico.replace(/_/g, ' ').toUpperCase()})${testoMotivo}</span>`;          
          // Bottone per eliminare l'assenza dal Database
          const delBtn = document.createElement('button');
          delBtn.textContent = '❌';
          delBtn.style.cssText = "background:none; border:none; color:red; cursor:pointer; font-size: 16px;";
          delBtn.onclick = async () => {
              if (confirm(`Eliminare l'assenza di ${assenza.nome_dipendente}?`)) {
                  showToast("Cancellazione in corso...");
                  await supabaseClient.from('assenze_globali').delete().eq('id', assenza.id);
                  await caricaAssenzeGlobali(); // Riscarica i dati freschi
                  aggiornaListaAssenze(); // Aggiorna lo schermo
              }
          };
          li.appendChild(delBtn);
          ul.appendChild(li);
      });
  }
// =========================================
// LOGICA NOTIFICHE E APPROVAZIONI
// =========================================
const approvalsModal = document.getElementById('approvals-modal');
const notificationBadge = document.getElementById('notification-badge');
const notificationBell = document.getElementById('notification-bell');

if (notificationBell) {
    notificationBell.addEventListener('click', () => {
        popolaModaleApprovazioni();
        approvalsModal.classList.add('show');
    });
}

if (document.getElementById('close-approvals-modal')) {
    document.getElementById('close-approvals-modal').addEventListener('click', () => {
        approvalsModal.classList.remove('show');
    });
}

// Questa funzione fa da radar e accende il pallino rosso
async function controllaNotifiche() {
    if (!isLoggedIn) {
        if (notificationBell) notificationBell.style.display = 'none';
        return;
    }
    
    if (notificationBell) notificationBell.style.display = 'block';

    const { data, error } = await supabaseClient
        .from('assenze_globali')
        .select('id')
        .eq('stato', 'IN ATTESA');
    
    if (!error && data) {
        if (data.length > 0) {
            notificationBadge.style.display = 'block';
            notificationBadge.textContent = data.length;
        } else {
            notificationBadge.style.display = 'none';
        }
    }
}

// Questa funzione crea la lista con i bottoni Approva/Rifiuta
async function popolaModaleApprovazioni() {
    const ul = document.getElementById('approvals-list');
    if (!ul) return;
    ul.innerHTML = '<li>Caricamento richieste...</li>';
    
    const { data, error } = await supabaseClient
        .from('assenze_globali')
        .select('*')
        .eq('stato', 'IN ATTESA')
        .order('created_at', { ascending: false });
        
    ul.innerHTML = '';
    
    if (error || !data || data.length === 0) {
        ul.innerHTML = '<li style="color:#999; font-style:italic;">Nessuna richiesta in sospeso.</li>';
        return;
    }

    data.forEach(req => {
        const li = document.createElement('li');
        li.style.cssText = "padding: 12px; border-bottom: 1px solid #eee; margin-bottom: 10px; background: #f9f9f9; border-radius: 8px;";
        
        // Costruisce la stringa della data in formato italiano
        let dateStr = req.data_inizio === req.data_fine 
            ? req.data_inizio.split('-').reverse().join('/')
            : `dal ${req.data_inizio.split('-').reverse().join('/')} al ${req.data_fine.split('-').reverse().join('/')}`;
        
        let htmlInfo = `
            <div style="margin-bottom: 12px;">
                <strong style="font-size: 16px;">${req.nome_dipendente}</strong><br>
                <span style="color: #e91e63; font-weight: bold;">${dateStr} (${req.turno_specifico.replace(/_/g, ' ').toUpperCase()})</span>
                ${req.motivo ? `<br><span style="font-size: 13px; color: #555;">📝 Motivo: ${req.motivo}</span>` : ''}
            </div>
        `;
        li.innerHTML = htmlInfo;
        
        const divBtns = document.createElement('div');
        divBtns.style.display = 'flex';
        divBtns.style.gap = '10px';

        // Bottone Verde: APPROVA
        const btnApprove = document.createElement('button');
        btnApprove.textContent = '✅ Approva';
        btnApprove.className = 'btn';
        btnApprove.style.cssText = "background: #28a745; flex: 1; padding: 8px; font-size: 14px;";
        btnApprove.onclick = async () => {
            btnApprove.disabled = true;
            btnReject.disabled = true;
            await supabaseClient.from('assenze_globali').update({ stato: 'APPROVATA' }).eq('id', req.id);
            await caricaAssenzeGlobali(); // Aggiorna la memoria dei blocchi per la griglia
            controllaNotifiche(); // Aggiorna il pallino rosso
            popolaModaleApprovazioni(); // Togle la richiesta dalla campanella
            if (typeof aggiornaListaAssenze === 'function') aggiornaListaAssenze(); // LA TUA AGGIUNTA: la fa comparire nel pannello rosa
        };
        
        // Bottone Rosso: RIFIUTA
        const btnReject = document.createElement('button');
        btnReject.textContent = '❌ Rifiuta';
        btnReject.className = 'btn secondary';
        btnReject.style.cssText = "color: #dc3545; border: 1px solid #dc3545; flex: 1; padding: 8px; font-size: 14px;";
        btnReject.onclick = async () => {
            if(confirm(`Sei sicuro di rifiutare la richiesta di ${req.nome_dipendente}? Verrà cancellata.`)) {
                btnApprove.disabled = true;
                btnReject.disabled = true;
                await supabaseClient.from('assenze_globali').delete().eq('id', req.id);
                controllaNotifiche(); // Aggiorna il pallino rosso
                popolaModaleApprovazioni(); // Togle la richiesta dalla campanella
            }
        };
        
        divBtns.appendChild(btnApprove);
        divBtns.appendChild(btnReject);
        li.appendChild(divBtns);
        ul.appendChild(li);
    });
}
// =========================================
// ASCOLTATORE REALTIME (WEBSOCKET)
// =========================================
function attivaAscoltoRealtime() {
    // Non sprechiamo connessioni se non siamo loggati come Admin
    if (!isLoggedIn) return; 

    // Apriamo un canale radio con Supabase
    supabaseClient
        .channel('canale-assenze')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'assenze_globali' },
            (payload) => {
                // Questo scatta in tempo reale appena il dipendente preme "Invia"
                // o quando il tuo capo preme "Approva/Rifiuta"
                
                controllaNotifiche(); // 1. Aggiorna sùbito il pallino rosso
                
                // 2. Se il capo ha la tendina aperta in quel momento, la ricarica in diretta
                const approvalsModal = document.getElementById('approvals-modal');
                if (approvalsModal && approvalsModal.classList.contains('show')) {
                    popolaModaleApprovazioni();
                }
            }
        )
        .subscribe();
}
  // =========================================
  // REGISTRAZIONE SERVICE WORKER (PWA)
  // =========================================
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(registration => {
          console.log('ServiceWorker registrato con successo:', registration.scope);
        })
        .catch(error => {
          console.log('Registrazione ServiceWorker fallita:', error);
        });
    });
  }

  init();
});