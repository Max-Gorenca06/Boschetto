/* global supabase, html2pdf, html2canvas, Capacitor */

document.addEventListener('DOMContentLoaded', () => {
    MobileDragDrop.polyfill({
      dragImageTranslateOverride: MobileDragDrop.scrollBehaviourDragImageTranslateOverride
  });
  // Questa riga impedisce all'iPad di scorrere la pagina a caso mentre trascini un nome
  window.addEventListener('touchmove', function() {}, {passive: false});
  // CONFIGURAZIONE SUPABASE
  const SUPABASE_URL = 'https://fwmixkwojjdgljcynycu.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3bWl4a3dvampkZ2xqY3lueWN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE3MjU1MzYsImV4cCI6MjA3NzMwMTUzNn0.Nun5QolQqtGZX61RbC8gFqL6ojA9KmoiZI7T6JtSmss';
  const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // --- STATO AUTENTICAZIONE ---
  let isLoggedIn = false;

  async function controllaStatoLogin() {
      const { data: { session } } = await supabaseClient.auth.getSession();
      isLoggedIn = !!session; // Diventa true se c'è una sessione attiva
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
          setTimeout(() => location.reload(), 1000); // Ricarica la pagina da Admin
      }
  }

  async function effettuaLogout() {
      await supabaseClient.auth.signOut();
      showToast("Chiusura sistema in corso...");
      setTimeout(() => location.reload(), 1000); // Ricarica la pagina da Estraneo
  }

  function aggiornaInterfacciaLogin() {
      const loginForm = document.getElementById('login-form');
      const logoutForm = document.getElementById('logout-form');
      if (loginForm && logoutForm) {
          loginForm.style.display = isLoggedIn ? 'none' : 'block';
          logoutForm.style.display = isLoggedIn ? 'block' : 'none';
      }
      
      // Nascondiamo i bottoni pericolosi se non sei il capo
      const btnReset = document.getElementById('resetBtn'); 
      const btnManageStaff = document.getElementById('manageStaffBtn'); 
      if(btnReset) btnReset.style.display = isLoggedIn ? 'inline-block' : 'none';
      if(btnManageStaff) btnManageStaff.style.display = isLoggedIn ? 'inline-block' : 'none';

      // AGGANCIO MOBILE: Aggiorna l'interfaccia mobile se c'è un cambio di login
      if (typeof renderMobileView === 'function') renderMobileView();
  }

  // ELEMENTI DOM
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
    closeModalBtn: document.querySelector('.close-button')
  };

  const giorni = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
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
  let isOffline = false;

  // --- CARICAMENTO E SALVATAGGIO (CON LOGICA OFFLINE) ---
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

  async function loadState() {
    const { data } = await supabaseClient.from('turni_salvati').select('dati_griglia, updated_at').eq('id', 1).single();
    
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
        if (datiDaCaricare["_metadata_start_date"]) {
          elements.startDatePicker.value = datiDaCaricare["_metadata_start_date"];
          const startObj = new Date(datiDaCaricare["_metadata_start_date"]);
          if (!isNaN(startObj.getTime())) aggiornaDateInGriglia(startObj, false); 
        }
      }
      Object.entries(datiDaCaricare).forEach(([id, people]) => {
        const cellDiv = document.querySelector(`.cell[data-cell-id="${id}"]`);
        if (cellDiv && id !== "_metadata_title") {
          cellDiv.innerHTML = '';
          people.forEach(p => cellDiv.appendChild(createPlacedElement(p)));
          updateCellCounter(cellDiv);
        }
      });
      elements.saveStatus.textContent = orarioDisplay;
    }
    updateAllSidebarCounts();
    
    // AGGANCIO MOBILE: Inizializza l'intestazione del telefono al primo caricamento
    if (typeof updateMobileHeader === 'function') updateMobileHeader();
  }

  async function saveState() {
    if (!isLoggedIn) return; // Blocco di sicurezza extra

    elements.saveStatus.textContent = 'Salvataggio...';
    elements.saveStatus.style.color = "#666";
    const data = {};
    data["_metadata_title"] = elements.tableHeaderTitle.value;
    data["_metadata_start_date"] = elements.startDatePicker.value;
    document.querySelectorAll('.cell').forEach(cell => {
      const names = Array.from(cell.querySelectorAll('.placed')).map(p => ({ 
          name: p.dataset.name,
          inDubbio: p.classList.contains('in-dubbio')
      }));
      if (names.length) data[cell.dataset.cellId] = names;
    });
    
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

  // --- CREAZIONE GRIGLIA E ELEMENTI ---
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
    el.textContent = person.name;
    el.dataset.name = person.name;
    
    // LUCCHETTO DRAG & DROP
    el.draggable = isLoggedIn; 
    
    if (person.inDubbio) {
        el.classList.add('in-dubbio');
    }

    el.addEventListener('click', (e) => {
        if (!isLoggedIn) return; // LUCCHETTO CLICK DUBBIO
        e.stopPropagation(); 
        const giaInDubbio = el.classList.contains('in-dubbio');
        
        if (giaInDubbio) {
            el.classList.remove('in-dubbio');
            showToast(`Turno confermato per ${person.name}`);
        } else {
            el.classList.add('in-dubbio');
            showToast(`${person.name} messo in dubbio (?)`);
        }
        saveState();
    });
    
    el.addEventListener('dblclick', async () => {
      if (!isLoggedIn) return showToast("Devi accedere per eliminare turni."); // LUCCHETTO ELIMINAZIONE
      if (confirm(`Rimuovere "${person.name}"?`)) {
        const parent = el.parentElement;
        el.remove();
        updateCellCounter(parent);
        await saveState();
        updateAllSidebarCounts();
        if (typeof renderMobileView === 'function') renderMobileView(); // Aggiorna cell
      }
    });
    
    el.addEventListener('dragstart', e => {
        if (!isLoggedIn) { e.preventDefault(); return; } // LUCCHETTO TRASCINAMENTO
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

  // --- SIDEBAR E CONTEGGI ---
  function populateSidebar() {
    elements.sidebarContent.innerHTML = '';
    const groups = staff.reduce((acc, p) => { (acc[p.group || 'Sala'] ||= []).push(p); return acc; }, {});
    
    Object.keys(groups).sort().forEach(g => {
      const div = document.createElement('div');
      div.innerHTML = `<div class="group-title">${g}</div>`;
      groups[g].forEach(p => {
        const b = document.createElement('div');
        b.className = 'block';
        
        // LUCCHETTO SULLA BARRA LATERALE
        b.draggable = isLoggedIn;
        b.dataset.name = p.name;
        b.innerHTML = `${p.name} <span class="shift-count">[0]</span>`;
        
        b.addEventListener('dragstart', e => {
            if (!isLoggedIn) { e.preventDefault(); return; } // LUCCHETTO
            e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'new', name: p.name }));
        });
        
        b.addEventListener('click', () => {
            if (!isLoggedIn) return; // LUCCHETTO
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
      
      // Cerchiamo l'identikit del dipendente nell'array dello staff
      const datiDipendente = staff.find(s => s.name === nomeDipendente);

      // LA NUOVA REGOLA LOGICA
      if (cell && cell.dataset.cellId.includes('camere')) {
        // Se il dipendente non esiste o il suo gruppo NON è "Camere", ignoriamo il turno
        if (!datiDipendente || datiDipendente.group !== 'Camere') {
            return; 
        }
      }
      
      // Se passa i controlli, aggiungiamo 1 al contatore
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
    if (!isLoggedIn) return; // LUCCHETTO ASSEGNAZIONE

    const parts = cellDiv.dataset.cellId.split('-'); 
    const giorno = parts[0]; 
    const turno = parts[1];  
    const fasciaSelezionata = fasceOrarie[turno]; 

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
    updateAllSidebarCounts();
    saveState();
    
    // AGGANCIO MOBILE: Forza la ricarica visiva delle card per mostrare il nuovo inserito
    if (typeof renderMobileView === 'function') renderMobileView();
  }

  // --- DRAG & DROP EVENTI ---
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

  // --- BOTTONI PRINCIPALI ---
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

  elements.printBtn.addEventListener('click', () => window.print());



// RIMOSSE LE COSTANTI GLOBALI: Usiamo direttamente window.Capacitor per evitare crash

elements.exportPdfBtn.addEventListener('click', async () => {
    // Controllo di sicurezza: verifichiamo di essere davvero sull'iPad
    if (!window.Capacitor || !window.Capacitor.isNativePlatform()) {
        showToast("La condivisione PDF è disponibile solo sull'App per iPad.");
        return;
    }

    const element = document.getElementById('main');
    const originalTitle = document.title;
    
    let customName = elements.tableHeaderTitle.value.trim() || "Turni";
    customName = customName.replace(/\//g, '-');
    const finalFilename = `${customName}.pdf`;
    
    showToast("Generazione PDF in corso...");
    
    // Prepariamo l'interfaccia per la stampa
    document.body.classList.add('print-mode');
    window.scrollTo(0, 0);

    const opt = {
        margin: [2, 2, 2, 2],
        filename: finalFilename,
        image: { type: 'jpeg', quality: 1 },
        html2canvas: { scale: 2, useCORS: true, scrollX: 0, scrollY: 0 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
    };

    try {
        // 1. Chiediamo la "Data URI", che è lo standard corretto per html2pdf
        const pdfDataUri = await html2pdf().from(element).set(opt).output('datauristring');

        // 2. Tagliamo via l'intestazione (data:application/pdf;base64,) per ottenere il codice puro
        const base64Data = pdfDataUri.split(',')[1];

        // 3. Scriviamo il file chiamando la libreria nativa globalmente. Usiamo 'CACHE' come stringa pura.
        const savedFile = await window.Capacitor.Plugins.Filesystem.writeFile({
            path: finalFilename,
            data: base64Data,
            directory: 'CACHE' 
        });

        // 4. Invochiamo il pannello nativo di condivisione Apple
        await window.Capacitor.Plugins.Share.share({
            title: 'Esporta Turni',
            text: 'Ecco il PDF dei turni',
            url: savedFile.uri,
            dialogTitle: 'Condividi il PDF'
        });

    } catch (error) {
        console.error("Errore esportazione:", error);
        showToast("Errore durante la creazione del PDF");
    } finally {
        document.body.classList.remove('print-mode');
        document.title = originalTitle;
    }
});

  // --- MODALE PERSONALE ---
  elements.manageStaffBtn.addEventListener('click', () => {
      populateStaffModal();
      elements.staffModal.classList.add('show');
  });
  elements.closeModalBtn.addEventListener('click', () => elements.staffModal.classList.remove('show'));
  
  function populateStaffModal() {
    elements.staffList.innerHTML = '';
    const ul = document.createElement('ul');
    staff.forEach(p => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span>${p.name} <small>(${p.group})</small></span> 
            <div>
                <button class="btn secondary btn-edit" style="padding: 2px 8px; font-size: 11px;">Modifica</button>
                <button class="btn secondary btn-del" style="padding: 2px 8px; font-size: 11px; color:red; border-color:red;">X</button>
            </div>
        `;

        li.querySelector('.btn-edit').addEventListener('click', () => {
            elements.staffForm.style.display = 'flex';
            elements.addNewStaffBtn.style.display = 'none';
            document.getElementById('staff-name').value = p.name;
            document.getElementById('staff-group').value = p.group;
            document.getElementById('staff-max-shifts').value = p.maxShifts;
            document.getElementById('original-name').value = p.id; 
        });

        li.querySelector('.btn-del').addEventListener('click', async () => {
            if (isOffline) {
                alert("Sei offline! Impossibile eliminare il personale.");
                return;
            }
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
        ul.appendChild(li);
    });
    elements.staffList.appendChild(ul);
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

      if (!name || !group) return alert("Dati mancanti");

      if (id) {
          const oldPerson = staff.find(p => p.id == id);
          const { error } = await supabaseClient.from('staff').update({ name, group, maxShifts }).eq('id', id);

          if (!error && oldPerson && oldPerson.name !== name) {
              document.querySelectorAll(`.placed[data-name="${oldPerson.name}"]`).forEach(el => {
                  el.dataset.name = name;
                  el.textContent = name;
              });
              await saveState(); 
          }
      } else {
          await supabaseClient.from('staff').insert([{ name, group, maxShifts }]);
      }

      await loadStaff(); 
      populateSidebar(); 
      populateStaffModal();
      elements.staffForm.reset();
      document.getElementById('original-name').value = ''; 
      elements.staffForm.style.display = 'none';
      elements.addNewStaffBtn.style.display = 'block';
      
      if (typeof renderMobileView === 'function') renderMobileView();
  });

  document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
          selectedForPlacement = null;
          document.querySelectorAll('.selected-for-placement').forEach(el => el.classList.remove('selected-for-placement'));
      }
  });

  // --- FUNZIONE TOAST NOTIFICATION ---
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

  // --- AVVIO APP ---
  async function init() {
    await controllaStatoLogin(); // IL FRENO A MANO

    document.getElementById('btn-login')?.addEventListener('click', effettuaLogin);
    document.getElementById('btn-logout')?.addEventListener('click', effettuaLogout);

    const spinner = document.getElementById('loading-spinner');
    if(spinner) spinner.style.display = 'block';
    
    await loadStaff();
    generateGrid();
    populateSidebar();
    await loadState();
    
    elements.tableHeaderTitle.addEventListener('blur', () => {
        if(isLoggedIn) saveState(); 
    }); 
    elements.tableHeaderTitle.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') elements.tableHeaderTitle.blur(); 
    });

    if(spinner) spinner.style.display = 'none';
  }

  // --- GESTIONE DATE AUTOMATICHE ---
  elements.startDatePicker.addEventListener('change', (e) => {
      if (!isLoggedIn) return e.preventDefault(); // LUCCHETTO DATA
      
      let dataSelezionata = new Date(e.target.value);
      if (isNaN(dataSelezionata.getTime())) return;

      const giornoDellaSettimana = dataSelezionata.getDay();
      if (giornoDellaSettimana !== 1) { 
          const differenza = dataSelezionata.getDate() - giornoDellaSettimana + (giornoDellaSettimana === 0 ? -6 : 1);
          dataSelezionata = new Date(dataSelezionata.setDate(differenza));
          
          const offset = dataSelezionata.getTimezoneOffset() * 60000;
          e.target.value = new Date(dataSelezionata - offset).toISOString().split('T')[0];
          
          showToast("Data agganciata in automatico al Lunedì della settimana!");
      }

      aggiornaDateInGriglia(dataSelezionata, true);
      saveState();
      
      // AGGANCIO MOBILE: Se la data cambia, ricalcoliamo la visuale telefono
      if (typeof updateMobileHeader === 'function') updateMobileHeader();
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
      // Calcola la data esatta in base al Lunedì selezionato e all'indice del giorno mobile
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

  // Tasti navigazione giorni su Telefono
  document.getElementById('mobile-prev-day')?.addEventListener('click', () => {
      mobileCurrentDayIndex = (mobileCurrentDayIndex - 1 + 7) % 7; // Torna indietro in loop
      updateMobileHeader();
  });

  document.getElementById('mobile-next-day')?.addEventListener('click', () => {
      mobileCurrentDayIndex = (mobileCurrentDayIndex + 1) % 7; // Va avanti in loop
      updateMobileHeader();
  });

  function renderMobileView() {
      const container = document.getElementById('mobile-cards-container');
      if (!container) return;
      container.innerHTML = ''; // Pulisce le vecchie card

      const giornoKey = giorni[mobileCurrentDayIndex].toLowerCase();

      turni.forEach(turno => {
          const turnoKey = turno.toLowerCase().replace(/\s+/g, "_");
          const cellId = `${giornoKey}-${turnoKey}`;
          const desktopCell = document.querySelector(`.cell[data-cell-id="${cellId}"]`);

          if (!desktopCell) return;

          const card = document.createElement('div');
          card.className = 'mobile-shift-card';

          // 1. INTESTAZIONE CARD (Es: "Cucina pranzo")
          const titleDiv = document.createElement('div');
          titleDiv.className = 'mobile-shift-title';
          titleDiv.innerHTML = `<span>${turno}</span>`;

          // 2. IL MENU A TENDINA E IL TASTO "+" (Solo se loggati)
          if (isLoggedIn) {
              const addWrapper = document.createElement('div');
              addWrapper.style.display = 'flex';
              addWrapper.style.alignItems = 'center';
              addWrapper.style.gap = '5px';

              const select = document.createElement('select');
              select.style.display = 'none'; // Nascosto all'inizio
              select.style.padding = '4px';
              select.style.borderRadius = '4px';
              select.innerHTML = `<option value="" disabled selected>Aggiungi...</option>`;
              
              // Carica tutto il personale nella tendina
              staff.forEach(p => {
                  const opt = document.createElement('option');
                  opt.value = p.name;
                  opt.textContent = p.name;
                  select.appendChild(opt);
              });

              const addBtn = document.createElement('button');
              addBtn.className = 'mobile-add-btn';
              addBtn.textContent = '+';
              
              // Logica click tasto "+"
              addBtn.onclick = () => {
                  select.style.display = select.style.display === 'none' ? 'block' : 'none';
              };

              // Logica scelta dal menu a tendina
              select.onchange = () => {
                  if (select.value) {
                      addPersonToCell(desktopCell, select.value); // Usa la magia che hai già!
                      select.value = ""; 
                      select.style.display = 'none'; // Richiude la tendina
                  }
              };

              addWrapper.appendChild(select);
              addWrapper.appendChild(addBtn);
              titleDiv.appendChild(addWrapper);
          }
          card.appendChild(titleDiv);

          // 3. LISTA DELLE PERSONE ASSEGNATE
          const people = desktopCell.querySelectorAll('.placed');
          people.forEach(pEl => {
              const personName = pEl.dataset.name;
              const inDubbio = pEl.classList.contains('in-dubbio');

              const row = document.createElement('div');
              row.className = 'mobile-person-row';

              const nameSpan = document.createElement('span');
              nameSpan.textContent = personName + (inDubbio ? " ?" : "");
              if (inDubbio) nameSpan.style.fontWeight = 'bold';

              row.appendChild(nameSpan);

              // Tasto Elimina (X) su mobile
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
                          renderMobileView(); // Aggiorna graficamente
                      }
                  };
                  row.appendChild(delBtn);
              }
              card.appendChild(row);
          });

          // Se non c'è nessuno, mostra una scritta grigia
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

  // Lancio finale
  init();
});