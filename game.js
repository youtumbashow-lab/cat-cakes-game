(function () {
    'use strict';

    // ==== Инициализация canvas ====
    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');

    const BASE_W = 720;
    const BASE_H = 1280;

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

    // ==== Константы ====
    const GRAVITY = 0.55;
    const CAT_W = 100;
    const CAT_H = 90;
    const GROUND_Y = BASE_H - 80;

    const ITEM_TYPES = {
        cake:  { emoji: '🍰', points: 10, color: '#ff9ec4' },
        donut: { emoji: '🍩', points: 15, color: '#e8a26d' },
        cookie:{ emoji: '🍪', points: 20, color: '#c98b56' },
        bomb:  { emoji: '💣', points: -1, color: '#333' }
    };

    // ==== Состояние игры ====
    const game = {
        running: false,
        paused: false,
        score: 0,
        lives: 3,
        level: 1,
        // количество пойманных для level up
        caught: 0,
        // кадры
        frame: 0,
        spawnDelay: 60,
        fallSpeed: 3.5
    };

    // ==== Кот ====
    const cat = {
        x: BASE_W / 2 - CAT_W / 2,
        y: GROUND_Y - CAT_H,
        w: CAT_W,
        h: CAT_H,
        vx: 0,
        speed: 9,
        facing: 1, // 1 = вправо, -1 = влево
        targetX: null
    };

    // ==== Массивы ====
    let items = [];
    let particles = [];

    // ==== Управление ====
    const keys = { left: false, right: false };

    window.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = true;
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = true;
    });
    window.addEventListener('keyup', (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
    });

    // Мобильное управление — тап/свайп
    function pointerX(clientX) {
        const rect = canvas.getBoundingClientRect();
        const scale = BASE_W / rect.width;
        return (clientX - rect.left) * scale;
    }

    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        cat.targetX = pointerX(e.touches[0].clientX) - CAT_W / 2;
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        cat.targetX = pointerX(e.touches[0].clientX) - CAT_W / 2;
    }, { passive: false });
    canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        cat.targetX = null;
    }, { passive: false });

    // Мышь — плавное следование
    canvas.addEventListener('mousemove', (e) => {
        cat.targetX = pointerX(e.clientX) - CAT_W / 2;
    });
    canvas.addEventListener('mouseleave', () => {
        cat.targetX = null;
    });

    // ==== Спавн объектов ====
    function spawnItem() {
        // С вероятностью 15% — бомба (не спавним на первом уровне очень много)
        const isBomb = Math.random() < 0.15;
        let type;
        if (isBomb) {
            type = 'bomb';
        } else {
            const r = Math.random();
            if (r < 0.5) type = 'cake';
            else if (r < 0.8) type = 'donut';
            else type = 'cookie';
        }

        const size = 70;
        items.push({
            type,
            x: 40 + Math.random() * (BASE_W - 80 - size),
            y: -size,
            w: size,
            h: size,
            vy: game.fallSpeed + Math.random() * 1.5,
            rot: 0,
            rotSpeed: (Math.random() - 0.5) * 0.1
        });
    }

    // ==== Частицы ====
    function addParticles(x, y, color, count = 10) {
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

    // ==== Обновление ====
    function update() {
        if (!game.running || game.paused) return;

        game.frame++;

        // --- Кот ---
        if (cat.targetX !== null) {
            // тач/мышь — двигаемся к цели
            const dx = (cat.targetX) - cat.x;
            cat.x += dx * 0.25;
            if (Math.abs(dx) > 1) cat.facing = dx > 0 ? 1 : -1;
        } else {
            // клавиатура
            let dir = 0;
            if (keys.left) dir -= 1;
            if (keys.right) dir += 1;
            if (dir !== 0) {
                cat.facing = dir;
                cat.x += dir * cat.speed;
            }
        }
        cat.x = Math.max(0, Math.min(BASE_W - CAT_W, cat.x));

        // --- Спавн ---
        if (game.frame % game.spawnDelay === 0) {
            spawnItem();
        }

        // --- Падающие объекты ---
        for (let i = items.length - 1; i >= 0; i--) {
            const it = items[i];
            it.y += it.vy;
            it.rot += it.rotSpeed;

            // Столкновение с котом (коробка кота сверху — «рот»)
            const catBox = {
                x: cat.x + 15,
                y: cat.y + 10,
                w: cat.w - 30,
                h: cat.h - 20
            };

            if (it.x + it.w > catBox.x &&
                it.x < catBox.x + catBox.w &&
                it.y + it.h > catBox.y &&
                it.y < catBox.y + catBox.h) {

                // Поймали
                if (it.type === 'bomb') {
                    game.lives--;
                    addParticles(it.x + it.w/2, it.y + it.h/2, '#ff3b3b', 20);
                    shakeScreen();
                    if (game.lives <= 0) {
                        gameOver();
                    }
                } else {
                    const pts = ITEM_TYPES[it.type].points;
                    game.score += pts;
                    game.caught++;
                    addParticles(it.x + it.w/2, it.y + it.h/2, ITEM_TYPES[it.type].color, 12);
                    updateHUD();

                    // Level up каждые 10 пойманных
                    if (game.caught % 10 === 0) {
                        game.level++;
                        game.fallSpeed = Math.min(3.5 + game.level * 0.4, 8);
                        game.spawnDelay = Math.max(60 - game.level * 5, 25);
                        updateHUD();
                    }
                }
                items.splice(i, 1);
                continue;
            }

            // Упал на землю
            if (it.y > GROUND_Y) {
                if (it.type !== 'bomb') {
                    // пропустили пирожное — не штрафуем (казуальная игра)
                }
                items.splice(i, 1);
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

        // --- Тряска экрана ---
        if (shake.time > 0) shake.time--;
    }

    // ==== Тряска ====
    const shake = { time: 0, intensity: 10 };
    function shakeScreen() { shake.time = 15; }

    // ==== Рендер ====
    function draw() {
        ctx.save();

        // Тряска
        if (shake.time > 0) {
            const k = shake.intensity * (shake.time / 15);
            ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
        }

        // Фон — градиент
        const grad = ctx.createLinearGradient(0, 0, 0, BASE_H);
        grad.addColorStop(0, '#2a1a4e');
        grad.addColorStop(1, '#6a4a8e');
        ctx.fillStyle = grad;
        ctx.fillRect(-20, -20, BASE_W + 40, BASE_H + 40);

        // Звёзды
        drawStars();

        // Земля
        ctx.fillStyle = '#3d2a5c';
        ctx.fillRect(-20, GROUND_Y, BASE_W + 40, BASE_H - GROUND_Y + 20);
        ctx.fillStyle = '#5a3f85';
        ctx.fillRect(-20, GROUND_Y, BASE_W + 40, 8);

        // Кот
        drawCat();

        // Предметы
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

        ctx.restore();
    }

    // Звёзды (статичные, детерминированные)
    const stars = Array.from({ length: 60 }, () => ({
        x: Math.random() * BASE_W,
        y: Math.random() * (GROUND_Y - 100),
        r: Math.random() * 2 + 0.5,
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

    // Кот (рисуем стилизованно)
    function drawCat() {
        const x = cat.x;
        const y = cat.y;
        const w = cat.w;
        const h = cat.h;

        ctx.save();
        ctx.translate(x + w/2, y + h/2);
        ctx.scale(cat.facing, 1);
        ctx.translate(-w/2, -h/2);

        // Тело
        ctx.fillStyle = '#f5a623';
        ctx.beginPath();
        ctx.roundRect(10, 30, w - 20, h - 30, 15);
        ctx.fill();

        // Голова
        ctx.fillStyle = '#ffb84d';
        ctx.beginPath();
        ctx.roundRect(5, 5, w - 10, h - 40, 20);
        ctx.fill();

        // Уши
        ctx.fillStyle = '#ffb84d';
        ctx.beginPath();
        ctx.moveTo(15, 15);
        ctx.lineTo(30, -5);
        ctx.lineTo(45, 15);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(w - 45, 15);
        ctx.lineTo(w - 30, -5);
        ctx.lineTo(w - 15, 15);
        ctx.closePath();
        ctx.fill();

        // Внутренние уши
        ctx.fillStyle = '#ff8fa3';
        ctx.beginPath();
        ctx.moveTo(22, 12);
        ctx.lineTo(30, 2);
        ctx.lineTo(38, 12);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(w - 38, 12);
        ctx.lineTo(w - 30, 2);
        ctx.lineTo(w - 22, 12);
        ctx.closePath();
        ctx.fill();

        // Глаза
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(w/2 - 18, h/2 - 15, 10, 0, Math.PI * 2);
        ctx.arc(w/2 + 18, h/2 - 15, 10, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#1a1a2e';
        ctx.beginPath();
        ctx.arc(w/2 - 16, h/2 - 15, 5, 0, Math.PI * 2);
        ctx.arc(w/2 + 20, h/2 - 15, 5, 0, Math.PI * 2);
        ctx.fill();

        // Блик в глазах
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(w/2 - 18, h/2 - 17, 2, 0, Math.PI * 2);
        ctx.arc(w/2 + 18, h/2 - 17, 2, 0, Math.PI * 2);
        ctx.fill();

        // Нос
        ctx.fillStyle = '#ff6b8a';
        ctx.beginPath();
        ctx.moveTo(w/2, h/2 - 2);
        ctx.lineTo(w/2 - 5, h/2 + 5);
        ctx.lineTo(w/2 + 5, h/2 + 5);
        ctx.closePath();
        ctx.fill();

        // Усы
        ctx.strokeStyle = '#1a1a2e';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(w/2 - 20, h/2 + 5); ctx.lineTo(w/2 - 40, h/2 + 2);
        ctx.moveTo(w/2 - 20, h/2 + 8); ctx.lineTo(w/2 - 40, h/2 + 10);
        ctx.moveTo(w/2 + 20, h/2 + 5); ctx.lineTo(w/2 + 40, h/2 + 2);
        ctx.moveTo(w/2 + 20, h/2 + 8); ctx.lineTo(w/2 + 40, h/2 + 10);
        ctx.stroke();

        // Лапки
        ctx.fillStyle = '#f5a623';
        ctx.beginPath();
        ctx.ellipse(25, h - 8, 14, 10, 0, 0, Math.PI * 2);
        ctx.ellipse(w - 25, h - 8, 14, 10, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    // Падающий предмет
    function drawItem(it) {
        ctx.save();
        ctx.translate(it.x + it.w/2, it.y + it.h/2);
        ctx.rotate(it.rot);

        const emoji = ITEM_TYPES[it.type].emoji;
        ctx.font = `${it.w * 0.9}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(emoji, 0, 0);

        ctx.restore();
    }

    // Полифилл roundRect на всякий случай
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

    // ==== HUD ====
    const scoreEl = document.getElementById('score');
    const livesEl = document.getElementById('lives');
    const levelEl = document.getElementById('level');
    function updateHUD() {
        scoreEl.textContent = game.score;
        livesEl.textContent = game.lives;
        levelEl.textContent = game.level;
    }

    // ==== Overlay ====
    const overlay = document.getElementById('overlay');
    const overlayTitle = document.getElementById('overlay-title');
    const overlayText = document.getElementById('overlay-text');
    const startBtn = document.getElementById('start-btn');

    function showOverlay(title, text, btnText) {
        overlayTitle.textContent = title;
        overlayText.textContent = text;
        startBtn.textContent = btnText;
        overlay.classList.remove('hidden');
    }
    function hideOverlay() {
        overlay.classList.add('hidden');
    }

    // ==== Старт/конец игры ====
    function startGame() {
        game.running = true;
        game.score = 0;
        game.lives = 3;
        game.level = 1;
        game.caught = 0;
        game.frame = 0;
        game.spawnDelay = 60;
        game.fallSpeed = 3.5;
        items = [];
        particles = [];
        cat.x = BASE_W / 2 - CAT_W / 2;
        cat.targetX = null;
        updateHUD();
        hideOverlay();
    }

    function gameOver() {
        game.running = false;
        // сохраняем рекорд
        saveScore(game.score);
        showOverlay(
            'Игра окончена! 🐱',
            `Твой счёт: ${game.score}\nРекорд: ${getBestScore()}`,
            'Играть снова'
        );
    }

    // ==== Рекорд ====
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

    startBtn.addEventListener('click', startGame);

    // ==== Игровой цикл ====
    function loop() {
        update();
        draw();
        requestAnimationFrame(loop);
    }

    // ==== Инициализация SDK Яндекс.Игр ====
    YaGames.init().then(_sdk => {
        sdk = _sdk;
        // Сообщаем платформе, что игра загружена
        if (sdk.features && sdk.features.LoadingAPI) {
            sdk.features.LoadingAPI.ready();
        }
        showOverlay(
            '🐱 Кот ловит пирожные',
            'Двигай кота мышью, свайпом или стрелками.\nЛовкие пирожные! Не трогай 💣',
            'Играть'
        );
        loop();
    }).catch(() => {
        showOverlay(
            '🐱 Кот ловит пирожные',
            'Двигай кота мышью, свайпом или стрелками.\nЛовкие пирожные! Не трогай 💣',
            'Играть'
        );
        loop();
    });
})();
