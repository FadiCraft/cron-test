function createPostHTML(episode) {
    // أرقام عشوائية للتقييم (زي ما هو موجود بالنموذج)
    const randomRating = (Math.random() * 1.5 + 3.5).toFixed(1);
    const randomViews = Math.floor(Math.random() * 15000) + 8000;
    const randomLikes = Math.floor(Math.random() * 800) + 200;
    
    // استخراج اسم المسلسل بدون "الحلقة"
    const seriesName = episode.title.replace(/الحلقة\s*\d+/i, '').trim();
    const shortTitle = seriesName.length > 20 ? seriesName.substring(0, 20) + '...' : seriesName;
    
    // بناء أزرار السيرفرات وحاوياتها
    let serversButtons = '';
    let serversContainers = '';
    
    if (episode.servers && episode.servers.length > 0) {
        episode.servers.forEach((server, index) => {
            const serverId = `server${index + 1}`;
            const activeClass = index === 0 ? 'active' : '';
            
            serversButtons += `<button class="server-btn ${activeClass}" data-server="${serverId}">${server.name || `سيرفر ${index + 1}`}</button>`;
            
            serversContainers += `
                <div class="iframe-container ${activeClass}" id="${serverId}">
                    <div class="iframe-placeholder">
                        <div class="play-icon-large" data-url="${server.url}">▶</div>
                        <div>${server.name || `سيرفر ${index + 1}`}</div>
                        <div class="watch-instruction">
                            انقر على زر التشغيل لمشاهدة الحلقة
                        </div>
                    </div>
                </div>
            `;
        });
    } else {
        // إذا ما في سيرفرات - نضيف سيرفر افتراضي
        const defaultUrl = `${episode.link}`;
        serversButtons = `<button class="server-btn active" data-server="server1">سيرفر المشاهدة</button>`;
        serversContainers = `
            <div class="iframe-container active" id="server1">
                <div class="iframe-placeholder">
                    <div class="play-icon-large" data-url="${defaultUrl}">▶</div>
                    <div>سيرفر المشاهدة</div>
                    <div class="watch-instruction">
                        انقر على زر التشغيل لمشاهدة الحلقة
                    </div>
                </div>
            </div>
        `;
    }

    return `<!DOCTYPE html>
<html dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${episode.title} - مشاهدة مباشرة</title>
    
    <!-- Google Fonts -->
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
    
    <!-- Font Awesome -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            background: #0a0a0a;
            color: white;
            font-family: 'Cairo', sans-serif;
        }
        
        .cairo-font {
            font-family: 'Cairo', sans-serif !important;
        }
        
        /* تصميم الحاوية الرئيسية */
        .main-container {
            align-items: center;
            background-image: linear-gradient(to right, rgba(0,0,0,.85), rgba(0,0,0,.4)), url('${episode.image}');
            background-position: center center;
            background-repeat: no-repeat;
            background-size: cover;
            border-radius: 15px;
            color: white;
            display: flex;
            justify-content: space-between;
            padding: 60px 40px;
            position: relative;
            margin: 20px;
            font-family: 'Cairo', sans-serif;
        }
        
        /* البطاقة المصغرة */
        .thumbnail-card {
            border-radius: 8px;
            box-shadow: rgba(0, 0, 0, 0.5) 0px 4px 12px;
            height: 120px;
            width: 200px;
            overflow: hidden;
            position: relative;
            order: 2;
        }
        
        .thumbnail-card img {
            height: 100%;
            object-fit: cover;
            width: 100%;
        }
        
        .thumbnail-overlay {
            align-items: center;
            background: linear-gradient(rgba(0, 0, 0, 0.2), rgba(0, 0, 0, 0.7));
            display: flex;
            flex-direction: column;
            height: 100%;
            justify-content: center;
            left: 0;
            position: absolute;
            top: 0;
            width: 100%;
        }
        
        .play-button {
            align-items: center;
            background: rgba(245, 197, 24, 0.9);
            border-radius: 50%;
            display: flex;
            height: 40px;
            justify-content: center;
            margin-bottom: 8px;
            width: 40px;
        }
        
        .play-button span {
            color: black;
            font-size: 18px;
            margin-left: 2px;
        }
        
        .thumbnail-text {
            color: white;
            font-size: 11px;
            font-weight: bold;
            line-height: 1.3;
            margin: 0;
            text-align: center;
        }
        
        .thumbnail-text span {
            color: #f5c518;
        }
        
        /* المحتوى الرئيسي */
        .content-main {
            flex: 1;
            margin-right: 30px;
            max-width: 70%;
            order: 1;
        }
        
        h1 {
            font-size: 48px;
            margin-bottom: 10px;
            font-family: 'Cairo', sans-serif;
        }
        
        /* إحصائيات التقييم */
        .rating-stats {
            display: flex;
            gap: 20px;
            margin: 15px 0;
            flex-wrap: wrap;
        }
        
        .stat-item {
            display: flex;
            align-items: center;
            gap: 8px;
            background: rgba(255,255,255,0.05);
            padding: 8px 15px;
            border-radius: 8px;
        }
        
        .stat-item i {
            color: #f5c518;
        }
        
        .meta-info {
            font-size: 14px;
            opacity: 0.9;
            font-family: 'Cairo', sans-serif;
        }
        
        .description {
            color: #dddddd;
            line-height: 1.7;
            margin-top: 20px;
            max-width: 600px;
            font-family: 'Cairo', sans-serif;
        }
        
        /* أزرار المشاهدة */
        .player-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            padding: 14px 28px;
            font-size: 18px;
            cursor: pointer;
            font-family: 'Cairo', sans-serif;
            background: #f5c518;
            border-radius: 6px;
            color: black;
            font-weight: bold;
            margin-right: 10px;
            text-decoration: none;
        }
        
        .site-link {
            border-radius: 6px;
            border: 1px solid white;
            color: white;
            display: inline-block;
            padding: 12px 22px;
            text-decoration: none;
            font-family: 'Cairo', sans-serif;
        }
        
        /* تصميم سيرفرات المشاهدة */
        .servers-container {
            margin-top: 40px;
            width: 100%;
        }
        
        .servers-title {
            font-size: 24px;
            margin-bottom: 20px;
            color: #f5c518;
            border-bottom: 2px solid #f5c518;
            padding-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .servers-title span {
            font-size: 20px;
        }
        
        .server-buttons {
            display: flex;
            flex-wrap: wrap;
            gap: 15px;
            margin-bottom: 30px;
        }
        
        .server-btn {
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 8px;
            color: white;
            padding: 12px 20px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            min-width: 140px;
            text-align: center;
            font-family: 'Cairo', sans-serif;
        }
        
        .server-btn:hover {
            background: rgba(245, 197, 24, 0.2);
            border-color: #f5c518;
        }
        
        .server-btn.active {
            background: rgba(245, 197, 24, 0.9);
            color: black;
            border-color: #f5c518;
        }
        
        .iframe-container {
            width: 100%;
            height: 500px;
            background: rgba(0, 0, 0, 0.7);
            border-radius: 10px;
            overflow: hidden;
            border: 1px solid rgba(255, 255, 255, 0.1);
            display: none;
        }
        
        .iframe-container.active {
            display: block;
        }
        
        .iframe-placeholder {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: #ccc;
            font-size: 18px;
        }
        
        .play-icon-large {
            font-size: 60px;
            color: #f5c518;
            margin-bottom: 20px;
            cursor: pointer;
        }
        
        .watch-instruction {
            margin-top: 20px;
            font-size: 16px;
            color: #aaa;
            text-align: center;
            max-width: 80%;
            line-height: 1.5;
        }
        
        /* الوصف الإضافي */
        .extra-description {
            padding: 20px;
            background: rgba(0,0,0,0.05);
            border-radius: 10px;
            margin-top: 20px;
            font-family: 'Cairo', sans-serif;
        }
        
        /* زر زيارة الموقع */
        .footer-link {
            text-align: center;
            margin: 30px 0;
        }
        
        .footer-link a {
            display: inline-block;
            background: #f5c518;
            color: black;
            padding: 15px 30px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: bold;
            font-size: 18px;
        }
        
        /* تصميم متجاوب */
        @media (max-width: 768px) {
            .main-container {
                flex-direction: column;
                padding: 30px 20px;
            }
            
            .content-main {
                margin-right: 0;
                max-width: 100%;
                margin-bottom: 30px;
            }
            
            .thumbnail-card {
                width: 100%;
                max-width: 300px;
                margin: 0 auto;
            }
            
            h1 {
                font-size: 36px;
            }
            
            .iframe-container {
                height: 350px;
            }
        }
        
        /* أنيميشن */
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes fadeOut {
            from { opacity: 1; transform: translateY(0); }
            to { opacity: 0; transform: translateY(-20px); }
        }
    </style>
    
    <!-- Schema.org Markup for Google -->
    <script type="application/ld+json">
    {
        "@context": "https://schema.org",
        "@type": "VideoObject",
        "name": "${episode.title.replace(/"/g, '\\"')}",
        "description": "${episode.description.replace(/"/g, '\\"').substring(0, 150)}",
        "thumbnailUrl": "${episode.image}",
        "uploadDate": "${new Date().toISOString()}",
        "duration": "${episode.duration}",
        "contentUrl": "${episode.link}",
        "embedUrl": "${episode.servers?.[0]?.url || episode.link}",
        "interactionCount": "${randomViews}",
        "aggregateRating": {
            "@type": "AggregateRating",
            "ratingValue": "${randomRating}",
            "ratingCount": "${randomLikes}",
            "bestRating": "5",
            "worstRating": "1"
        },
        "publisher": {
            "@type": "Organization",
            "name": "كيروزوزو",
            "url": "https://www.kirozozo.xyz/"
        }
    }
    </script>
</head>
<body>
    <div class="cairo-font main-container">
        <!-- البطاقة المصغرة على اليمين -->
        <div class="thumbnail-card">
            <img alt="${episode.title}" src="${episode.image}" />
            <div class="thumbnail-overlay">
                <div class="play-button">
                    <span>▶</span>
                </div>
                <p class="thumbnail-text">
                    تشغيل<br />
                    <span>${shortTitle}</span>
                </p>
            </div>
        </div>

        <!-- المحتوى الرئيسي على اليسار -->
        <div class="content-main">
            <h1>${episode.title}</h1>
            
            <!-- إحصائيات التقييم -->
            <div class="rating-stats">
                <div class="stat-item">
                    <i class="fas fa-star"></i>
                    <span>${randomRating} / 5</span>
                </div>
                <div class="stat-item">
                    <i class="fas fa-eye"></i>
                    <span>${randomViews.toLocaleString()} مشاهدة</span>
                </div>
                <div class="stat-item">
                    <i class="fas fa-thumbs-up"></i>
                    <span>${randomLikes.toLocaleString()} إعجاب</span>
                </div>
            </div>
            
            <p class="meta-info">
                ⭐ ${randomRating} &nbsp; | &nbsp; ${episode.duration} &nbsp; | &nbsp; مسلسل دراما &nbsp; | &nbsp; مترجمة
            </p>
            
            <p class="description">
                ${episode.description}
            </p>
            
            <div style="margin-top: 30px;">
                <a href="#" id="watchBtn" class="player-btn">
                    <span style="margin-left: 5px;">▶</span> مشاهدة الآن
                </a>
                
                <a href="https://www.kirozozo.xyz/" target="_blank" class="site-link">
                    <i class="fas fa-external-link-alt"></i> زيارة موقع كيروزوزو
                </a>
            </div>
            
            <!-- قسم سيرفرات المشاهدة -->
            <div class="servers-container" id="serversSection" style="display: none;">
                <div class="servers-title">
                    <span>📺</span> سيرفرات المشاهدة
                </div>
                
                <div class="server-buttons">
                    ${serversButtons}
                </div>
                
                ${serversContainers}
            </div>
        </div>
    </div>

    <!-- وصف إضافي -->
    <p class="cairo-font extra-description">
        ${episode.description}
    </p>

    <!-- زر زيارة الموقع -->
    <div class="footer-link">
        <a href="https://www.kirozozo.xyz/" target="_blank">
            <i class="fas fa-external-link-alt"></i> لمزيد من الأفلام والمسلسلات زوروا موقع كيروزوزو
        </a>
    </div>

    <script>
    document.addEventListener('DOMContentLoaded', function() {
        const watchBtn = document.getElementById('watchBtn');
        const serversSection = document.getElementById('serversSection');
        const serverButtons = document.querySelectorAll('.server-btn');
        const iframeContainers = document.querySelectorAll('.iframe-container');
        
        // عند النقر على زر المشاهدة
        if (watchBtn) {
            watchBtn.addEventListener('click', function(e) {
                e.preventDefault();
                
                if (serversSection.style.display === 'none' || serversSection.style.display === '') {
                    serversSection.style.display = 'block';
                    watchBtn.innerHTML = '<span style="margin-left: 5px;">▲</span> إخفاء السيرفرات';
                    
                    // تمرير سلس إلى القسم
                    serversSection.scrollIntoView({ behavior: 'smooth' });
                } else {
                    serversSection.style.display = 'none';
                    watchBtn.innerHTML = '<span style="margin-left: 5px;">▶</span> مشاهدة الآن';
                }
            });
        }
        
        // عند النقر على سيرفر مختلف
        serverButtons.forEach(button => {
            button.addEventListener('click', function() {
                const serverId = this.getAttribute('data-server');
                
                // إزالة النشط من جميع الأزرار
                serverButtons.forEach(btn => btn.classList.remove('active'));
                // إضافة النشط للزر المحدد
                this.classList.add('active');
                
                // إخفاء جميع الحاويات
                iframeContainers.forEach(container => {
                    container.classList.remove('active');
                });
                
                // إظهار الحاوية المحددة
                const targetContainer = document.getElementById(serverId);
                if (targetContainer) {
                    targetContainer.classList.add('active');
                }
            });
        });
        
        // تشغيل الفيديو عند النقر على أيقونة التشغيل
        const playIcons = document.querySelectorAll('.play-icon-large');
        playIcons.forEach(icon => {
            icon.addEventListener('click', function() {
                const videoUrl = this.getAttribute('data-url');
                const container = this.closest('.iframe-container');
                
                if (container && videoUrl) {
                    // استبدال المحتوى بـ iframe
                    container.innerHTML = \`<iframe src="\${videoUrl}" width="100%" height="100%" frameborder="0" allowfullscreen style="border: none;"></iframe>\`;
                    
                    // إظهار رسالة نجاح
                    showMessage('✓ جاري تشغيل الحلقة');
                }
            });
        });
        
        // دالة لعرض الرسائل
        function showMessage(text) {
            // إزالة أي رسالة موجودة
            const existingMessage = document.querySelector('.custom-message');
            if (existingMessage) {
                existingMessage.remove();
            }
            
            const message = document.createElement('div');
            message.className = 'custom-message';
            message.textContent = text;
            message.style.cssText = \`
                position: fixed;
                top: 20px;
                right: 20px;
                background: #28a745;
                color: white;
                padding: 15px 25px;
                border-radius: 10px;
                z-index: 10000;
                font-family: 'Cairo', sans-serif;
                animation: fadeIn 0.3s;
                box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            \`;
            
            document.body.appendChild(message);
            
            setTimeout(() => {
                message.style.animation = 'fadeOut 0.3s forwards';
                setTimeout(() => message.remove(), 300);
            }, 3000);
        }
    });
    </script>
</body>
</html>`;
}

