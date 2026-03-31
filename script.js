/* global supabase, html2pdf, html2canvas, Capacitor */

document.addEventListener('DOMContentLoaded', () => {
  // CONFIGURAZIONE SUPABASE
  const SUPABASE_URL = 'https://fwmixkwojjdgljcynycu.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3bWl4a3dvampkZ2xqY3lueWN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE3MjU1MzYsImV4cCI6MjA3NzMwMTUzNn0.Nun5QolQqtGZX61RbC8gFqL6ojA9KmoiZI7T6JtSmss';
  const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

  // --- CARICAMENTO E SALVATAGGIO ---
  async function loadStaff() {
    const { data, error } = await supabaseClient.from('staff').select('*').order('name');
    if (error) { console.error(error); alert("Errore caricamento staff."); }
    staff = data || [];
  }

  async function loadState() {
    const { data } = await supabaseClient.from('turni_salvati').select('dati_griglia, updated_at').eq('id', 1).single();
    if (data?.dati_griglia) {
      if (data.dati_griglia["_metadata_title"]) {
        elements.tableHeaderTitle.value = data.dati_griglia["_metadata_title"];
      }
      Object.entries(data.dati_griglia).forEach(([id, people]) => {
        const cellDiv = document.querySelector(`.cell[data-cell-id="${id}"]`);
        if (cellDiv) {
          cellDiv.innerHTML = '';
          people.forEach(p => cellDiv.appendChild(createPlacedElement(p)));
          updateCellCounter(cellDiv);
        }
      });
      if(data.updated_at) {
          const d = new Date(data.updated_at);
          elements.saveStatus.textContent = `Caricato: ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
      }
    }
    updateAllSidebarCounts();
  }

async function saveState() {
    elements.saveStatus.textContent = 'Salvataggio...';
    const data = {};
    data["_metadata_title"] = elements.tableHeaderTitle.value;
    
    document.querySelectorAll('.cell').forEach(cell => {
      // NUOVO: Ora salviamo anche se la classe 'in-dubbio' è presente oppure no
      const names = Array.from(cell.querySelectorAll('.placed')).map(p => ({ 
          name: p.dataset.name,
          inDubbio: p.classList.contains('in-dubbio')
      }));
      if (names.length) data[cell.dataset.cellId] = names;
    });
    
    const { error } = await supabaseClient.from('turni_salvati').update({ dati_griglia: data, updated_at: new Date() }).eq('id', 1);
    
    if (error) {
        elements.saveStatus.textContent = "Errore salvataggio!";
        elements.saveStatus.style.color = "red";
    } else {
        elements.saveStatus.textContent = `Salvato: ${new Date().toLocaleTimeString()}`;
        elements.saveStatus.style.color = "#666";
    }
  }

  // --- CREAZIONE GRIGLIA ---
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
        // ID generato es: "lunedi-camere"
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
    el.draggable = true;
    
    // NUOVO: Se il database ci dice che era in dubbio, gli rimettiamo la classe grafica
    if (person.inDubbio) {
        el.classList.add('in-dubbio');
    }

 
    el.oncontextmenu = function(e) {
        e.preventDefault();   // Blocca il comportamento standard
        e.stopPropagation();  // Impedisce ad altri elementi di interferire
        el.classList.toggle('in-dubbio'); // Accende o spegne la grafica
        saveState();          // Salva in background
        return false;         // Il comando definitivo che zittisce il browser
    };
    
    el.addEventListener('dblclick', async () => {
      if (confirm(`Rimuovere "${person.name}"?`)) {
        const parent = el.parentElement;
        el.remove();
        updateCellCounter(parent);
        await saveState();
        updateAllSidebarCounts();
      }
    });
    
    el.addEventListener('dragstart', e => {
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

  // --- SIDEBAR ---

  function populateSidebar() {
    elements.sidebarContent.innerHTML = '';
    const groups = staff.reduce((acc, p) => { (acc[p.group || 'Sala'] ||= []).push(p); return acc; }, {});
    
    Object.keys(groups).sort().forEach(g => {
      const div = document.createElement('div');
      div.innerHTML = `<div class="group-title">${g}</div>`;
      groups[g].forEach(p => {
        const b = document.createElement('div');
        b.className = 'block';
        b.draggable = true;
        b.dataset.name = p.name;
        b.innerHTML = `${p.name} <span class="shift-count">[0]</span>`;
        
        b.addEventListener('dragstart', e => {
            e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'new', name: p.name }));
        });
        
        b.addEventListener('click', () => {
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

  // --- MODIFICATA: LOGICA DI CONTEGGIO TURNI ---
  function updateAllSidebarCounts() {
    const counts = {};
    
    document.querySelectorAll('.placed').forEach(p => {
      // Trova la cella genitore
      const cell = p.closest('.cell');
      
      // Se la cella appartiene al turno "Camere", NON contare questo turno
      // L'ID della cella contiene la parola "camere" (es: "lunedi-camere")
      if (cell && cell.dataset.cellId.includes('camere')) {
        return; // Salta questa iterazione
      }

      // Altrimenti conta normalmente
      counts[p.dataset.name] = (counts[p.dataset.name] || 0) + 1;
    });

    // Aggiorna la sidebar
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
    // 1. Capiamo in che giorno e in che fascia stiamo provando a inserire la persona
    const parts = cellDiv.dataset.cellId.split('-'); 
    const giorno = parts[0]; // es: "lunedì"
    const turno = parts[1];  // es: "sala_pranzo"
    const fasciaSelezionata = fasceOrarie[turno]; // es: "pranzo"

    let conflittoTrovato = false;
    let nomeTurnoConflitto = "";

    // 2. Cerchiamo tutte le celle di quello STESSO giorno
    const celleDelGiorno = document.querySelectorAll(`.cell[data-cell-id^="${giorno}-"]`);
    
    // 3. Controlliamo se in una di quelle celle della stessa fascia c'è già la persona
    celleDelGiorno.forEach(altraCella => {
        const altroTurno = altraCella.dataset.cellId.split('-')[1];
        
        // Se la cella fa parte della stessa fascia oraria...
        if (fasceOrarie[altroTurno] === fasciaSelezionata) {
            // ...controlliamo se il nome è già lì dentro
            const presente = Array.from(altraCella.querySelectorAll('.placed')).some(c => c.dataset.name === name);
            if (presente) {
                conflittoTrovato = true;
                nomeTurnoConflitto = altroTurno.replace('_', ' '); // Rende "sala_pranzo" più leggibile come "sala pranzo"
            }
        }
    });

    // Se c'è un conflitto, blocchiamo tutto e avvisiamo il capo
    if (conflittoTrovato) {
        alert(`Impossibile inserire: "${name}" è già assegnato al turno "${nomeTurnoConflitto}" per il ${fasciaSelezionata.toUpperCase()} di questo giorno.`);
        return; // Ferma l'esecuzione della funzione
    }

    // Se tutto è libero, procediamo normalmente con l'inserimento
    cellDiv.appendChild(createPlacedElement({ name }));
    updateCellCounter(cellDiv);
    updateAllSidebarCounts();
    saveState();
  }

  // --- DRAG & DROP ---
  elements.gridBody.addEventListener('dragover', e => {
      e.preventDefault();
      const cell = e.target.closest('.cell');
      if (cell) cell.classList.add('drag-over');
  });

  elements.gridBody.addEventListener('dragleave', e => {
      const cell = e.target.closest('.cell');
      if (cell) cell.classList.remove('drag-over');
  });

  elements.gridBody.addEventListener('drop', e => {
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
    const cell = e.target.closest('.cell');
    if (cell && selectedForPlacement) {
        addPersonToCell(cell, selectedForPlacement.name);
    }
  });

  // --- BOTTONI ---
  elements.resetBtn.addEventListener('click', async () => {
    if(confirm('Resettare tutto?')) {
        document.querySelectorAll('.cell').forEach(c => {
            c.innerHTML = '';
            updateCellCounter(c);
        });
        await saveState();
        updateAllSidebarCounts();
    }
  });

  elements.printBtn.addEventListener('click', () => window.print());


// --- EXPORT PDF ---
  elements.exportPdfBtn.addEventListener('click', () => {
    const element = document.getElementById('main');
    const originalTitle = document.title;
    
    // --- NUOVA LOGICA NOME FILE AUTOMATICO ---
    // 1. Prendi il testo scritto dal capo
    let customName = elements.tableHeaderTitle.value.trim();
    
    // 2. Se è vuoto, usa la data di oggi come paracadute
    if (!customName) {
        customName = `Turni_${new Date().toLocaleDateString('it-IT')}`;
    } else {
        // 3. Sostituisci le barre (/) con i trattini (-) perché i computer odiano le barre nei nomi dei file
        customName = customName.replace(/\//g, '-');
    }
    
    // 4. Aggiungi .pdf alla fine
    const finalFilename = `${customName}.pdf`;
    document.title = finalFilename; 
    
    // FORZA LO SCROLL A ZERO
    window.scrollTo(0, 0);
    element.scrollLeft = 0;
    element.scrollTop = 0;
    
    document.body.classList.add('print-mode');
    
    setTimeout(() => {
        const opt = {
            margin: [2, 2, 2, 2],
            filename: finalFilename, // <--- ORA USA IL NOME DINAMICO
            image: { type: 'jpeg', quality: 1 },
            html2canvas: { 
                scale: 2, 
                useCORS: true,
                scrollX: 0,
                scrollY: 0
            },
            jsPDF: { 
                unit: 'mm', 
                format: 'a4', 
                orientation: 'landscape' 
            }
        };

        html2pdf().from(element).set(opt).save().then(() => {
            document.body.classList.remove('print-mode');
            document.title = originalTitle;
        });
    }, 300); 
  });
  // --- MODALE ---
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
        // Aggiungiamo il tasto Modifica e rendiamo il tasto X più evidente
        li.innerHTML = `
            <span>${p.name} <small>(${p.group})</small></span> 
            <div>
                <button class="btn secondary btn-edit" style="padding: 2px 8px; font-size: 11px;">Modifica</button>
                <button class="btn secondary btn-del" style="padding: 2px 8px; font-size: 11px; color:red; border-color:red;">X</button>
            </div>
        `;

        // Evento Modifica: apre il form e lo popola
        li.querySelector('.btn-edit').addEventListener('click', () => {
            elements.staffForm.style.display = 'flex';
            elements.addNewStaffBtn.style.display = 'none';
            document.getElementById('staff-name').value = p.name;
            document.getElementById('staff-group').value = p.group;
            document.getElementById('staff-max-shifts').value = p.maxShifts;
            document.getElementById('original-name').value = p.id; // Salviamo l'ID qui
        });

        // Evento Elimina: rimosso anche dalla griglia
        li.querySelector('.btn-del').addEventListener('click', async () => {
            if(confirm(`Eliminare ${p.name}? Verrà rimosso anche dai turni.`)) {
                // 1. Elimina da Supabase (tabella staff)
                await supabaseClient.from('staff').delete().eq('id', p.id);
                
                // 2. Rimuovi fisicamente dalla griglia visibile
                document.querySelectorAll(`.placed[data-name="${p.name}"]`).forEach(el => {
                    const parent = el.parentElement;
                    el.remove();
                    updateCellCounter(parent);
                });

                // 3. Aggiorna tutto e SALVA la griglia pulita
                await loadStaff(); 
                populateSidebar(); 
                populateStaffModal();
                await saveState(); // Questo aggiorna la tabella 'turni_salvati'
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
    document.getElementById('original-name').value = ''; // Svuota l'ID
    elements.staffForm.style.display = 'none';
    elements.addNewStaffBtn.style.display = 'block';
});
  
elements.staffForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('original-name').value; // Se c'è, siamo in modifica
    const name = document.getElementById('staff-name').value.trim();
    const group = document.getElementById('staff-group').value;
    const maxShifts = document.getElementById('staff-max-shifts').value;

    if (!name || !group) return alert("Dati mancanti");

    if (id) {
        // --- LOGICA DI MODIFICA (UPDATE) ---
        const oldPerson = staff.find(p => p.id == id);
        const { error } = await supabaseClient
            .from('staff')
            .update({ name, group, maxShifts })
            .eq('id', id);

        if (!error && oldPerson && oldPerson.name !== name) {
            // Se hai cambiato il nome, aggiorna tutti i blocchi nella griglia
            document.querySelectorAll(`.placed[data-name="${oldPerson.name}"]`).forEach(el => {
                el.dataset.name = name;
                el.textContent = name;
            });
            await saveState(); // Salva la griglia con i nuovi nomi
        }
    } else {
        // --- LOGICA DI INSERIMENTO (INSERT) ---
        await supabaseClient.from('staff').insert([{ name, group, maxShifts }]);
    }

    // Reset finale
    await loadStaff(); 
    populateSidebar(); 
    populateStaffModal();
    elements.staffForm.reset();
    document.getElementById('original-name').value = ''; 
    elements.staffForm.style.display = 'none';
    elements.addNewStaffBtn.style.display = 'block';
});

  document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
          selectedForPlacement = null;
          document.querySelectorAll('.selected-for-placement').forEach(el => el.classList.remove('selected-for-placement'));
      }
  });

  async function init() {
    const spinner = document.getElementById('loading-spinner');
    if(spinner) spinner.style.display = 'block';
    
    await loadStaff();
    generateGrid();
    populateSidebar();
    await loadState();
    elements.tableHeaderTitle.addEventListener('blur', saveState); // Salva quando si clicca fuori
    elements.tableHeaderTitle.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') elements.tableHeaderTitle.blur(); // Salva premendo Invio
    });

    if(spinner) spinner.style.display = 'none';
  }

  init();
});