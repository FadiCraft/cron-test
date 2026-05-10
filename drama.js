const fs = require('fs');
const path = require('path');
const https = require('https');
const { parse } = require('node-html-parser');

class LaroozaPagedExtractor {
    constructor() {
        this.episodesPerFile = 500;
        this.outputDir = 'Ramadan';
        this.allEpisodes = [];
        this.episodesMap = new Map();
        
        this.baseUrls = [
            'https://larozza.mom',
            'https://larozza.makeup',
            'https://m.laroza-tv.net'
        ];
        this.baseUrl = this.baseUrls[0];
        
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
        
        this.loadExistingEpisodes();
        
        this.userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
        ];
        
        this.proxies = ['', 'https://corsproxy.io/?'];
        this.maxPages = 100;
    }

    // --- فحص صارم للغة العربية ---
    hasArabic(text) {
        if (!text) return false;
        // النطاق العربي الأساسي
        const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
        return arabicPattern.test(text);
    }

    loadExistingEpisodes() {
        try {
            const files = fs.readdirSync(this.outputDir).filter(f => f.match(/^page\d+\.json$/));
            for (const file of files) {
                const content = fs.readFileSync(path.join(this.outputDir, file), 'utf8');
                const parsed = JSON.parse(content);
                const episodes = parsed.episodes || (Array.isArray(parsed) ? parsed : []);
                for (const ep of episodes) {
                    if (ep && ep.id) this.episodesMap.set(ep.id, ep);
                }
                this.allEpisodes.push(...episodes);
            }
        } catch (e) { console.log('ℹ️ بدء من الصفر'); }
    }

    async start() {
        console.log('🚀 بدء الاستخراج (فلترة عربية صارمة مفعلة)');
        let page = 1;
        let consecutiveEmptyPages = 0;

        while (page <= this.maxPages && consecutiveEmptyPages < 3) {
            const pageUrl = `${this.baseUrl}/category.php?cat=ramadan-2026&page=${page}&order=DESC`;
            let html = await this.fetchWithProxy(pageUrl).catch(() => null);
            
            if (!html || html.length < 500) {
                consecutiveEmptyPages++;
                page++;
                continue;
            }

            const pageEpisodes = await this.extractEpisodesFromPage(html, page);
            
            if (pageEpisodes.length === 0) {
                console.log(`⚠️ صفحة ${page}: لم ينجح أي فيلم في فحص اللغة العربية (تخطي)`);
                consecutiveEmptyPages++;
            } else {
                consecutiveEmptyPages = 0;
                for (const ep of pageEpisodes) {
                    if (!this.episodesMap.has(ep.id)) {
                        this.episodesMap.set(ep.id, ep);
                        console.log(`✅ حفظ حلقة عربية: ${ep.title}`);
                    }
                }
            }
            
            if (page % 5 === 0) {
                this.allEpisodes = Array.from(this.episodesMap.values());
                await this.savePaginatedFiles(true);
            }
            page++;
            await this.sleep(2000);
        }
        
        this.allEpisodes = Array.from(this.episodesMap.values());
        await this.savePaginatedFiles(false);
        console.log('✨ انتهى الاستخراج بنجاح.');
    }

    async extractEpisodesFromPage(html, pageNumber) {
        const root = parse(html);
        const episodes = [];
        // المحددات الشائعة للأفلام والحلقات
        const items = root.querySelectorAll('li.col-xs-6, li.col-sm-4, div.video-item, article');
        
        for (const item of items) {
            const episode = await this.extractBasicInfo(item, pageNumber);
            // الكود لا يضيف الفيلم إلا إذا كان "عربي" (يرجع كائن وليس null)
            if (episode) {
                episodes.push(episode);
            }
        }
        return episodes;
    }

    async extractBasicInfo(element, pageNumber) {
        let linkElement = element.querySelector('a');
        if (!linkElement) return null;
        
        const href = linkElement.getAttribute('href');
        if (!href) return null;
        
        // استخراج العنوان بدقة
        let title = '';
        const titleSelectors = ['.ellipsis', 'h3', 'h4', '.title', 'img[alt]', 'a[title]'];
        for (const s of titleSelectors) {
            const el = element.querySelector(s);
            if (el) {
                title = el.textContent || el.getAttribute('alt') || el.getAttribute('title') || '';
                if (title.trim()) break;
            }
        }
        
        title = this.cleanText(title);

        // --- الفحص النهائي: إذا لم يكن عربي، نحذفه من النتائج فوراً ---
        if (!this.hasArabic(title)) {
            return null; // حذف الفيلم (تجاهله)
        }

        // استخراج الـ ID
        const match = href.match(/vid=([a-zA-Z0-9_-]+)/) || href.match(/\/([a-zA-Z0-9_-]{8,})\.html/);
        const id = match ? match[1] : null;
        if (!id) return null;

        return {
            id: id,
            title: title,
            image: element.querySelector('img')?.getAttribute('src') || '',
            videoUrl: `${this.baseUrl}/embed.php?vid=${id}`,
            page: pageNumber,
            extractedAt: new Date().toISOString()
        };
    }

    cleanText(text) {
        return text ? text.replace(/[\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim() : '';
    }

    async fetchWithProxy(url) {
        return new Promise((resolve, reject) => {
            const proxy = this.proxies[Math.floor(Math.random() * this.proxies.length)];
            const finalUrl = proxy ? proxy + encodeURIComponent(url) : url;
            https.get(finalUrl, { timeout: 10000, rejectUnauthorized: false }, (res) => {
                let d = '';
                res.on('data', (c) => d += c);
                res.on('end', () => resolve(d));
            }).on('error', reject);
        });
    }

    async savePaginatedFiles(isTemp = false) {
        if (this.allEpisodes.length === 0) return;
        const filePath = path.join(this.outputDir, isTemp ? 'temp.json' : 'page1.json');
        fs.writeFileSync(filePath, JSON.stringify({ episodes: this.allEpisodes }, null, 2));
    }

    sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}

if (require.main === module) {
    new LaroozaPagedExtractor().start();
}