// ==================== GitHub Storage مع تحديثات التقدم ====================
class GitHubStorage {
    constructor() {
        this.token = GH_TOKEN;
        this.repo = REPO_PATH;
    }

    async readFile(filename) {
        try {
            const response = await fetch(
                `${GITHUB_API}/repos/${this.repo}/contents/${filename}`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'User-Agent': 'Cron-Job-Script'
                    }
                }
            );

            if (response.status === 200) {
                const data = await response.json();
                const content = Buffer.from(data.content, 'base64').toString('utf8');
                return {
                    content: JSON.parse(content),
                    sha: data.sha
                };
            }
            return null;
        } catch (error) {
            return null;
        }
    }

    async writeFile(filename, content, message) {
        try {
            let sha = null;
            const existing = await this.readFile(filename);
            if (existing) sha = existing.sha;

            const contentBase64 = Buffer.from(JSON.stringify(content, null, 2)).toString('base64');

            const response = await fetch(
                `${GITHUB_API}/repos/${this.repo}/contents/${filename}`,
                {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json',
                        'User-Agent': 'Cron-Job-Script'
                    },
                    body: JSON.stringify({
                        message: message,
                        content: contentBase64,
                        ...(sha && { sha })
                    })
                }
            );

            return response.ok;
        } catch (error) {
            console.error(`❌ خطأ في حفظ ${filename}:`, error.message);
            return false;
        }
    }

    // 📁 ملف تقدم رمضان - updates_progress.json
    async updateRamadanProgress(episodeData) {
        const filePath = 'Ramadan/updates_progress.json';
        
        let progress = {
            last_update: new Date().toISOString(),
            total_episodes_extracted: 0,
            total_episodes_published: 0,
            episodes: [],
            daily_stats: {},
            monthly_stats: {
                "2026-02": {
                    extracted: 0,
                    published: 0
                }
            }
        };

        // قراءة الملف الموجود
        const existing = await this.readFile(filePath);
        if (existing) {
            progress = existing.content;
        }

        // تحديث التاريخ
        progress.last_update = new Date().toISOString();
        
        // إضافة الحلقة الجديدة
        const today = new Date().toISOString().split('T')[0];
        const month = new Date().toISOString().substring(0, 7);
        
        // تحديث إحصائيات اليوم
        if (!progress.daily_stats[today]) {
            progress.daily_stats[today] = {
                extracted: 0,
                published: 0,
                episodes: []
            };
        }

        // إضافة الحلقة
        const episodeEntry = {
            id: episodeData.id,
            title: episodeData.title,
            extracted_at: new Date().toISOString(),
            published: episodeData.published || false,
            published_at: episodeData.published_at || null,
            url: episodeData.url || null,
            duration: episodeData.duration || '00:00'
        };

        progress.episodes.push(episodeEntry);
        
        // تحديث الإحصائيات
        progress.total_episodes_extracted = progress.episodes.length;
        progress.total_episodes_published = progress.episodes.filter(e => e.published).length;
        
        // تحديث إحصائيات اليوم
        progress.daily_stats[today].extracted++;
        progress.daily_stats[today].episodes.push({
            id: episodeData.id,
            title: episodeData.title,
            time: new Date().toISOString()
        });

        // تحديث إحصائيات الشهر
        if (!progress.monthly_stats[month]) {
            progress.monthly_stats[month] = {
                extracted: 0,
                published: 0
            };
        }
        progress.monthly_stats[month].extracted++;
        if (episodeData.published) {
            progress.monthly_stats[month].published++;
        }

        // حفظ الملف
        const saved = await this.writeFile(
            filePath,
            progress,
            `📊 تحديث تقدم رمضان: ${episodeData.title}`
        );

        if (saved) {
            console.log(`✅ تم تحديث ملف تقدم رمضان: Ramadan/updates_progress.json`);
            console.log(`📊 إجمالي المستخرج: ${progress.total_episodes_extracted}`);
            console.log(`📊 إجمالي المنشور: ${progress.total_episodes_published}`);
        }

        return saved;
    }

    async getHistory() {
        const data = await this.readFile(HISTORY_FILE);
        if (data) return data.content;
        
        const newHistory = {
            last_updated: new Date().toISOString(),
            total_extracted: 0,
            extracted_ids: []
        };
        await this.writeFile(HISTORY_FILE, newHistory, "✨ إنشاء سجل استخراج جديد");
        return newHistory;
    }

    async addToHistory(episodeId, episodeTitle) {
        const history = await this.getHistory();
        if (!history.extracted_ids.includes(episodeId)) {
            history.extracted_ids.push(episodeId);
            history.total_extracted = history.extracted_ids.length;
            history.last_updated = new Date().toISOString();
            await this.writeFile(HISTORY_FILE, history, `➕ إضافة: ${episodeTitle.substring(0, 30)}...`);
            return true;
        }
        return false;
    }

    async getPublishedLog() {
        const data = await this.readFile(PUBLISHED_FILE);
        if (data) return data.content;
        
        const newLog = {
            last_updated: new Date().toISOString(),
            total: 0,
            items: []
        };
        await this.writeFile(PUBLISHED_FILE, newLog, "✨ إنشاء سجل نشر جديد");
        return newLog;
    }

    async addToPublished(episodeId, episodeTitle, postUrl = "") {
        const log = await this.getPublishedLog();
        if (!log.items.find(item => item.id === episodeId)) {
            log.items.push({
                id: episodeId,
                title: episodeTitle,
                date: new Date().toISOString(),
                url: postUrl
            });
            log.total = log.items.length;
            log.last_updated = new Date().toISOString();
            
            // حفظ في سجل النشر
            await this.writeFile(PUBLISHED_FILE, log, `📝 نشر: ${episodeTitle.substring(0, 30)}...`);
            
            // تحديث ملف تقدم رمضان
            await this.updateRamadanProgress({
                id: episodeId,
                title: episodeTitle,
                published: true,
                published_at: new Date().toISOString(),
                url: postUrl,
                duration: '00:00'
            });
            
            return true;
        }
        return false;
    }
}

