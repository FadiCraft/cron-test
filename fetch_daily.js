import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==================== المسارات ====================
const MOVIES_DIR = path.join(__dirname, "movies");
const OUTPUT_FILE = path.join(MOVIES_DIR, "Hg.json");

// إنشاء مجلد movies
if (!fs.existsSync(MOVIES_DIR)) {
    fs.mkdirSync(MOVIES_DIR, { recursive: true });
}

// ==================== fetch مع timeout ====================
async function fetchWithTimeout(url, timeout = 20000) {
    try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), timeout);

        const res = await fetch(url, {
            signal: controller.signal,
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept":
                    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
        });

        clearTimeout(t);

        if (!res.ok) {
            console.log(`⚠️ فشل ${res.status} : ${url}`);
            return null;
        }

        return await res.text();
    } catch (e) {
        console.log(`❌ fetch error: ${url}`);
        return null;
    }
}

// ==================== استخراج الصفحة الرئيسية ====================
async function fetchMoviesFromHomePage() {
    const url = "https://topcinema.rip/movies/";
    console.log(`📖 جلب الصفحة: ${url}`);

    const html = await fetchWithTimeout(url);
    if (!html) return { url, movies: [] };

    const dom = new JSDOM(html);
    const doc = dom.window.document;

    let items = doc.querySelectorAll(".Small--Box a");
    if (items.length === 0) {
        items = doc.querySelectorAll("article a, .post-item a");
    }

    console.log(`✅ تم العثور على ${items.length} عنصر`);

    const movies = [];
    items.forEach((el, i) => {
        const link = el.href;
        if (!link || !link.includes("topcinema")) return;

        const title =
            el.querySelector(".title, h2, h3")?.textContent ||
            el.textContent ||
            `Movie ${i + 1}`;

        movies.push({
            title: title.trim(),
            url: link,
            position: i + 1,
        });
    });

    return { url, movies };
}

// ==================== تفاصيل الفيلم (اختياري) ====================
async function fetchBasicMovieDetails(movie) {
    const html = await fetchWithTimeout(movie.url, 15000);
    if (!html) return null;

    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;

        const title =
            doc.querySelector("h1")?.textContent?.trim() || movie.title;

        const image =
            doc.querySelector("img.wp-post-image, .image img")?.src || null;

        return {
            id: `movie_${movie.position}`,
            title,
            image,
            url: movie.url,
            position: movie.position,
            scrapedAt: new Date().toISOString(),
        };
    } catch {
        return null;
    }
}

// ==================== حفظ النتائج ====================
function saveToHgFile(pageData, moviesData) {
    const data = {
        page: "Home",
        source: pageData.url,
        totalExtracted: moviesData.length,
        scrapedAt: new Date().toISOString(),
        movies: moviesData,
    };

    console.log("📂 حفظ الملف في:", OUTPUT_FILE);

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));

    const backup = path.join(
        MOVIES_DIR,
        `Hg_${new Date().toISOString().split("T")[0]}.json`
    );
    fs.writeFileSync(backup, JSON.stringify(data, null, 2));

    console.log(`💾 تم حفظ Hg.json + نسخة احتياطية`);
}

// ==================== MAIN ====================
async function main() {
    console.log("🚀 بدء الاستخراج");
    console.log("=".repeat(50));

    const pageData = await fetchMoviesFromHomePage();

    if (!pageData.movies.length) {
        console.log("⚠️ لا أفلام – سيتم حفظ ملف فارغ");
        saveToHgFile(pageData, []);
        return;
    }

    const moviesData = [];

    for (let i = 0; i < pageData.movies.length; i++) {
        const movie = pageData.movies[i];
        console.log(`🎬 ${i + 1}/${pageData.movies.length} ${movie.title}`);

        const details = await fetchBasicMovieDetails(movie);

        // لو فشل Cloudflare نحفظ الأساسي
        moviesData.push(
            details || {
                ...movie,
                scrapedAt: new Date().toISOString(),
                note: "details_blocked_by_cloudflare",
            }
        );

        await new Promise((r) => setTimeout(r, 800));
    }

    saveToHgFile(pageData, moviesData);

    console.log("🎉 انتهى الاستخراج بنجاح");
}

main().catch((e) => {
    console.error("💥 خطأ عام:", e.message);
});
