// --- ESTADO GLOBAL Y BASE DE DATOS ---

export let state = {
    inventoryEditMode: false,
    loggedIn: false, currentUser: null, inventory: [], additionalItems: [],
    resguardantes: [], activeResguardante: null, locations: {}, areas: [], areaNames: {},
    lastAutosave: null, sessionStartTime: null, additionalPhotos: {}, locationPhotos: {},
    notes: {}, photos: {}, theme: 'light',
    inventoryFinished: false,
    areaDirectory: {},
    closedAreas: {},
    completedAreas: {}, 
    persistentAreas: [],
    serialNumberCache: new Set(),
    cameraStream: null,
    readOnlyMode: false,
    activityLog: [],
    institutionalReportCheckboxes: {},
    actionCheckboxes: { labels: {}, notes: {}, additional: {}, mismatched: {}, personal: {} },
    reportCheckboxes: { notes: {}, mismatched: {} },
    mapLayout: { 'page1': {} }, 
    currentLayoutPage: 'page1',
    layoutPageNames: { 'page1': 'Página 1' },
    layoutImages: {},
    layoutPageColors: { 'page1': '#ffffff' }, 
    layoutItemColors: {} 
};

// Función para actualizar el estado completo (útil al cargar desde localStorage)
export function setState(newState) {
    // Mantenemos las referencias de objetos clave si no vienen en el nuevo estado
    const defaultState = { 
        locationPhotos: {}, 
        activityLog: [], 
        institutionalReportCheckboxes: {},
        actionCheckboxes: { labels: {}, notes: {}, additional: {}, mismatched: {}, personal: {} },
        reportCheckboxes: { notes: {}, mismatched: {} },
        completedAreas: {},
        mapLayout: { 'page1': {} },
        currentLayoutPage: 'page1',
        layoutPageNames: { 'page1': 'Página 1' },
        layoutImages: {},
        layoutPageColors: { 'page1': '#ffffff' },
        layoutItemColors: {}
    };
    
    // Fusionar con cuidado para no perder estructura
    const mergedState = { ...defaultState, ...state, ...newState };
    
    // Asignar propiedades una a una para mantener la referencia de la variable exportada 'state'
    Object.keys(mergedState).forEach(key => {
        state[key] = mergedState[key];
    });

    // Restaurar Layout si está corrupto o vacío
    if (!state.mapLayout || !state.mapLayout.page1) {
         if (Object.keys(state.mapLayout || {}).length > 0 && !state.mapLayout.page1) {
            const oldLayout = { ...state.mapLayout };
            state.mapLayout = { 'page1': oldLayout };
            state.currentLayoutPage = 'page1';
            state.layoutPageNames = { 'page1': 'Página 1' };
        } else if (!state.mapLayout) {
            state.mapLayout = { 'page1': {} };
        }
    }
}

// Función para guardar el estado en LocalStorage
export function saveState() {
    if (state.readOnlyMode) return;

    try {
        const stateToSave = { ...state };
        // No guardamos caches temporales ni streams
        delete stateToSave.serialNumberCache;
        delete stateToSave.cameraStream;
        localStorage.setItem('inventarioProState', JSON.stringify(stateToSave));
    } catch (e) {
        console.error('Error Crítico al guardar el estado:', e);
        state.readOnlyMode = true;
        // Aquí podríamos despachar un evento personalizado si la UI necesita saberlo
        // window.dispatchEvent(new CustomEvent('storage-full'));
    }
}

// Función para cargar el estado inicial
export function loadState() {
    try {
        const storedState = localStorage.getItem('inventarioProState');
        if (storedState) {
            const loaded = JSON.parse(storedState);
            setState(loaded);
            updateSerialNumberCache();
            return true;
        }
    } catch (e) { 
        console.error('Error al cargar el estado:', e);
        // Si hay error corrupto, mejor limpiar para evitar bloqueos
        // localStorage.removeItem('inventarioProState');
    }
    return false;
}

