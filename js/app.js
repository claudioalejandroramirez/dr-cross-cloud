document.addEventListener('DOMContentLoaded', async () => {
    const contentArea = document.getElementById('document-content');
    const toggleEditBtn = document.getElementById('toggleEditBtn');
    const saveBtn = document.getElementById('saveBtn');
    const resetBtn = document.getElementById('resetBtn');
    const exportPdfBtn = document.getElementById('exportPdfBtn');
    const exportBackupBtn = document.getElementById('exportBackupBtn');
    const importBackupBtn = document.getElementById('importBackupBtn');
    const importBackupInput = document.getElementById('importBackupInput');
    const statusMessage = document.getElementById('statusMessage');

    let isEditing = false;
    let autosaveTimer = null;
    let restoreEditingAfterPrint = false;

    // Versão nova da chave para manter histórico de compatibilidade.
    const STORAGE_KEY = 'dr_plan_content_v5';
    const LEGACY_STORAGE_KEY = 'dr_plan_content_v4';
    const DB_NAME = 'dr_cross_cloud_editor';
    const DB_STORE = 'documents';
    const DB_KEY = 'main-content';
    const AUTO_SAVE_DELAY_MS = 1200;

    await requestPersistentStorage();
    await loadSavedContent();

    toggleEditBtn.addEventListener('click', () => {
        isEditing = !isEditing;
        if (isEditing) enableEditing();
        else disableEditing();
    });

    saveBtn.addEventListener('click', async () => {
        await persistCurrentContent(true);
    });

    resetBtn.addEventListener('click', async () => {
        if (confirm('Restaurar original? Todas as alterações feitas por você serão perdidas.')) {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(LEGACY_STORAGE_KEY);
            await removeFromIndexedDB(DB_KEY);
            location.reload();
        }
    });

    exportPdfBtn.addEventListener('click', () => {
        exportToPdf();
    });

    exportBackupBtn.addEventListener('click', () => {
        exportBackupFile();
    });

    importBackupBtn.addEventListener('click', () => {
        importBackupInput.click();
    });

    importBackupInput.addEventListener('change', async (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        await importBackupFile(file);
        importBackupInput.value = '';
    });

    window.addEventListener('beforeprint', () => {
        restoreEditingAfterPrint = isEditing;
        if (isEditing) {
            disableEditing();
        }
    });

    window.addEventListener('afterprint', () => {
        if (restoreEditingAfterPrint) {
            enableEditing();
            restoreEditingAfterPrint = false;
        }
    });

    // ==========================================
    // LÓGICA GENÉRICA DE EDIÇÃO DE TABELAS
    // ==========================================

    let tableCounter = 0;

    function addEditingUI() {
        if (!isEditing) return;

        // Aplica controles de edição em TODAS as tabelas do documento
        const allTables = contentArea.querySelectorAll('table');
        allTables.forEach((table) => {
            // Atribui um ID temporário se não tiver
            if (!table.id) {
                table.id = 'editable-table-' + (tableCounter++);
            }
            addTableControls(table);
        });

        // Funcionalidade extra: Barras coloridas do Gantt
        const ganttTable = document.getElementById('gantt-table');
        if (ganttTable) {
            addGanttBarEditing(ganttTable);
        }
    }

    // --- Controles genéricos para qualquer tabela ---
    function addTableControls(table) {
        const tableId = table.id;

        // 1. Botões de Remover Coluna nos headers
        const thead = table.querySelector('thead');
        if (thead) {
            const headers = thead.querySelectorAll('th');
            headers.forEach((th, index) => {
                // Pula colspan headers (divisores de seção como o RACI)
                if (th.colSpan > 1) return;
                if (index === 0) return; // Protege a primeira coluna

                if (!th.querySelector('.remove-col-btn')) {
                    const btn = document.createElement('button');
                    btn.className = 'remove-col-btn';
                    btn.innerHTML = '×';
                    btn.title = 'Remover esta coluna';
                    btn.onclick = (e) => {
                        e.stopPropagation();
                        genericRemoveColumn(tableId, index);
                    };
                    th.appendChild(btn);
                }
            });
        }

        // 2. Botões de Remover Linha no tbody
        const tbody = table.querySelector('tbody');
        if (tbody) {
            const rows = tbody.querySelectorAll('tr');
            rows.forEach((tr) => {
                const firstCell = tr.querySelector('td');
                if (!firstCell) return;
                // Pula linhas que são divisores (colspan)
                if (firstCell.colSpan > 1) return;

                if (!firstCell.querySelector('.remove-row-btn')) {
                    // Adiciona position:relative se necessário
                    if (getComputedStyle(firstCell).position === 'static') {
                        firstCell.style.position = 'relative';
                    }
                    const btn = document.createElement('button');
                    btn.className = 'remove-row-btn';
                    btn.innerHTML = '×';
                    btn.title = 'Remover esta linha';
                    btn.onclick = (e) => {
                        e.stopPropagation();
                        tr.remove();
                    };
                    firstCell.insertBefore(btn, firstCell.firstChild);
                }
            });
        }

        // 3. Botões de Adicionar Linha/Coluna (abaixo da tabela)
        const controlsId = 'table-controls-' + tableId;
        if (!document.getElementById(controlsId)) {
            const controls = document.createElement('div');
            controls.id = controlsId;
            controls.className = 'table-controls';
            controls.innerHTML = `
                <button class="btn btn-sm btn-primary" data-action="add-row" data-table="${tableId}">+ Adicionar Linha</button>
                <button class="btn btn-sm btn-primary" data-action="add-col" data-table="${tableId}">+ Adicionar Coluna</button>
            `;
            controls.querySelector('[data-action="add-row"]').onclick = () => genericAddRow(tableId);
            controls.querySelector('[data-action="add-col"]').onclick = () => genericAddColumn(tableId);

            // Insere após o wrapper (.table-wrap) ou após a própria tabela
            const wrapper = table.closest('.table-wrap') || table.closest('.card') || table.parentNode;
            wrapper.parentNode.insertBefore(controls, wrapper.nextSibling);
        }
    }

    // --- Funções genéricas de manipulação ---
    function genericAddRow(tableId) {
        const table = document.getElementById(tableId);
        if (!table) return;
        const tbody = table.querySelector('tbody') || table;
        const headerRow = table.querySelector('thead tr') || table.querySelector('tr');
        if (!headerRow) return;

        const newRow = tbody.insertRow();
        const colCount = headerRow.cells.length;

        for (let i = 0; i < colCount; i++) {
            const cell = newRow.insertCell();
            if (i === 0) {
                // Primeira coluna: estilo de label
                const isGantt = tableId === 'gantt-table';
                cell.className = isGantt ? 'row-label' : 'td-label';
                cell.innerText = 'Nova linha';
            } else {
                // Demais colunas
                const isGantt = tableId === 'gantt-table';
                if (isGantt) {
                    cell.className = 'cell-bar';
                    cell.innerHTML = ' ';
                } else {
                    cell.innerText = '—';
                }
            }
        }

        disableEditing();
        enableEditing();
    }

    function genericAddColumn(tableId) {
        const table = document.getElementById(tableId);
        if (!table) return;

        // Adiciona header
        const theadTr = table.querySelector('thead tr');
        if (theadTr) {
            const newTh = document.createElement('th');
            newTh.innerText = 'Nova coluna';
            theadTr.appendChild(newTh);
        }

        // Adiciona célula em cada linha do tbody
        const tbodyRows = table.querySelectorAll('tbody tr');
        tbodyRows.forEach(tr => {
            // Pula linhas com colspan (divisores de seção)
            const firstTd = tr.querySelector('td');
            if (firstTd && firstTd.colSpan > 1) {
                firstTd.colSpan = firstTd.colSpan + 1;
                return;
            }

            const cell = tr.insertCell();
            const isGantt = tableId === 'gantt-table';
            if (isGantt) {
                cell.className = 'cell-bar';
                cell.innerHTML = ' ';
            } else {
                cell.innerText = '—';
            }
        });

        disableEditing();
        enableEditing();
    }

    function genericRemoveColumn(tableId, index) {
        if (!confirm('Deseja realmente excluir esta coluna inteira?')) return;
        const table = document.getElementById(tableId);
        if (!table) return;

        const rows = table.querySelectorAll('tr');
        rows.forEach(row => {
            // Pula linhas com colspan (divisores)
            const firstCell = row.cells[0];
            if (firstCell && firstCell.colSpan > 1) {
                firstCell.colSpan = Math.max(1, firstCell.colSpan - 1);
                return;
            }
            if (row.cells.length > index) {
                row.deleteCell(index);
            }
        });

        disableEditing();
        enableEditing();
    }

    // ==========================================
    // LÓGICA ESPECÍFICA DO GANTT (Barras coloridas)
    // ==========================================

    function addGanttBarEditing(ganttTable) {
        const cellBars = ganttTable.querySelectorAll('.cell-bar');
        cellBars.forEach(cell => {
            cell.style.cursor = 'pointer';
            cell.title = 'Clique p/ cor. Shift+Clique p/ tamanho. Ctrl+Clique p/ inserir texto.';
            cell.onclick = (e) => {
                if (!isEditing) return;

                if (e.target.tagName === 'SPAN' && e.target.hasAttribute('contenteditable')) return;

                let bar = cell.querySelector('.bar');

                // Ctrl + Clique: Inserir texto (Marco/Milestone)
                if (e.ctrlKey || e.metaKey) {
                    let text = prompt('Insira o texto para a célula (ex: MÊS 2, Jan/27) ou deixe vazio p/ cancelar:');
                    if (text) {
                        cell.style.textAlign = 'center';
                        cell.innerHTML = `<span style="background:var(--accent);color:var(--navy);padding:2px 8px;border-radius:6px;font-weight:800;font-size:11px;" contenteditable="true">${text}</span>`;
                    }
                    return;
                }

                // Shift + Clique: Editar largura ou criar Milestone
                if (e.shiftKey) {
                    if (bar) {
                        let currentWidth = bar.style.width ? bar.style.width.replace('%', '') : '100';
                        let newWidth = prompt('Largura da barra (em %):', currentWidth);
                        if (newWidth !== null && !isNaN(newWidth)) {
                            bar.style.width = newWidth + '%';
                        }
                    } else {
                        let text = prompt('Insira o texto para o marco especial (ex: MÊS 2) ou deixe vazio para cancelar:');
                        if (text) {
                            cell.style.textAlign = 'center';
                            cell.innerHTML = `<span style="background:var(--accent);color:var(--navy);padding:2px 8px;border-radius:6px;font-weight:800;font-size:11px;" contenteditable="true">${text}</span>`;
                        }
                    }
                    return;
                }

                // Clique normal: alternar cores da barra ou remover
                const colors = ['bar-blue', 'bar-orange', 'bar-purple', 'bar-red', 'bar-gray', 'bar-green'];

                if (!bar) {
                    cell.innerHTML = '';
                    cell.style.textAlign = '';
                    bar = document.createElement('div');
                    bar.className = 'bar ' + colors[0];
                    bar.style.width = '100%';
                    cell.appendChild(bar);
                    return;
                }

                let currentColorIndex = colors.findIndex(c => bar.classList.contains(c));

                if (currentColorIndex === -1 || currentColorIndex === colors.length - 1) {
                    cell.innerHTML = ' ';
                } else {
                    bar.classList.remove(colors[currentColorIndex]);
                    bar.classList.add(colors[currentColorIndex + 1]);
                }
            };
        });
    }

    // ==========================================
    // LIMPEZA DO UI DE EDIÇÃO
    // ==========================================

    function removeEditingUI() {
        // Remove todos os botões de controle e atributos de edição
        document.querySelectorAll('.remove-col-btn, .remove-row-btn').forEach(el => el.remove());
        document.querySelectorAll('[id^="table-controls-"]').forEach(el => el.remove());
        document.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));

        // Remove IDs temporários das tabelas genéricas
        document.querySelectorAll('[id^="editable-table-"]').forEach(el => el.removeAttribute('id'));

        // Remove cursores e eventos das células do Gantt
        const ganttTable = document.getElementById('gantt-table');
        if (ganttTable) {
            ganttTable.querySelectorAll('.cell-bar').forEach(cell => {
                cell.style.cursor = '';
                cell.title = '';
                cell.onclick = null;
            });
        }

        // Limpa position:relative adicionado dinamicamente
        document.querySelectorAll('td[style*="position: relative"]').forEach(td => {
            td.style.position = '';
        });
    }

    // ==========================================
    // FUNÇÕES DE GERENCIAMENTO DE ESTADO
    // ==========================================

    function enableEditing() {
        isEditing = true;
        document.body.classList.add('editing-mode');
        toggleEditBtn.textContent = 'Bloquear Edição';
        toggleEditBtn.classList.replace('btn-primary', 'btn-danger');
        saveBtn.style.display = 'block';
        resetBtn.style.display = 'block';

        // Torna os textos do documento editáveis
        const editableElements = contentArea.querySelectorAll('h1, h2, h3, h4, p, li, th, td, .val, .sub, .tl-phase, label, span');

        editableElements.forEach(el => {
            if (!el.classList.contains('bar') && !el.classList.contains('dot') && !el.classList.contains('remove-row-btn')) {
                el.setAttribute('contenteditable', 'true');
            }
        });

        addEditingUI();
        addAutosaveListener();
        showStatus('Edição ativada ✍️ Todas as tabelas são editáveis. Gantt: Clique p/ cor, Shift p/ tamanho, Ctrl p/ texto.');
    }

    function disableEditing() {
        isEditing = false;
        document.body.classList.remove('editing-mode');
        toggleEditBtn.textContent = 'Ativar Edição';
        toggleEditBtn.classList.replace('btn-danger', 'btn-primary');
        saveBtn.style.display = 'none';
        resetBtn.style.display = 'none';

        removeAutosaveListener();
        removeEditingUI();
        showStatus('');
    }

    async function loadSavedContent() {
        let savedData = localStorage.getItem(STORAGE_KEY);
        if (!savedData) {
            savedData = await readFromIndexedDB(DB_KEY);
        }
        if (!savedData) {
            savedData = localStorage.getItem(LEGACY_STORAGE_KEY);
            if (savedData) {
                await writeToIndexedDB(DB_KEY, savedData);
                localStorage.setItem(STORAGE_KEY, savedData);
            }
        }

        if (savedData) {
            contentArea.innerHTML = savedData;
            showStatus('Rascunho persistente recuperado automaticamente.');
            setTimeout(() => { statusMessage.textContent = ''; }, 2800);
        }
    }

    function showStatus(text) {
        statusMessage.textContent = text;
        if (text.includes('Salvo')) {
            setTimeout(() => { statusMessage.textContent = 'Modo edição ativado ✍️'; }, 3000);
        }
    }

    function addAutosaveListener() {
        contentArea.addEventListener('input', scheduleAutosave);
    }

    function removeAutosaveListener() {
        contentArea.removeEventListener('input', scheduleAutosave);
        if (autosaveTimer) {
            clearTimeout(autosaveTimer);
            autosaveTimer = null;
        }
    }

    function scheduleAutosave() {
        if (!isEditing) return;
        if (autosaveTimer) clearTimeout(autosaveTimer);
        autosaveTimer = setTimeout(async () => {
            await persistCurrentContent(false);
        }, AUTO_SAVE_DELAY_MS);
    }

    async function persistCurrentContent(showSuccessMessage) {
        const currentHTML = getCleanSnapshotHTML();
        localStorage.setItem(STORAGE_KEY, currentHTML);
        await writeToIndexedDB(DB_KEY, currentHTML);

        if (showSuccessMessage) {
            showStatus('Salvo com persistência local reforçada (Storage + IndexedDB) ✅');
        } else {
            statusMessage.textContent = 'Auto-save ativo';
        }
    }

    function getCleanSnapshotHTML() {
        const clone = contentArea.cloneNode(true);
        clone.querySelectorAll('.remove-col-btn, .remove-row-btn, [id^="table-controls-"]').forEach(el => el.remove());
        clone.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
        clone.querySelectorAll('[id^="editable-table-"]').forEach(el => el.removeAttribute('id'));
        clone.querySelectorAll('.cell-bar').forEach(cell => {
            cell.style.cursor = '';
            cell.title = '';
        });
        clone.querySelectorAll('td[style*="position: relative"]').forEach(td => {
            td.style.position = '';
        });
        return clone.innerHTML;
    }

    async function requestPersistentStorage() {
        if (!navigator.storage || !navigator.storage.persist) return;
        try {
            const isPersistent = await navigator.storage.persisted();
            if (!isPersistent) {
                await navigator.storage.persist();
            }
        } catch (error) {
            console.warn('Nao foi possivel pedir persistent storage:', error);
        }
    }

    function openIndexedDB() {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                reject(new Error('IndexedDB nao suportado'));
                return;
            }

            const request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(DB_STORE)) {
                    db.createObjectStore(DB_STORE);
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function writeToIndexedDB(key, value) {
        try {
            const db = await openIndexedDB();
            await new Promise((resolve, reject) => {
                const tx = db.transaction(DB_STORE, 'readwrite');
                tx.objectStore(DB_STORE).put(value, key);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
            db.close();
        } catch (error) {
            console.warn('Falha ao salvar no IndexedDB:', error);
        }
    }

    async function readFromIndexedDB(key) {
        try {
            const db = await openIndexedDB();
            const value = await new Promise((resolve, reject) => {
                const tx = db.transaction(DB_STORE, 'readonly');
                const request = tx.objectStore(DB_STORE).get(key);
                request.onsuccess = () => resolve(request.result || null);
                request.onerror = () => reject(request.error);
            });
            db.close();
            return value;
        } catch (error) {
            return null;
        }
    }

    async function removeFromIndexedDB(key) {
        try {
            const db = await openIndexedDB();
            await new Promise((resolve, reject) => {
                const tx = db.transaction(DB_STORE, 'readwrite');
                tx.objectStore(DB_STORE).delete(key);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
            db.close();
        } catch (error) {
            console.warn('Falha ao remover do IndexedDB:', error);
        }
    }

    function exportToPdf() {
        if (isEditing) {
            disableEditing();
        }
        showStatus('Preparando layout para PDF...');
        setTimeout(() => {
            window.print();
        }, 120);
    }

    function exportBackupFile() {
        const payload = {
            exportedAt: new Date().toISOString(),
            source: 'dr-cross-cloud',
            version: 1,
            html: getCleanSnapshotHTML()
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        a.href = url;
        a.download = `dr-cross-cloud-backup-${stamp}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showStatus('Backup exportado com sucesso.');
    }

    async function importBackupFile(file) {
        try {
            const text = await file.text();
            const payload = JSON.parse(text);
            if (!payload || typeof payload.html !== 'string') {
                throw new Error('Formato de backup invalido.');
            }

            contentArea.innerHTML = payload.html;
            localStorage.setItem(STORAGE_KEY, payload.html);
            await writeToIndexedDB(DB_KEY, payload.html);

            showStatus('Backup importado e aplicado com sucesso ✅');
        } catch (error) {
            showStatus('Falha ao importar backup. Verifique o arquivo JSON.');
        }
    }
});