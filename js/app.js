import { state, photoDB, loadState } from './state.js';
import { elements, initUI, showMainApp, updateTheme, renderDashboard, renderLoadedLists, renderDirectory, showToast, showConfirmationModal, populateAreaSelects, populateReportFilters, populateBookTypeFilter, filterAndRenderInventory, renderUserList, renderAdicionalesList, populateAdicionalesFilters, handleModalNavigation, checkReadOnlyMode, changeTab, updateActiveUserBanner, showPreprintModal, renderInventoryTable } from './ui.js';
import { recalculateLocationCounts, startAutosave, handleEmployeeLogin, startQrScanner, stopQrScanner, handleInventoryActions, deleteAdditionalItem, assignItem, deleteListAndRefresh, checkInventoryCompletion, checkAreaCompletion, runComparisonAlgorithm } from './logic.js';
import { processFile, exportInventoryToXLSX, exportLabelsToXLSX, exportSession } from './files.js';

// --- SERVICE WORKER (PWA) ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker registrado con alcance:', reg.scope))
            .catch(err => console.error('Fallo Service Worker:', err));
    });
}

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
    initUI(); // Poblar referencias al DOM
    
    photoDB.init().catch(err => console.error('DB Error:', err));

    // Cargar Estado
    if (loadState()) {
        recalculateLocationCounts();
        if (state.loggedIn) {
            showMainApp();
        } else {
            elements.loginPage.classList.remove('hidden');
            elements.mainApp.classList.add('hidden');
        }
    } else {
        elements.loginPage.classList.remove('hidden');
        elements.mainApp.classList.add('hidden');
    }

    // --- EVENT LISTENERS ---

    // Login
    if (elements.employeeLoginBtn) elements.employeeLoginBtn.addEventListener('click', handleEmployeeLogin);
    if (elements.employeeNumberInput) {
        elements.employeeNumberInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); handleEmployeeLogin(); }
        });
    }

    // Dashboard Toggle
    if (elements.dashboard.toggleBtn) {
        elements.dashboard.toggleBtn.addEventListener('click', () => {
            elements.dashboard.headerAndDashboard.classList.toggle('hidden');
        });
    }

    // Logo easter egg (Log)
    let logoClickCount = 0;
    if (elements.logo.title) {
        elements.logo.title.addEventListener('click', () => {
            logoClickCount++;
            if (logoClickCount >= 5) {
                const logText = state.activityLog.join('\n');
                const blob = new Blob([logText], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `log_inventario_${new Date().toISOString().slice(0,10)}.txt`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showToast('Registro de actividad descargado.');
                logoClickCount = 0;
            }
        });
    }

    // Limpiar Sesión
    if (elements.clearSessionLink) {
        elements.clearSessionLink.addEventListener('click', (e) => {
            e.preventDefault();
            showConfirmationModal('Limpiar Sesión Completa', 'Esto borrará TODO el progreso, incluyendo usuarios e inventario guardado en este navegador. ¿Estás seguro?', () => {
                localStorage.removeItem('inventarioProState');
                // Usar un deleteDB importado o recargar para limpiar
                // Para simplicidad, borramos y recargamos
                const req = indexedDB.deleteDatabase('InventarioProPhotosDB');
                req.onsuccess = () => window.location.reload();
                req.onerror = () => window.location.reload();
            });
        });
    }

    // Logout
    if (elements.logoutBtn) {
        elements.logoutBtn.addEventListener('click', () => {
            // saveState(); se hace en logic/ui al cambiar
            elements.mainApp.classList.add('hidden');
            elements.loginPage.classList.remove('hidden');
        });
    }

    // Carga de Archivos
    if (elements.uploadBtn) {
        elements.uploadBtn.addEventListener('click', () => {
            elements.fileInput.value = ''; 
            elements.fileInput.click();
        });
    }
    if (elements.fileInput) {
        elements.fileInput.addEventListener('change', (e) => {
            [...e.target.files].forEach(file => processFile(file));
            e.target.value = '';
        });
    }

    // Navegación Tabs
    if (elements.tabsContainer) {
        elements.tabsContainer.addEventListener('click', e => {
            const tabBtn = e.target.closest('.tab-btn');
            if(tabBtn && tabBtn.dataset.tab) changeTab(tabBtn.dataset.tab);
        });
    }

    // Inventario Search
    if (elements.inventory.searchInput) {
        let timeout;
        elements.inventory.searchInput.addEventListener('input', () => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                // Reset page logic needs to be imported or handled
                filterAndRenderInventory();
            }, 300);
        });
    }

    // Filtros Inventario
    if (elements.inventory.statusFilter) elements.inventory.statusFilter.addEventListener('change', filterAndRenderInventory);
    if (elements.inventory.areaFilter) elements.inventory.areaFilter.addEventListener('change', filterAndRenderInventory);
    if (elements.inventory.bookTypeFilter) elements.inventory.bookTypeFilter.addEventListener('change', filterAndRenderInventory);
    
    // Acciones Inventario
    if (elements.inventory.ubicadoBtn) elements.inventory.ubicadoBtn.addEventListener('click', () => handleInventoryActions('ubicar'));
    if (elements.inventory.reEtiquetarBtn) elements.inventory.reEtiquetarBtn.addEventListener('click', () => handleInventoryActions('re-etiquetar'));
    if (elements.inventory.desubicarBtn) elements.inventory.desubicarBtn.addEventListener('click', () => handleInventoryActions('desubicar'));
    if (elements.inventory.qrScanBtn) elements.inventory.qrScanBtn.addEventListener('click', startQrScanner);
    if (elements.inventory.clearSearchBtn) {
        elements.inventory.clearSearchBtn.addEventListener('click', () => {
            elements.inventory.searchInput.value = '';
            elements.inventory.statusFilter.value = 'all';
            elements.inventory.areaFilter.value = 'all';
            elements.inventory.bookTypeFilter.value = 'all';
            filterAndRenderInventory();
        });
    }

    // Selección Checkbox
    if (elements.inventory.selectAllCheckbox) {
        elements.inventory.selectAllCheckbox.addEventListener('change', e =>
            document.querySelectorAll('.inventory-item-checkbox').forEach(cb => cb.checked = e.target.checked));
    }

    // Edición Modo
    const editModeToggle = document.getElementById('inventory-edit-mode-toggle');
    if (editModeToggle) {
        editModeToggle.addEventListener('change', (e) => {
            state.inventoryEditMode = e.target.checked;
            if (state.inventoryEditMode) showToast('Modo Edición ACTIVADO.', 'warning');
            else showToast('Modo Edición DESACTIVADO.', 'info');
            renderInventoryTable();
        });
    }

    // Adicionales
    if (elements.adicionales.addBtn) {
        elements.adicionales.addBtn.addEventListener('click', () => {
            // Lógica inline movida a una función o mantenerla aquí si es simple
            // Para mantener app.js limpio, idealmente mover a logic.js 'addAdditionalItemFromForm'
            // Por ahora, asumimos que copias la lógica del listener original
            if (state.readOnlyMode) return;
            if (!state.activeResguardante) return showToast('Debe activar un usuario.', 'error');
            // ... (Lógica de form data y push a state.additionalItems)
            // Ver archivo original para el bloque completo
        });
    }

    // Reportes Export
    if (elements.reports.exportXlsxBtn) elements.reports.exportXlsxBtn.addEventListener('click', exportInventoryToXLSX);
    if (elements.reports.exportLabelsXlsxBtn) elements.reports.exportLabelsXlsxBtn.addEventListener('click', exportLabelsToXLSX);

    // Reportes Botones (Delegación o loop)
    if (elements.reports.reportButtons) {
        elements.reports.reportButtons.forEach(button => {
            button.addEventListener('click', () => {
                const reportType = button.dataset.reportType;
                if (!reportType) return;
                // Lógica de enrutamiento de reportes
                // ... (Copiar lógica del switch/if de reportes del archivo original)
                // Incluyendo la llamada a openBatchPrintModal si es individual_resguardo
            });
        });
    }

    // Settings
    if (elements.settings.themes) elements.settings.themes.forEach(btn => btn.addEventListener('click', () => updateTheme(btn.dataset.theme)));
    if (elements.settings.exportSessionBtn) elements.settings.exportSessionBtn.addEventListener('click', () => exportSession(false));
    if (elements.settings.finalizeInventoryBtn) elements.settings.finalizeInventoryBtn.addEventListener('click', () => {
        showConfirmationModal('Finalizar', '¿Seguro?', () => exportSession(true));
    });

    // Import Session
    if (elements.settings.importSessionBtn) elements.settings.importSessionBtn.addEventListener('click', () => elements.settings.importFileInput.click());
    if (elements.settings.importFileInput) {
        elements.settings.importFileInput.addEventListener('change', async (e) => {
            // Lógica de importación JSZip
            // ... (Ver archivo original)
        });
    }

    // Batch Modal Listeners
    if (elements.batchModal.closeBtn) elements.batchModal.closeBtn.addEventListener('click', () => elements.batchModal.modal.classList.remove('show'));
    if (elements.batchModal.cancelBtn) elements.batchModal.cancelBtn.addEventListener('click', () => elements.batchModal.modal.classList.remove('show'));
    if (elements.batchModal.generateBtn) elements.batchModal.generateBtn.addEventListener('click', generateBatchReport);
    
    // QR Scanner Close
    if (elements.qrScannerCloseBtn) elements.qrScannerCloseBtn.addEventListener('click', stopQrScanner);

    // Start Autosave
    startAutosave();
    
    // Comparador
    const compareBtn = document.getElementById('compare-inventory-btn');
    const compareInput = document.getElementById('compare-file-input');
    if (compareBtn) {
        compareBtn.addEventListener('click', () => {
            if (state.readOnlyMode) return showToast('Modo lectura.', 'warning');
            compareInput.value = '';
            compareInput.click();
        });
    }
    if (compareInput) {
        compareInput.addEventListener('change', (e) => {
            // processComparisonFile(e.target.files[0]); // Importar si está en files.js
        });
    }

    // Reconciliation Modal Buttons
    const reconApply = document.getElementById('reconciliation-apply-btn');
    if (reconApply) {
        reconApply.addEventListener('click', () => {
            // Lógica de aplicar cambios del comparador
            // ...
        });
    }
});