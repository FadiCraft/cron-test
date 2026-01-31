import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// مجلد الحفظ
const outputDir = path.join(__dirname, "movies-test");

// أنشئ المجلد إذا لم يكن موجوداً
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`📁 تم إنشاء مجلد: ${outputDir}`);
}

// دالة بسيطة لجلب الصفحة
async function getFirstPage() {
    try {
        console.log("🚀 جلب الصفحة الأولى...");
        
        const response = await fetch("https://topcinema.rip/movies/", {
            headers: {
                'User-Agent': 'Mozilla/5.0'
            }
        });
        
        if (!response.ok) {
            throw new Error(`خطأ: ${response.status}`);
        }
        
        const html = await response.text();
        console.log("✅ تم جلب الصفحة بنجاح!");
        
        // حفظ HTML خام أولاً للتأكد
        fs.writeFileSync(
            path.join(outputDir, "page-raw.html"),
            html
        );
        console.log("💾 تم حفظ HTML الخام");
        
        return html;
        
    } catch (error) {
        console.log("❌ خطأ في الجلب:", error.message);
        return null;
    }
}

// استخراج العناوين البسيطة
function extractSimpleTitles(html) {
    console.log("🔍 استخراج العناوين...");
    
    const titles = [];
    
    // طريقة بسيطة باستخدام regex
    const titleRegex = /<a[^>]*href="[^"]*topcinema[^"]*"[^>]*>([^<]*)<\/a>/gi;
    let match;
    
    while ((match = titleRegex.exec(html)) !== null) {
        if (match[1].trim().length > 10) { // تجاهل النصوص القصيرة
            titles.push(match[1].trim());
        }
    }
    
    console.log(`✅ وجدنا ${titles.length} عنوان`);
    return titles.slice(0, 20); // فقط أول 20 عنوان
}

// الدالة الرئيسية
async function main() {
    console.log("=".repeat(50));
    console.log("🎬 تجربة استخراج الصفحة الأولى");
    console.log("=".repeat(50));
    
    // 1. جلب الصفحة
    const html = await getFirstPage();
    if (!html) return;
    
    // 2. استخراج العناوين
    const titles = extractSimpleTitles(html);
    
    // 3. حفظ النتائج في ملف JSON
    const result = {
        scrapedAt: new Date().toISOString(),
        url: "https://topcinema.rip/movies/",
        totalTitles: titles.length,
        titles: titles
    };
    
    const jsonFile = path.join(outputDir, "movies.json");
    fs.writeFileSync(jsonFile, JSON.stringify(result, null, 2));
    
    console.log("\n📊 النتائج:");
    console.log("=".repeat(30));
    titles.forEach((title, i) => {
        console.log(`${i + 1}. ${title.substring(0, 50)}...`);
    });
    
    console.log("\n" + "=".repeat(50));
    console.log(`✅ تم! الملفات محفوظة في: ${outputDir}/`);
    console.log(`📄 movies.json - يحتوي على ${titles.length} فيلم`);
    console.log(`📄 page-raw.html - نسخة من الصفحة`);
}

// التشغيل
main().catch(console.error);
