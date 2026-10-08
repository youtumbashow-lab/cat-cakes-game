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
    const CAT_CX = BASE_W / 2;     // центр кота по X
    const CAT_CY = BASE_H - 130;   // центр кота по Y (низ экрана)
    const CAT_R  = 130;            // радиус (условный) тела кота
    const ITEM_SIZE = 54;

    // 4 жёлоба. Пирожные стартуют сверху и катятся к коту.
    // Каждый жёлоб задан двумя точками: top (старт) и end (конец, у кота).
    // 4 точки сбора вокруг кота:
    //   slot 0 = кот смотрит ВЛЕВО, корзина ВВЕРХУ  → end слева-сверху от кота
    //   slot 1 = кот смотрит ВЛЕВО, корзина ВНИЗУ   → end слева-снизу
    //   slot 2 = кот смотрит ВПРАВО, корзина ВВЕРХУ → end справа-сверху
    //   slot 3 = кот смотрит ВПРАВО, корзина ВНИЗУ  → end справа-снизу
    const SLOT_OFFSET = {
        pos: { x: 110, y: 90 },     // насколько от центра кота отстоит точка сбора
        upperY: -70,
        lowerY: +70
    };

    // Точки сбора пирожных (куда должна попасть корзина)
    const COLLECT_POINTS = [
        // slot 0: лево-верх
        { x: CAT_CX - SLOT_OFFSET.pos.x, y: CAT_CY - SLOT_OFFSET.pos.y },
        // slot 1: лево-низ
        { x: CAT_CX - SLOT_OFFSET.pos.x, y: CAT_CY - SLOT_OFFSET.pos.y + 170 },
        // slot 2: право-верх
        { x: CAT_CX + SLOT_OFFSET.pos.x, y: CAT_CY - SLOT_OFFSET.pos.y },
        // slot 3: право-низ
        { x: CAT_CX + SLOT_OFFSET.pos.x, y: CAT_CY - SLOT_OFFSET.pos.y + 170 }
    ];

    // 4 жёлоба: каждый ведёт от верхнего угла экрана к точке сбора.
    // Как в оригинале — 2 верхних идут с верхних углов, 2 нижних с боков.
    const CHUTES = [
        // slot 0 — лево-верхний (старт в верхнем левом углу)
        { slot: 0, topX: 60,  topY: -40, bottomX: COLLECT_POINTS[0].x, bottomY: COLLECT_POINTS[0].y - 30 },
        // slot 1 — лево-нижний (старт чуть ниже, с боку)
        { slot: 1, topX: -40, topY: 200, bottomX: COLLECT_POINTS[1].x, bottomY: COLLECT_POINTS[1].y - 30 },
        // slot 2 — право-верхний
        { slot: 2, topX: BASE_W - 60, topY: -40, bottomX: COLLECT_POINTS[2].x, bottomY: COLLECT_POINTS[2].y - 30 },
        // slot 3 — право-нижний
        { slot: 3, topX: BASE_W + 40, topY: 200, bottomX: COLLECT_POINTS[3].x, bottomY: COLLECT_POINTS[3].y - 30 }
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
        spawnDelay: 65,
        fallSpeed: 0.006,   // приращение t за кадр
        caught: 0
    };

    // ===== Кот: 4 позы =====
    // pose: 0 = смотрит влево, корзина вверху
    //       1 = смотрит влево, корзина внизу
    //       2 = смотрит вправо, корзина вверху
    //       3 = смотрит вправо, корзина внизу
    const cat = {
        pose: 0
    };

    // ===== Массивы =====
    let items = [];
    let particles = [];
    let splats = [];

    // ===== Управление =====
    function setPose(p) {
        if (p < 0 || p > 3) return;
        cat.pose = p;
    }

    window.addEventListener('keydown', (e) => {
        // Пауза
        if (e.key === 'p' || e.key === 'P' || e.key === 'Escape' || e.key === 'з' || e.key === 'З') {
            togglePause();
            return;
        }
        // Управление позами
        if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A' || e.key === 'ф' || e.key === 'Ф') {
            // влево: если уже смотрим влево — переключить верх/низ, иначе повернуть влево (в ту же позу верх/низ)
            if (cat.pose === 0 || cat.pose === 1) setPose(cat.pose === 0 ? 1 : 0);
            else setPose(cat.pose === 2 ? 0 : 1);
        }
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D' || e.key === 'в' || e.key === 'В') {
            if (cat.pose === 2 || cat.pose === 3) setPose(cat.pose === 2 ? 3 : 2);
            else setPose(cat.pose === 0 ? 2 : 3);
        }
        if (e.key === 'ArrowUp') {
            if (cat.pose === 0 || cat.pose === 2) return; // уже верх
            setPose(cat.pose === 1 ? 0 : 2);
        }
        if (e.key === 'ArrowDown') {
            if (cat.pose === 1 || cat.pose === 3) return; // уже низ
            setPose(cat.pose === 0 ? 1 : 3);
        }
    });

    // Мышка: по позиции курсора выбираем, к какой точке сбора кот поворачивается.
    // Правило: если курсор выше центра — поза "верх", ниже — "низ".
    // Если курсор левее центра — смотрит влево, правее — вправо.
    function canvasPos(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        const sx = BASE_W / rect.width;
        const sy = BASE_H / rect.height;
        return {
            x: (clientX - rect.left) * sx,
            y: (clientY - rect.top) * sy
        };
    }

    function poseFromPoint(px, py) {
        const leftSide = px < CAT_CX;
        const upper = py < CAT_CY - 40;
        if (leftSide && upper) return 0;        // лево-верх
        if (leftSide && !upper) return 1;       // лево-низ
        if (!leftSide && upper) return 2;       // право-верх
        return 3;                               // право-низ
    }

    canvas.addEventListener('mousemove', (e) => {
        if (!game.running || game.paused) return;
        const p = canvasPos(e.clientX, e.clientY);
        setPose(poseFromPoint(p.x, p.y));
    });

    // Тач: то же, что мышь
    canvas.addEventListener('touchstart', (e) => {
        if (!game.running || game.paused) return;
        e.preventDefault();
        const t = e.touches[0];
        const p = canvasPos(t.clientX, t.clientY);
        setPose(poseFromPoint(p.x, p.y));
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
        if (!game.running || game.paused) return;
        e.preventDefault();
        const t = e.touches[0];
        const p = canvasPos(t.clientX, t.clientY);
        setPose(poseFromPoint(p.x, p.y));
    }, { passive: false });

    // ===== Спавн =====
    function spawnItem() {
        const slot = Math.floor(Math.random() * 4);

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
            slot,
            t: 0,
            type,
            rot: 0,
            rotSpeed: (Math.random() - 0.5) * 0.15,
            speed: game.fallSpeed + Math.random() * 0.001
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

        // Спавн
        if (game.frame % Math.max(20, Math.floor(game.spawnDelay)) === 0) {
            spawnItem();
        }

        // Пирожные
        for (let i = items.length - 1; i >= 0; i--) {
            const it = items[i];
            it.t += it.speed;
            it.rot += it.rotSpeed;

            const chute = CHUTES[it.slot];
            const pos = chutePos(chute, Math.min(it.t, 1));

            if (it.t >= 1) {
                // Пирожное достигло точки сбора.
                // Проверяем — а кот ли в этой позе?
                const caught = (cat.pose === it.slot);

                if (caught) {
                    if (it.type === 'bomb') {
                        game.lives--;
                        addParticles(pos.x, pos.y, '#ff3b3b', 22);
                        shakeScreen();
                        if (game.lives <= 0) { gameOver(); }
                    } else {
                        const pts = ITEM_TYPES[it.type].points;
                        game.score += pts;
                        game.caught++;
                        addParticles(pos.x, pos.y, ITEM_TYPES[it.type].color, 12);
                        if (game.caught % 8 === 0) {
                            game.fallSpeed = Math.min(game.fallSpeed + 0.0006, 0.02);
                            game.spawnDelay = Math.max(game.spawnDelay - 4, 28);
                        }
                    }
                } else {
                    if (it.type !== 'bomb') {
                        game.missed++;
                        splats.push({ x: pos.x, y: pos.y, life: 120, color: ITEM_TYPES[it.type].color });
                    }
                }
                items.splice(i, 1);
                updateHUD();
                continue;
            }
        }

        // Частицы
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.3;
            p.life--;
            if (p.life <= 0) particles.splice(i, 1);
        }

        // Кляксы
        for (let i = splats.length - 1; i >= 0; i--) {
            splats[i].life--;
            if (splats[i].life <= 0) splats.splice(i, 1);
        }

        if (shake.time > 0) shake.time--;
    }

    // ===== Тряска =====
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

        drawStars();

        // Жёлоба
        CHUTES.forEach(drawChute);

        // Кляксы
        splats.forEach(s => {
            ctx.globalAlpha = Math.min(1, s.life / 60) * 0.6;
            ctx.fillStyle = s.color;
            ctx.beginPath();
            ctx.ellipse(s.x, s.y, 30, 10, 0, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.globalAlpha = 1;

        // Кот (в центре)
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

        // Пауза
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
        y: Math.random() * (BASE_H - 150),
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

        // Корпус жёлоба
        ctx.fillStyle = '#4a3568';
        ctx.strokeStyle = '#7a5ea0';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.rect(0, -26, len, 52);
        ctx.fill();
        ctx.stroke();

        // Внутренняя дорожка
        ctx.fillStyle = '#2a1b44';
        ctx.fillRect(0, -18, len, 36);

        // Рёбра
        ctx.strokeStyle = '#8a6cb0';
        ctx.lineWidth = 2;
        const steps = 16;
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
    }

    // ===== Кот =====
    function drawCat() {
        const pose = cat.pose;
        const lookLeft = (pose === 0 || pose === 1);
        const basketUp = (pose === 0 || pose === 2);

        // Базовые размеры
        const bodyW = 120;
        const bodyH = 130;
        const headW = 110;
        const headH = 100;

        // Точка сбора — куда кот «тянется» корзиной
        const target = COLLECT_POINTS[pose];

        ctx.save();
        ctx.translate(CAT_CX, CAT_CY);

        // ===== Корзина =====
        // Корзина висит со стороны взгляда, на высоте вверх или вниз
        const basketX = lookLeft ? -bodyW * 0.9 : bodyW * 0.9;
        const basketY = basketUp ? -bodyH * 0.5 : bodyH * 0.4;

        // Лапы, тянущиеся к корзине
        ctx.strokeStyle = '#f5a623';
        ctx.lineWidth = 16;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(lookLeft ? -bodyW * 0.5 : bodyW * 0.5, basketUp ? -bodyH * 0.15 : bodyH * 0.15);
        ctx.lineTo(basketX * 0.7, basketY * 0.7);
        ctx.stroke();

        // ===== Тело =====
        ctx.fillStyle = '#f5a623';
        ctx.beginPath();
        ctx.roundRect(-bodyW / 2, -bodyH * 0.15, bodyW, bodyH * 0.9, 24);
        ctx.fill();

        // Полоски на теле
        ctx.strokeStyle = '#d4871a';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(-bodyW * 0.3, bodyH * 0.1);
        ctx.lineTo(-bodyW * 0.15, bodyH * 0.5);
        ctx.moveTo(bodyW * 0.3, bodyH * 0.1);
        ctx.lineTo(bodyW * 0.15, bodyH * 0.5);
        ctx.stroke();

        // ===== Голова =====
        ctx.save();
        ctx.translate(lookLeft ? -10 : 10, -bodyH * 0.55);
        ctx.scale(lookLeft ? -1 : 1, 1);

        // Морда
        ctx.fillStyle = '#ffb84d';
        ctx.beginPath();
        ctx.roundRect(-headW / 2, -headH / 2, headW, headH, 26);
        ctx.fill();

        // Уши
        ctx.fillStyle = '#ffb84d';
        ctx.beginPath();
        ctx.moveTo(-headW * 0.4, -headH * 0.35);
        ctx.lineTo(-headW * 0.25, -headH * 0.7);
        ctx.lineTo(-headW * 0.05, -headH * 0.35);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(headW * 0.4, -headH * 0.35);
        ctx.lineTo(headW * 0.25, -headH * 0.7);
        ctx.lineTo(headW * 0.05, -headH * 0.35);
        ctx.closePath();
        ctx.fill();

        // Внутренние уши
        ctx.fillStyle = '#ff8fa3';
        ctx.beginPath();
        ctx.moveTo(-headW * 0.33, -headH * 0.38);
        ctx.lineTo(-headW * 0.25, -headH * 0.6);
        ctx.lineTo(-headW * 0.15, -headH * 0.38);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(headW * 0.33, -headH * 0.38);
        ctx.lineTo(headW * 0.25, -headH * 0.6);
        ctx.lineTo(headW * 0.15, -headH * 0.38);
        ctx.closePath();
        ctx.fill();

        // Глаза (сдвинуты в сторону взгляда)
        const eyeShift = 6;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(-headW * 0.2 + eyeShift, -headH * 0.05, 13, 0, Math.PI * 2);
        ctx.arc(headW * 0.2 + eyeShift, -headH * 0.05, 13, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#1a1a2e';
        ctx.beginPath();
        ctx.arc(-headW * 0.2 + eyeShift + 4, -headH * 0.05, 6.5, 0, Math.PI * 2);
        ctx.arc(headW * 0.2 + eyeShift + 4, -headH * 0.05, 6.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(-headW * 0.2 + eyeShift + 2, -headH * 0.08, 2.5, 0, Math.PI * 2);
        ctx.arc(headW * 0.2 + eyeShift + 2, -headH * 0.08, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Нос
        ctx.fillStyle = '#ff6b8a';
        ctx.beginPath();
        ctx.moveTo(headW * 0.05, headH * 0.1);
        ctx.lineTo(headW * 0.05 - 7, headH * 0.2);
        ctx.lineTo(headW * 0.05 + 7, headH * 0.2);
        ctx.closePath();
        ctx.fill();

        // Усы
        ctx.strokeStyle = '#1a1a2e';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(-headW * 0.15, headH * 0.2); ctx.lineTo(-headW * 0.45, headH * 0.18);
        ctx.moveTo(-headW * 0.15, headH * 0.26); ctx.lineTo(-headW * 0.45, headH * 0.3);
        ctx.moveTo(headW * 0.25, headH * 0.2); ctx.lineTo(headW * 0.55, headH * 0.18);
        ctx.moveTo(headW * 0.25, headH * 0.26); ctx.lineTo(headW * 0.55, headH * 0.3);
        ctx.stroke();

        ctx.restore();

        // ===== Корзина =====
        drawBasket(basketX, basketY, lookLeft ? -1 : 1, basketUp ? -1 : 1);

        ctx.restore();
    }

    function drawBasket(cx, cy, flipX, flipY) {
        const bw = 100;
        const bh = 70;

        ctx.save();
        ctx.translate(cx, cy);
        // Отражаем корзину, чтобы её "дно" смотрело наружу
        ctx.scale(flipX, flipY);

        // Тело корзины (трапеция)
        ctx.fillStyle = '#b5762a';
        ctx.beginPath();
        ctx.moveTo(-bw / 2, -bh / 2);
        ctx.lineTo(bw / 2, -bh / 2);
        ctx.lineTo(bw / 2 - 12, bh / 2);
        ctx.lineTo(-bw / 2 + 12, bh / 2);
        ctx.closePath();
        ctx.fill();

        // Обод
        ctx.fillStyle = '#d89346';
        ctx.fillRect(-bw / 2 - 4, -bh / 2 - 8, bw + 8, 12);

        // Плетение
        ctx.strokeStyle = '#8a5a1f';
        ctx.lineWidth = 2.5;
        for (let i = 1; i < 4; i++) {
            const yy = -bh / 2 + (bh / 4) * i;
            ctx.beginPath();
            ctx.moveTo(-bw / 2 + 6, yy);
            ctx.lineTo(bw / 2 - 6, yy);
            ctx.stroke();
        }

        // Вертикальные прутья
        for (let i = 1; i < 5; i++) {
            const xx = -bw / 2 + (bw / 5) * i;
            ctx.beginPath();
            ctx.moveTo(xx, -bh / 2 + 4);
            ctx.lineTo(xx, bh / 2 - 4);
            ctx.stroke();
        }

        ctx.restore();
    }

    // ===== Пирожное =====
    function drawItem(it) {
        const chute = CHUTES[it.slot];
        const pos = chutePos(chute, Math
