document.addEventListener('DOMContentLoaded', () => {
    const contentArea = document.getElementById('document-content');
    const toggleEditBtn = document.getElementById('toggleEditBtn');
    const saveBtn = document.getElementById('saveBtn');
    const resetBtn = document.getElementById('resetBtn');
    const statusMessage = document.getElementById('statusMessage');
    
    let isEditing = false;
    
    // A chave de salvamento 'v3' garante que o navegador vai ignorar os dados antigos quebrados
    const STORAGE_KEY = 'dr_plan_content_v3';

    loadSavedContent();

    toggleEditBtn.addEventListener('click', () => {
        isEditing = !isEditing;
        if (isEditing) enableEditing();
        else disableEditing();
    });

    saveBtn.addEventListener('click', () => {
        // Super importante: limpar os botões de controle de tabela antes de salvar o HTML!
        removeEditingUI(); 
        
        const currentHTML = contentArea.innerHTML;
        localStorage.setItem(STORAGE_KEY, currentHTML);
        
        showStatus('Salvo com sucesso no seu navegador! ✅');
        
        // Religa o modo de edição em meio segundo para continuar o trabalho visualmente
        setTimeout(() => enableEditing(), 300); 
    });

    resetBtn.addEventListener('click', () => {
        if(confirm('Restaurar original? Todas as alterações feitas por você serão perdidas.')) {
            localStorage.removeItem(STORAGE_KEY);
            location.reload(); 
        }
    });

    // ==========================================
    // LÓGICA DE MANIPULAÇÃO DA TABELA GANTT
    // ==========================================

    function addEditingUI() {
        if (!isEditing) return;
        const ganttTable = document.getElementById('gantt-table');
        if (!ganttTable) return;

        // 1. Botões de Remover Coluna (Adicionados dentro dos <th >)
        const headers = ganttTable.querySelectorAll('thead th');
        headers.forEach((th, index) => {
            if (index === 0) return; // Protege a primeira coluna (Nomes das Frentes)
            
            if (!th.querySelector('.remove-col-btn')) {
                const btn = document.createElement('button');
                btn.className = 'remove-col-btn';
                btn.innerHTML = '×';
                btn.title = 'Remover este mês';
                btn.onclick = () => removeColumn(index);
                th.appendChild(btn);
            }
        });

        // 2. Botões de Remover Linha (Flutuantes dentro da primeira célula <td>)
        const rows = ganttTable.querySelectorAll('tbody tr');
        rows.forEach((tr) => {
            const firstCell = tr.querySelector('td.row-label');
            if (firstCell && !firstCell.querySelector('.remove-row-btn')) {
                const btn = document.createElement('button');
                btn.className = 'remove-row-btn';
                btn.innerHTML = '×';
                btn.title = 'Remover esta linha';
                btn.onclick = () => tr.remove();
                firstCell.insertBefore(btn, firstCell.firstChild);
            }
        });

        // 3. Botões Globais de Adicionar Linha/Coluna
        if (!document.getElementById('gantt-controls')) {
            const container = document.getElementById('gantt-container');
            const controls = document.createElement('div');
            controls.id = 'gantt-controls';
            controls.className = 'table-controls';
            controls.innerHTML = `
                <button class="btn btn-sm btn-primary" onclick="addRow()">+ Adicionar Linha</button>
                <button class="btn btn-sm btn-primary" onclick="addColumn()">+ Adicionar Coluna (Mês)</button>
            `;
            container.parentNode.insertBefore(controls, container.nextSibling);
        }
    }

    function removeEditingUI() {
        // Limpa a sujeira do HTML antes de jogar no localStorage
        document.querySelectorAll('.remove-col-btn, .remove-row-btn, #gantt-controls').forEach(el => el.remove());
        document.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
    }

    // Expondo as funções para acesso global no botão
    window.addRow = () => {
        const ganttTable = document.getElementById('gantt-table');
        const tbody = ganttTable.querySelector('tbody');
        const headerRow = ganttTable.querySelector('thead tr');
        const newRow = tbody.insertRow();
        
        for (let i = 0; i < headerRow.cells.length; i++) {
            const cell = newRow.insertCell();
            if (i === 0) {
                cell.className = 'row-label';
                cell.innerText = 'Nova Frente';
            } else {
                cell.className = 'cell-bar';
                cell.innerHTML = ' '; // Espaço vazio para não quebrar a largura
            }
        }
        
        disableEditing(); 
        enableEditing(); 
    };

    window.addColumn = () => {
        const ganttTable = document.getElementById('gantt-table');
        const theadTr = ganttTable.querySelector('thead tr');
        const newTh = document.createElement('th');
        newTh.innerText = 'Novo Mês';
        theadTr.appendChild(newTh);

        const tbodyRows = ganttTable.querySelectorAll('tbody tr');
        tbodyRows.forEach(tr => {
            const cell = tr.insertCell();
            cell.className = 'cell-bar';
            cell.innerHTML = ' ';
        });
        
        disableEditing(); 
        enableEditing();
    };

    window.removeColumn = (index) => {
        if (!confirm('Deseja realmente excluir esta coluna inteira?')) return;
        const ganttTable = document.getElementById('gantt-table');
        const rows = ganttTable.querySelectorAll('tr');
        rows.forEach(row => {
            if (row.cells.length > index) {
                row.deleteCell(index);
            }
        });
        disableEditing(); 
        enableEditing();
    };

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

        // Torna os textos do documento editáveis, pulando botões e barras de progresso
        const editableElements = contentArea.querySelectorAll('h1, h2, h3, h4, p, li, th, td.row-label, .val, .sub, .tl-phase, label, span');
        
        editableElements.forEach(el => {
            if(!el.classList.contains('bar') && !el.classList.contains('dot') && !el.classList.contains('remove-row-btn')) {
                el.setAttribute('contenteditable', 'true');
            }
        });
        
        addEditingUI();
        showStatus('Modo de edição ativado ✍️');
    }

    function disableEditing() {
        isEditing = false;
        document.body.classList.remove('editing-mode');
        toggleEditBtn.textContent = 'Ativar Edição';
        toggleEditBtn.classList.replace('btn-danger', 'btn-primary');
        saveBtn.style.display = 'none';
        resetBtn.style.display = 'none';
        
        removeEditingUI();
        showStatus('');
    }

    function loadSavedContent() {
        const savedData = localStorage.getItem(STORAGE_KEY);
        if (savedData) {
            contentArea.innerHTML = savedData;
        }
    }

    function showStatus(text) {
        statusMessage.textContent = text;
        if(text.includes('Salvo')) {
            setTimeout(() => { statusMessage.textContent = 'Modo edição ativado ✍️'; }, 3000);
        }
    }
});