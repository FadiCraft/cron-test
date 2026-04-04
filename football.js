import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// تأكيد المسارات المطلقة للعمل بشكل صحيح في بيئات الـ CI/CD
const FOOTBALL_DIR = path.resolve(__dirname, "football");
const OUTPUT_FILE = path.join(FOOTBALL_DIR, "Hg.json");

// دالة للتأكد من وجود المجلد ومنح صلاحيات الكتابة
function ensureDirectory() {
    if (!fs.existsSync(FOOTBALL_DIR)) {
        console.log(`📁 إنشاء مجلد: ${FOOTBALL_DIR}`);
        fs.mkdirSync(FOOTBALL_DIR, { recursive: true });
    }
}

async function fetchWithTimeout(url) {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html'
            },
            signal: AbortSignal.timeout(15000) // تحديد مهلة 15 ثانية
        });
        if (!response.ok) return null;
        return await response.text();
    } catch (error) {
        console.error(`⚠️ خطأ في الاتصال بـ ${url}: ${error.message}`);
        return null;
    }
}

async function scrape() {
    ensureDirectory();
    
    // الرابط الذي استنتجناه من الكود الذي أرسلته
    const url = "https://koranews.site88.one/"; 
    console.log(`🌐 جاري محاولة جلب البيانات من: ${url}`);
    
    const html = await fetchWithTimeout(url);
    if (!html) {
        console.log("❌ لم يتم استلام أي بيانات من الموقع.");
        // حفظ ملف فارغ لمنع فشل السكربت في الـ Action
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ error: "No data fetched", matches: [] }));
        return;
    }

    const dom = new JSDOM(html);
    const doc = dom.window.document;
    const matches = [];

    // البحث عن العناصر بناءً على الكود الذي أرسلته (match-card-link)
    const matchElements = doc.querySelectorAll('a.match-card-link');
    console.log(`✅ وجدنا ${matchElements.length} مباراة في الصفحة.`);

    matchElements.forEach((el, i) => {
        const teamNames = el.querySelectorAll('.team-name');
        const scoreSpans = el.querySelectorAll('.match-score span:not(.score-sep)');
        const status = el.querySelector('.match-status')?.textContent.trim() || "غير معروف";
        const tour = el.querySelector('.match-league')?.textContent.trim() || "بطولة غير محددة";

        if (teamNames.length >= 2) {
            matches.push({
                id: Date.now() + i,
                home: teamNames[0].textContent.trim(),
                away: teamNames[1].textContent.trim(),
                score: `${scoreSpans[0]?.textContent.trim() || 0}-${scoreSpans[1]?.textContent.trim() || 0}`,
                status: status,
                tournament: tour,
                url: el.getAttribute('href')
            });
        }
    });

    // الحفظ النهائي
    const finalData = {
        lastUpdate: new Date().toISOString(),
        count: matches.length,
        matches: matches
    };

    try {
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalData, null, 2));
        console.log(`🚀 تم الحفظ بنجاح! الإجمالي: ${matches.length} مباراة.`);
    } catch (err) {
        console.error(`❌ فشل الكتابة في الملف: ${err.message}`);
    }
}

scrape();