export const verifiers = {
    '41290': 'BENÍTEZ HERNÁNDEZ MARIO',
    '41292': 'ESCAMILLA VILLEGAS BRYAN ANTONY',
    '41282': 'LÓPEZ QUINTANA ALDO',
    '41287': 'MARIN ESPINOSA MIGUEL',
    '41289': 'SANCHEZ ARELLANES RICARDO',
    '41293': 'EDSON OSNAR TORRES JIMENEZ',
    '15990': 'CHÁVEZ SÁNCHEZ ALFONSO',
    '17326': 'DOMÍNGUEZ VAZQUEZ FRANCISCO JAVIER',
    '11885': 'ESTRADA HERNÁNDEZ ROBERTO',
    '19328': 'LÓPEZ ESTRADA LEOPOLDO',
    '44925': 'MENDOZA SOLARES JOSE JUAN',
    '16990': 'PÉREZ RODRÍGUEZ DANIEL',
    '16000': 'PÉREZ YAÑEZ JUAN JOSE',
    '17812': 'RODRÍGUEZ RAMÍREZ RENE',
    '44095': 'LOPEZ JIMENEZ ALAN GABRIEL',
    '2875': 'VIZCAINO ROJAS ALVARO'
};

// --- INDEXED DB WRAPPER (Para Fotos) ---
export const photoDB = {
    db: null,
    init: function() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('InventarioProPhotosDB', 2); 
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos');
                if (!db.objectStoreNames.contains('layoutImages')) db.createObjectStore('layoutImages');
            };
            request.onsuccess = (event) => { this.db = event.target.result; resolve(); };
            request.onerror = (event) => { console.error('Error con IndexedDB:', event.target.errorCode); reject(event.target.errorCode); };
        });
    },
    setItem: function(storeName, key, value) {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject('DB not initialized');
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(value, key);
            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });
    },
    getItem: function(storeName, key) {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject('DB not initialized');
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => reject(event.target.error);
        });
    },
    deleteItem: function(storeName, key) {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject('DB not initialized');
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);
            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });
    },
    getAllItems: function(storeName) {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject('DB not initialized');
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const keysRequest = store.getAllKeys();
            const valuesRequest = store.getAll();

            Promise.all([
                new Promise((res, rej) => { keysRequest.onsuccess = () => res(keysRequest.result); keysRequest.onerror = (e) => rej(e.target.error); }),
                new Promise((res, rej) => { valuesRequest.onsuccess = () => res(valuesRequest.result); valuesRequest.onerror = (e) => rej(e.target.error); })
            ]).then(([keys, values]) => {
                const result = keys.map((key, index) => ({ key, value: values[index] }));
                resolve(result);
            }).catch(reject);
        });
    }
};

export function deleteDB(dbName) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(dbName);
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
        request.onblocked = () => { console.warn('La eliminación de IndexedDB fue bloqueada.'); resolve(); };
    });
}

// --- HELPERS GENERALES ---

export function generateUUID() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

export function escapeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function getLocalDate() {
    const date = new Date();
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0'); 
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

export function logActivity(action, details = '') {
    const timestamp = new Date().toLocaleString('es-MX');
    const logEntry = `[${timestamp}] ${action}: ${details}`;
    state.activityLog.push(logEntry);
    // Optimización: mantener solo últimos 500 logs
    if (state.activityLog.length > 500) state.activityLog = state.activityLog.slice(-500); 
}

export function updateSerialNumberCache() {
    state.serialNumberCache.clear();
    state.inventory.forEach(item => {
        if (item.SERIE) state.serialNumberCache.add(String(item.SERIE).trim().toLowerCase());
        if (item['CLAVE UNICA']) state.serialNumberCache.add(String(item['CLAVE UNICA']).trim().toLowerCase());
    });
    state.additionalItems.forEach(item => {
        if (item.serie) state.serialNumberCache.add(String(item.serie).trim().toLowerCase());
        if (item.clave) state.serialNumberCache.add(String(item.clave).trim().toLowerCase());
    });
}

// --- ESTADO DE PAGINACIÓN (Compartido) ---
export let currentPage = 1;
export const itemsPerPage = 50;
export let filteredItems = [];

export function setFilteredItems(items) { filteredItems = items; }
export function setCurrentPage(page) { currentPage = page; }