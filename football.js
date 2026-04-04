import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FOOTBALL_DIR = path.join(__dirname, "football");
const OUTPUT_FILE = path.join(FOOTBALL_DIR, "Hg.json");

if (!fs.existsSync(FOOTBALL_DIR)) fs.mkdirSync(FOOTBALL_DIR, { recursive: true });

async function scrape() {
    console.log("🚀 بدء تشغيل المتصفح...");
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        console.log("🌐 جاري فتح الموقع...");
        await page.goto("https://koraplus.blog/", { waitUntil: 'networkidle2', timeout: 60000 });

        // ننتظر 5 ثواني إضافية لضمان تحميل جميع المباريات عبر الجافا سكربت
        await new Promise(r => setTimeout(r, 5000));

        const matches = await page.evaluate(() => {
            const items = [];
            // نبحث عن كروت المباريات (تعديل المحددات لتكون أكثر مرونة)
            const cards = document.querySelectorAll('.match-container, .match-card, [class*="match"]');
            
            cards.forEach((el) => {
                const teamNames = el.querySelectorAll('.team-name');
                if (teamNames.length >= 2) {
                    const score = el.querySelector('.result, .match-score')?.textContent.trim() || "0 - 0";
                    const status = el.querySelector('.match-status, .date, .match-timing .date')?.textContent.trim() || "قريباً";
                    const link = el.querySelector('a')?.href || "";
                    
                    items.push({
                        title: `${teamNames[0].textContent.trim()} vs ${teamNames[1].textContent.trim()}`,
                        team1: { name: teamNames[0].textContent.trim() },
                        team2: { name: teamNames[1].textContent.trim() },
                        score: score,
                        status: status,
                        url: link,
                        tournament: "الدوري" // سيتم تحديثها تلقائياً إذا وجد كلاس البطولة
                    });
                }
            });
            return items;
        });

        console.log(`✅ تم استخراج ${matches.length} مباراة.`);

        const finalData = {
            scrapedAt: new Date().toISOString(),
            totalMatches: matches.length,
            matches: matches
        };

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalData, null, 2));
        console.log("💾 تم حفظ الملف بنجاح.");

    } catch (err) {
        console.error("❌ حدث خطأ أثناء الاستخراج:", err.message);
    } finally {
        await browser.close();
    }
}

scrape();
