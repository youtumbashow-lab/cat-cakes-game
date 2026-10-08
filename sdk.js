// Заглушка для локальной разработки.
// На Яндекс.Играх этот файл будет перезаписан настоящим SDK.
window.YaGames = {
    init: () => Promise.resolve({
        getPlayer: () => Promise.resolve({ getName: () => '', getMode: () => 'lite' }),
        getStorage: () => Promise.resolve({
            setItem: (k, v) => { try { localStorage.setItem(k, v); } catch(e){} },
            getItem: (k) => { try { return localStorage.getItem(k); } catch(e){ return null; } }
        }),
        features: { LoadingAPI: { ready: () => {} } }
    })
};
