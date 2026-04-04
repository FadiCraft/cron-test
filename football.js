import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FOOTBALL_DIR = path.resolve(__dirname, "football");
const OUTPUT_FILE = path.join(FOOTBALL_DIR, "Hg.json");

if (!fs.existsSync(FOOTBALL_DIR)) fs.mkdirSync(FOOTBALL_DIR, { recursive: true });

async function fetchWithTimeout(url) {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            signal: AbortSignal.timeout(20000)
        });
        return response.ok ? await response.text() : null;
    } catch (error) { return null; }
}

async function scrape() {
    const url = "https://koranews.site88.one/"; 
    console.log(`🌐 محاولة جلب البيانات من: ${url}`);
    
    const html = await fetchWithTimeout(url);
    if (!html) {
        console.log("❌ فشل الجلب.");
        return;
    }

    const dom = new JSDOM(html);
    const doc = dom.window.document;
    const matches = [];

    // محاولة البحث بعدة طرق (Selectors) لضمان الوصول للكروت
    // 1. الطريقة المباشرة بالكلاس
    // 2. البحث عن أي مقال (article)
    // 3. البحث عن أي رابط يحتوي على كلمة "مباراة" في العنوان
    let cards = doc.querySelectorAll('a.match-card-link, article.match-card, .match-item, a[href*="match"]');

    console.log(`🔍 فحص العناصر المكتشفة: ${cards.length}`);

    cards.forEach((el, i) => {
        // التأكد من أننا نأخذ الرابط الصحيح (إما العنصر نفسه أو الأب له)
        const matchUrl = el.tagName === 'A' ? el.href : el.closest('a')?.href;
        if (!matchUrl || matches.some(m => m.url === matchUrl)) return;

        const teamNames = el.querySelectorAll('.team-name');
        if (teamNames.length < 2) return; // تخطي العناصر التي ليست مباريات حقيقية

        const scoreSpans = el.querySelectorAll('.match-score span:not(.score-sep)');
        const status = el.querySelector('.match-status')?.textContent.trim() || "قريباً";
        const tour = el.querySelector('.match-league, .match-info-bar')?.textContent.trim() || "بطولة";

        matches.push({
            id: Date.now() + i,
            home: teamNames[0].textContent.trim(),
            away: teamNames[1].textContent.trim(),
            score: scoreSpans.length >= 2 ? `${scoreSpans[0].textContent.trim()}-${scoreSpans[1].textContent.trim()}` : "0-0",
            status: status,
            tournament: tour,
            url: matchUrl
        });
    });

    const finalData = { lastUpdate: new Date().toISOString(), count: matches.length, matches: matches };
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalData, null, 2));
    console.log(`🚀 تم الحفظ! وجدنا: ${matches.length} مباراة.`);
}

scrape();
