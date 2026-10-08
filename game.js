(function () {
    'use strict';

    // ===== Canvas =====
    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');

    const BASE_W = 1280;
    const BASE_H = 720;

    function resize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const scale = Math.min(w / BASE_W, h / BASE_H);
        canvas.width = BASE_W;
        canvas.height = BASE_H;
        canvas.style.width = (BASE_W * scale) + 'px';
        canvas.style.height = (BASE_H * scale) + 'px';
    }
    window.addEventListener('resize', resize);
    resize();

    // ===== Константы =====
    const GROUND_Y = BASE_H - 60;
    const CAT_W = 130;
    const CAT_H = 110;
    const BASKET_W = 90;
    const BASKET_H = 60;
    const ITEM_SIZE = 54;
    const CAT_SPEED = 9;

    // 4 жёлоба: 2 слева, 2 справа.
    // У каждого — верхняя точка (topX, topY) и нижняя точка (bottomX, bottomY),
    // по которой катится пирожное и куда кот подставляет корзину.
    const CHUTES = [
        // Левая пара — наклонены вправо-вниз (внутрь)
        { topX: 120, topY: 40,  bottomX: 320, bottomY: GROUND_Y },
        { topX: 380, topY: 40,  bottomX: 500, bottomY: GROUND_Y },
        // Правая пара — наклонены влево-вниз (внутрь)
        { topX: 780, topY: 40,  bottomX: 900, bottomY: GROUND_Y },
        { topX: 1160, topY: 40, bottomX: 960, bottomY: GROUND_Y }
    ];

    const ITEM_TYPES = {
        cake:   { emoji: '🍰', points: 10, color: '#ff9ec4' },
        donut:  { emoji: '🍩', points: 15, color: '#e8a26d' },
        cookie: { emoji: '🍪', points: 20, color: '#c98b56' },
        bomb:   { emoji: '💣', points: -1, color: '#333' }
    };

    // ===== Состояние игры =====
    const game = {
        running: false,
        paused: false,
        score: 0,
        lives: 3,
        missed: 0,
        frame: 0,
        spawnDelay: 70,      // кадров между спавнами
        fallSpeed: 3.0,      // пикселей за кадр
        caught: 0
    };

    // ===== Кот =====
    const cat = {
        x: BASE_W / 2 - CAT_W / 2,  // позиция корзины слева
        y: GROUND_Y - CAT_H,
        w: CAT_W,
        h: CAT_H,
        vx: 0,
        targetX: null
    };

    // ===== Массивы =====
    let items = [];      // падающие пирожные
    let particles = [];
    let splats = [];     // "кляксы" от пропущенных пирожных

    // ===== Управление =====
    const keys = { left: false, right: false };

    window.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A' || e.key === 'ф' || e.key === 'Ф') keys.left = true;
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D' || e.key === 'в' || e.key === 'В') keys.right = true;
        if (e.key === 'p' || e.key === 'P' || e.key === 'Escape' || e.key === 'з' || e.key === 'З') {
            togglePause();
        }
    });
    window.addEventListener('keyup', (e) => {
        if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A' || e.key === 'ф' || e.key === 'Ф') keys.left = false;
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D' || e.key === 'в' || e.key === 'В') keys.right = false;
    });

    // Тач: палец двигает кота
    function canvasX(clientX) {
        const rect = canvas.getBoundingClientRect();
        const scale = BASE_W / rect.width;
        return (clientX - rect.left) * scale;
    }

    canvas.addEventListener('touchstart', (e) => {
        if (!game.running || game.paused) return;
        e.preventDefault();
        cat.targetX = canvasX(e.touches[0].clientX) - CAT_W / 2;
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
        if (!game.running || game.paused) return;
        e.preventDefault();
        cat.targetX = canvasX(e.touches[0].clientX) - CAT_W / 2;
    }, { passive: false });
    canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        cat.targetX = null;
    }, { passive: false });

    // Мышь: двигаем к цели
    canvas.addEventListener('mousemove', (e) => {
        if (!game.running || game.paused) return;
        cat.targetX = canvasX(e.clientX) - CAT_W / 2;
    });
    canvas.addEventListener('mouseleave', () => {
        cat.targetX = null;
    });

    // ===== Спавн =====
    function spawnItem() {
        const chuteIdx = Math.floor(Math.random() * CHUTES.length);
        const chute = CHUTES[chuteIdx];

        const isBomb = Math.random() < 0.15;
        let type;
        if (isBomb) type = 'bomb';
        else {
            const r = Math.random();
            if (r < 0.5) type = 'cake';
            else if (r < 0.8) type = 'donut';
            else type = 'cookie';
        }

        items.push({
            chuteIdx,
            t: 0, // параметр вдоль жёлоба 0..1
            type,
            rot: 0,
            rotSpeed: (Math.random() - 0.5) * 0.15,
            speed: (game.fallSpeed + Math.random() * 0.6) / 1000 // доля t за кадр
        });
    }

    // ===== Частицы =====
    function addParticles(x, y, color, count = 12) {
        for (let i = 0; i < count; i++) {
            particles.push({
                x, y,
                vx: (Math.random() - 0.5) * 8,
                vy: (Math.random() - 0.5) * 8 - 2,
                life: 30,
                maxLife: 30,
                color,
                size: 3 + Math.random() * 5
            });
        }
    }

    // ===== Позиция на жёлобе =====
    function chutePos(chute, t) {
        return {
            x: chute.topX + (chute.bottomX - chute.topX) * t,
            y: chute.topY + (chute.bottomY - chute.topY) * t
        };
    }

    // ===== Обновление =====
    function update() {
        if (!game.running || game.paused) return;
        game.frame++;

        // --- Кот ---
        if (cat.targetX !== null) {
            const dx = cat.targetX - cat.x;
            cat.x += dx * 0.28;
        } else {
            let dir = 0;
            if (keys.left) dir -= 1;
            if (keys.right) dir += 1;
            cat.x += dir * CAT_SPEED;
        }
        cat.x = Math.max(0, Math.min(BASE_W - CAT_W, cat.x));

        // --- Спавн ---
        if (game.frame % Math.max(20, Math.floor(game.spawnDelay)) === 0) {
            spawnItem();
        }

        // --- Пирожные ---
        for (let i = items.length - 1; i >= 0; i--) {
            const it = items[i];
            it.t += it.speed;
            it.rot += it.rotSpeed;

            const chute = CHUTES[it.chuteIdx];
            const pos = chutePos(chute, Math.min(it.t, 1));

            // Кот «ловит», если корзина под этим жёлобом в момент, когда
            // пирожное пересекло нижнюю точку
            if (it.t >= 1) {
                // определить, поймал ли кот
                const catCx = cat.x + cat.w / 2;
                const dist = Math.abs(catCx - chute.bottomX);
                const caught = dist < BASKET_W * 0.9;

                if (caught) {
                    if (it.type === 'bomb') {
                        game.lives--;
                        addParticles(chute.bottomX, chute.bottomY, '#ff3b3b', 22);
                        shakeScreen();
                        if (game.lives <= 0) { gameOver(); }
                    } else {
                        const pts = ITEM_TYPES[it.type].points;
                        game.score += pts;
                        game.caught++;
                        addParticles(chute.bottomX, chute.bottomY, ITEM_TYPES[it.type].color, 12);
                        // ускорение по мере игры
                        if (game.caught % 8 === 0) {
                            game.fallSpeed = Math.min(game.fallSpeed + 0.25, 8);
                            game.spawnDelay = Math.max(game.spawnDelay - 5, 30);
                        }
                    }
                } else {
                    // пропустили
                    if (it.type !== 'bomb') {
                        game.missed++;
                        splats.push({ x: chute.bottomX, y: chute.bottomY, life: 120, color: ITEM_TYPES[it.type].color });
                    }
                }
                items.splice(i, 1);
                updateHUD();
                continue;
            }
        }

        // --- Частицы ---
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.3;
            p.life--;
            if (p.life <= 0) particles.splice(i, 1);
        }

        // --- Кляксы ---
        for (let i = splats.length - 1; i >= 0; i--) {
            splats[i].life--;
            if (splats[i].life <= 0) splats.splice(i, 1);
        }

        if (shake.time > 0) shake.time--;
    }

    // ===== Тряска экрана =====
    const shake = { time: 0, intensity: 12 };
    function shakeScreen() { shake.time = 15; }

    // ===== Рендер =====
    function draw() {
        ctx.save();
        if (shake.time > 0) {
            const k = shake.intensity * (shake.time / 15);
            ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
        }

        // Фон
        const grad = ctx.createLinearGradient(0, 0, 0, BASE_H);
        grad.addColorStop(0, '#1a1230');
        grad.addColorStop(1, '#2d1b4e');
        ctx.fillStyle = grad;
        ctx.fillRect(-30, -30, BASE_W + 60, BASE_H + 60);

        // Звёзды
        drawStars();

        // Жёлоба
        CHUTES.forEach(drawChute);

        // Кляксы
        splats.forEach(s => {
            ctx.globalAlpha = Math.min(1, s.life / 60) * 0.6;
            ctx.fillStyle = s.color;
            ctx.beginPath();
            ctx.ellipse(s.x, s.y + 10, 30, 10, 0, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.globalAlpha = 1;

        // Кот
        drawCat();

        // Пирожные
        items.forEach(drawItem);

        // Частицы
        particles.forEach(p => {
            ctx.globalAlpha = p.life / p.maxLife;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.globalAlpha = 1;

        // Затемнение при паузе
        if (game.paused) {
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(0, 0, BASE_W, BASE_H);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 64px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('⏸ ПАУЗА', BASE_W / 2, BASE_H / 2);
        }

        ctx.restore();
    }

    // ===== Звёзды =====
    const stars = Array.from({ length: 80 }, () => ({
        x: Math.random() * BASE_W,
        y: Math.random() * (GROUND_Y - 100),
        r: Math.random() * 1.8 + 0.4,
        a: Math.random() * 0.7 + 0.3,
        tw: Math.random() * Math.PI * 2
    }));

    function drawStars() {
        const t = game.frame * 0.03;
        stars.forEach(s => {
            ctx.globalAlpha = s.a * (0.6 + 0.4 * Math.sin(t + s.tw));
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.globalAlpha = 1;
    }

    // ===== Жёлоб =====
    function drawChute(chute) {
        const dx = chute.bottomX - chute.topX;
        const dy = chute.bottomY - chute.topY;
        const len = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);

        ctx.save();
        ctx.translate(chute.topX, chute.topY);
        ctx.rotate(angle);

        // Тело жёлоба
        ctx.fillStyle = '#4a3568';
        ctx.strokeStyle = '#7a5ea0';
        ctx.lineWidth = 4;

        // Внешняя «труба»
        ctx.beginPath();
        ctx.rect(0, -26, len, 52);
        ctx.fill();
        ctx.stroke();

        // Внутренняя дорожка
        ctx.fillStyle = '#2a1b44';
        ctx.fillRect(0, -18, len, 36);

        // «Перила» — рёбра
        ctx.strokeStyle = '#8a6cb0';
        ctx.lineWidth = 2;
        const steps = 14;
        for (let i = 1; i < steps; i++) {
            const x = (len / steps) * i;
            ctx.beginPath();
            ctx.moveTo(x, -22);
            ctx.lineTo(x, -14);
            ctx.moveTo(x, 14);
            ctx.lineTo(x, 22);
            ctx.stroke();
        }

        ctx.restore();

        // Подставка под нижний край
        ctx.fillStyle = '#3d2a5c';
        ctx.beginPath();
        ctx.ellipse(chute.bottomX, chute.bottomY + 6, 44, 12, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // ===== Кот =====
    function drawCat() {
        const x = cat.x;
        const y = cat.y;
        const w = cat.w;
        const h = cat.h;

        // Корзина под котом
        const bx = x + w / 2 - BASKET_W / 2;
        const by = y + h - 10;

        // Тело
        ctx.fillStyle = '#f5a623';
        ctx.beginPath();
        ctx.roundRect(x + 15, y + 30, w - 30, h - 30, 18);
        ctx.fill();

        // Голова
        ctx.fillStyle = '#ffb84d';
        ctx.beginPath();
        ctx.roundRect(x + 10, y + 5, w - 20, h - 40, 22);
        ctx.fill();

        // Уши
        ctx.fillStyle = '#ffb84d';
        ctx.beginPath();
        ctx.moveTo(x + 20, y + 15);
        ctx.lineTo(x + 38, y - 8);
        ctx.lineTo(x + 55, y + 15);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x + w - 55, y + 15);
        ctx.lineTo(x + w - 38, y - 8);
        ctx.lineTo(x + w - 20, y + 15);
        ctx.closePath();
        ctx.fill();

        // Внутренние уши
        ctx.fillStyle = '#ff8fa3';
        ctx.beginPath();
        ctx.moveTo(x + 28, y + 12);
        ctx.lineTo(x + 38, y + 2);
        ctx.lineTo(x + 48, y + 12);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x + w - 48, y + 12);
        ctx.lineTo(x + w - 38, y + 2);
        ctx.lineTo(x + w - 28, y + 12);
        ctx.closePath();
        ctx.fill();

        // Глаза
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(x + w/2 - 22, y + h/2 - 18, 11, 0, Math.PI * 2);
        ctx.arc(x + w/2 + 22, y + h/2 - 18, 11, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#1a1a2e';
        ctx.beginPath();
        ctx.arc(x + w/2 - 20, y + h/2 - 18, 5.5, 0, Math.PI * 2);
        ctx.arc(x + w/2 + 24, y + h/2 - 18, 5.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(x + w/2 - 22, y + h/2 - 20, 2, 0, Math.PI * 2);
        ctx.arc(x + w/2 + 22, y + h/2 - 20, 2, 0, Math.PI * 2);
        ctx.fill();

        // Нос
        ctx.fillStyle = '#ff6b8a';
        ctx.beginPath();
        ctx.moveTo(x + w/2, y + h/2 - 4);
        ctx.lineTo(x + w/2 - 6, y + h/2 + 4);
        ctx.lineTo(x + w/2 + 6, y + h/2 + 4);
        ctx.closePath();
        ctx.fill();

        // Усы
        ctx.strokeStyle = '#1a1a2e';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x + w/2 - 26, y + h/2 + 4); ctx.lineTo(x + w/2 - 50, y + h/2);
        ctx.moveTo(x + w/2 - 26, y + h/2 + 8); ctx.lineTo(x + w/2 - 50, y + h/2 + 12);
        ctx.moveTo(x + w/2 + 26, y + h/2 + 4); ctx.lineTo(x + w/2 + 50, y + h/2);
        ctx.moveTo(x + w/2 + 26, y + h/2 + 8); ctx.lineTo(x + w/2 + 50, y + h/2 + 12);
        ctx.stroke();

        // Корзина (перед котом)
        ctx.fillStyle = '#b5762a';
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + BASKET_W, by);
        ctx.lineTo(bx + BASKET_W - 12, by + BASKET_H);
        ctx.lineTo(bx + 12, by + BASKET_H);
        ctx.closePath();
        ctx.fill();

        // Обод корзины
        ctx.fillStyle = '#d89346';
        ctx.fillRect(bx - 3, by - 6, BASKET_W + 6, 10);

        // Плетение
        ctx.strokeStyle = '#8a5a1f';
        ctx.lineWidth = 2;
        for (let i = 1; i < 4; i++) {
            const yy = by + (BASKET_H / 4) * i;
            ctx.beginPath();
            ctx.moveTo(bx + 4, yy);
            ctx.lineTo(bx + BASKET_W - 4, yy);
            ctx.stroke();
        }
    }

    // ===== Пирожное =====
    function drawItem(it) {
        const chute = CHUTES[it.chuteIdx];
        const pos = chutePos(chute, Math.min(it.t, 1));

        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(it.rot);

        // Тень
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(0, ITEM_SIZE * 0.55, ITEM_SIZE * 0.4, ITEM_SIZE * 0.15, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Эмодзи
        ctx.font = `${ITEM_SIZE}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(ITEM_TYPES[it.type].emoji, 0, 0);

        ctx.restore();
    }

    // roundRect polyfill
    if (!CanvasRenderingContext2D.prototype.roundRect) {
        CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
            if (typeof r === 'number') r = [r, r, r, r];
            this.beginPath();
            this.moveTo(x + r[0], y);
            this.arcTo(x + w, y, x + w, y + h, r[1]);
            this.arcTo(x + w, y + h, x, y + h, r[2]);
            this.arcTo(x, y + h, x, y, r[3]);
            this.arcTo(x, y, x + w, y, r[0]);
            this.closePath();
            return this;
        };
    }

    // ===== HUD =====
    const scoreEl = document.getElementById('score');
    const livesEl = document.getElementById('lives');
    const missedEl = document.getElementById('missed');
    function updateHUD() {
        scoreEl.textContent = game.score;
        livesEl.textContent = game.lives;
        missedEl.textContent = game.missed;
    }

    // ===== Overlay =====
    const overlay = document.getElementById('overlay');
    const overlayTitle = document.getElementById('overlay-title');
    const overlayText = document.getElementById('overlay-text');
    const startBtn = document.getElementById('start-btn');
    const pauseBtn = document.getElementById('pause-btn');

    function showOverlay(title, text, btnText, showHint = true) {
        overlayTitle.textContent = title;
        overlayText.textContent = text;
        startBtn.textContent = btnText;
        overlay.classList.remove('hidden');
    }
    function hideOverlay() {
        overlay.classList.add('hidden');
    }

    // ===== Старт/конец =====
    function startGame() {
        game.running = true;
        game.paused = false;
        game.score = 0;
        game.lives = 3;
        game.missed = 0;
        game.frame = 0;
        game.spawnDelay = 70;
        game.fallSpeed = 3.0;
        game.caught = 0;
        items = [];
        particles = [];
        splats = [];
        cat.x = BASE_W / 2 - CAT_W / 2;
        cat.targetX = null;
        updateHUD();
        hideOverlay();
        pauseBtn.textContent = '⏸';
    }

    function gameOver() {
        game.running = false;
        saveScore(game.score);
        showOverlay(
            'Игра окончена! 🐱',
            `Счёт: ${game.score}\nПропущено: ${game.missed}\nРекорд: ${getBestScore()}`,
            'Играть снова'
        );
    }

    function togglePause() {
        if (!game.running) return;
        game.paused = !game.paused;
        pauseBtn.textContent = game.paused ? '▶' : '⏸';
    }

    // ===== Рекорд =====
    let sdk = null;
    function saveScore(score) {
        try {
            if (sdk && sdk.getStorage) {
                sdk.getStorage().then(storage => {
                    const best = parseInt(storage.getItem('best') || '0', 10);
                    if (score > best) storage.setItem('best', String(score));
                }).catch(() => {
                    const best = parseInt(localStorage.getItem('best') || '0', 10);
                    if (score > best) localStorage.setItem('best', String(score));
                });
            } else {
                const best = parseInt(localStorage.getItem('best') || '0', 10);
                if (score > best) localStorage.setItem('best', String(score));
            }
        } catch (e) {}
    }
    function getBestScore() {
        try { return localStorage.getItem('best') || '0'; } catch (e) { return '0'; }
    }

    // ===== Кнопки =====
    startBtn.addEventListener('click', startGame);
    pauseBtn.addEventListener('click', togglePause);
    pauseBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        togglePause();
    }, { passive: false });

    // ===== Игровой цикл =====
    function loop() {
        update();
        draw();
        requestAnimationFrame(loop);
    }

    // ===== Старт =====
    YaGames.init().then(_sdk => {
        sdk = _sdk;
        if (sdk.features && sdk.features.LoadingAPI) {
            sdk.features.LoadingAPI.ready();
        }
        showOverlay(
            '🐱 Кот ловит пирожные',
            'Пирожные катятся по желобам!\nПодставляй корзину под нужный жёлоб.',
            'Играть'
        );
        loop();
    }).catch(() => {
        showOverlay(
            '🐱 Кот ловит пирожные',
            'Пирожные катятся по желобам!\nПодставляй корзину под нужный жёлоб.',
            'Играть'
        );
        loop();
    });
})();
