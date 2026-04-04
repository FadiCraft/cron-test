import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FOOTBALL_DIR = path.join(__dirname, "football");
const OUTPUT_FILE = path.join(FOOTBALL_DIR, "Hg.json");

if (!fs.existsSync(FOOTBALL_DIR)) {
    fs.mkdirSync(FOOTBALL_DIR, { recursive: true });
}

// ==================== استخراج المباريات باستخدام Puppeteer ====================
async function fetchMatchesWithPuppeteer() {
    const baseUrl = "https://koraplus.blog/"; // تأكد من الرابط الصحيح هنا
    console.log(`\n🌐 جاري فتح المتصفح لجلب: ${baseUrl}`);

    const browser = await puppeteer.launch({
        headless: "new", // تشغيل في الخلفية
        args: ['--no-sandbox', '--disable-setuid-sandbox'] // ضروري لبيئات Linux/GitHub Actions
    });

    const page = await browser.newPage();
    
    try {
        // تعيين User-Agent لتبدو كمتصفح حقيقي
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // الذهاب للموقع والانتظار حتى يستقر الشبكة
        await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        // الانتظار الإضافي للتأكد من تحميل سكربتات المباريات (مثلاً ننتظر ظهور كلاس معين)
        console.log("⏳ انتظار تحميل الجافا سكربت والمباريات...");
        await new Promise(resolve => setTimeout(resolve, 5000)); 

        // استخراج البيانات من داخل المتصفح
        const matches = await page.evaluate(() => {
            // ملاحظة: قمت بتحديث المحددات (Selectors) بناءً على الهيكل الأكثر شيوعاً للمواقع التي تستخدمها
            const results = [];
            const matchElements = document.querySelectorAll('.match-card, .match-container, a.match-card-link');

            matchElements.forEach((el, index) => {
                try {
                    // محاولة استخراج الرابط
                    let url = el.href || el.querySelector('a')?.href || "";
                    
                    // استخراج الأسماء (نبحث عن أي نص داخل كلاسات الفريق)
                    const teamNames = el.querySelectorAll('.team-name');
                    const team1 = teamNames[0]?.textContent.trim() || "غير معروف";
                    const team2 = teamNames[1]?.textContent.trim() || "غير معروف";

                    // استخراج الحالة
                    const status = el.querySelector('.match-status, .date')?.textContent.trim() || "غير معروف";
                    
                    // استخراج النتيجة
                    const scoreElem = el.querySelector('.match-score, .result');
                    const score = scoreElem ? scoreElem.textContent.trim().replace(/\s+/g, ' ') : "0 - 0";

                    results.push({
                        id: `match_${Date.now()}_${index}`,
                        url: url,
                        title: `${team1} vs ${team2}`,
                        team1: { name: team1, score: score.split('-')[0]?.trim() || "0" },
                        team2: { name: team2, score: score.split('-')[1]?.trim() || "0" },
                        score: score,
                        status: status,
                        tournament: el.querySelector('.match-league, .match-info-bar span:last-child')?.textContent.trim() || "غير محدد",
                        scrapedAt: new Date().toISOString()
                    });
                } catch (e) {}
            });
            return results;
        });

        await browser.close();
        return matches;

    } catch (error) {
        console.error(`❌ خطأ أثناء التشغيل: ${error.message}`);
        await browser.close();
        return [];
    }
}

// ==================== استخراج روابط المشغل (بالتتابع) ====================
async function fetchPlayerUrl(matchUrl) {
    if (!matchUrl) return null;
    
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
    const page = await browser.newPage();
    
    try {
        await page.goto(matchUrl, { waitUntil: 'networkidle2', timeout: 45000 });
        await new Promise(resolve => setTimeout(resolve, 3000));

        const playerInfo = await page.evaluate(() => {
            const iframe = document.querySelector('iframe[src*="albaplayer"], iframe[src*="gomatch"], iframe[src*="ontime"]');
            if (iframe) {
                return [{
                    type: 'iframe',
                    url: iframe.src,
                    quality: "HD",
                    server: "LiveServer",
                    id: 'p1'
                }];
            }
            return null;
        });

        await browser.close();
        return playerInfo;
    } catch (e) {
        await browser.close();
        return null;
    }
}

// ==================== الدالة الرئيسية ====================
async function main() {
    console.log("⚽ بدء استخراج المباريات (وضع المتصفح الذكي)...");
    
    const matches = await fetchMatchesWithPuppeteer();
    
    if (matches.length === 0) {
        console.log("⚠️ لم يتم العثور على مباريات. قد يكون المبدل (Selector) بحاجة لتحديث.");
        return;
    }

    console.log(`✅ وجدنا ${matches.length} مباراة. جاري فحص روابط البث للمباريات الجارية...`);

    for (let i = 0; i < matches.length; i++) {
        // فحص روابط البث فقط للمباريات الجارية الآن
        if (matches[i].status.includes("جارية") || matches[i].status.includes("مباشر")) {
            console.log(`🔗 جلب مشغل: ${matches[i].title}`);
            matches[i].watchServers = await fetchPlayerUrl(matches[i].url);
        }
    }

    const outputData = {
        scrapedAt: new Date().toISOString(),
        total: matches.length,
        matches: matches
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(outputData, null, 2));
    console.log(`\n🎉 تم الحفظ بنجاح في ${OUTPUT_FILE}`);
}

main();