// ==================== تعديل الدالة الرئيسية ====================
(async () => {
    console.log('🎬 نظام استخراج ونشر حلقات رمضان 2026');
    console.log('======================================');
    console.log(`📅 التاريخ: ${new Date().toLocaleString('ar-SA')}`);
    console.log(`🔍 المصدر: لاروزا - رمضان 2026\n`);

    try {
        // 1. تهيئة التخزين
        const github = new GitHubStorage();
        
        // 2. استخراج الحلقة التالية
        const extractor = new LaroozaExtractor(github);
        const episode = await extractor.getNextEpisode();
        
        if (!episode) {
            console.log('\n⏹️ لا توجد حلقة جديدة للنشر');
            return;
        }

        // 3. التحقق من النشر المسبق
        const published = await github.getPublishedLog();
        if (published.items.find(p => p.id === episode.id)) {
            console.log('\n⚠️ هذه الحلقة منشورة مسبقاً');
            return;
        }

        // 4. الحصول على توكن Blogger
        console.log('\n🔑 جاري الحصول على توكن Blogger...');
        
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                refresh_token: REFRESH_TOKEN,
                grant_type: "refresh_token"
            })
        });

        const tokenData = await tokenRes.json();
        
        if (!tokenData.access_token) {
            throw new Error('❌ فشل الحصول على توكن Blogger');
        }

        console.log('✅ تم الحصول على التوكن بنجاح');

        // 5. إنشاء محتوى المقال
        console.log('\n📝 جاري إنشاء المقال...');
        const htmlContent = createPostHTML(episode);

        // 6. النشر على Blogger
        console.log('📤 جاري النشر على Blogger...');
        const publishResult = await publishToBlogger(tokenData.access_token, htmlContent, episode.title);

        if (publishResult.id) {
            console.log('✅ تم النشر بنجاح!');
            console.log(`🔗 رابط المقال: ${publishResult.url}`);
            
            // 7. حفظ في سجل النشر وتحديث ملف التقدم
            await github.addToPublished(episode.id, episode.title, publishResult.url);
            
            // 8. تحديث ملف تقدم رمضان مع بيانات كاملة
            await github.updateRamadanProgress({
                id: episode.id,
                title: episode.title,
                published: true,
                published_at: new Date().toISOString(),
                url: publishResult.url,
                duration: episode.duration,
                description: episode.description
            });
            
            console.log('\n📊 ملخص العملية:');
            console.log(`✅ الحلقة: ${episode.title}`);
            console.log(`🆔 المعرف: ${episode.id}`);
            console.log(`⏱️ المدة: ${episode.duration}`);
            console.log(`📅 النشر: ${new Date().toLocaleString('ar-SA')}`);
            console.log(`📁 تم حفظ التقدم في: Ramadan/updates_progress.json`);
        } else {
            console.error('❌ فشل النشر:', publishResult.error?.message || 'خطأ غير معروف');
        }

    } catch (error) {
        console.error('\n🚨 خطأ رئيسي:', error.message);
        console.error('📋 تفاصيل:', error.stack);
    }
})();
