import fs from "fs";
import path from "path";

// إنشاء مجلد movies إذا لم يكن موجود
const moviesDir = "movies";
if (!fs.existsSync(moviesDir)) {
    fs.mkdirSync(moviesDir, { recursive: true });
    console.log(`✅ تم إنشاء مجلد ${moviesDir}`);
}

// مسار الملف
const outputFile = path.join(moviesDir, "Hg.json");

// بيانات تجريبية بسيطة
const sampleMovies = [
    {
        title: "فيلم تجريبي 1",
        url: "https://topcinema.rip/movies/sample1",
        id: "1"
    },
    {
        title: "فيلم تجريبي 2",
        url: "https://topcinema.rip/movies/sample2",
        id: "2"
    }
];

// إنشاء الملف
try {
    const data = {
        total: sampleMovies.length,
        created: new Date().toISOString(),
        message: "هذا ملف تجريبي، سنضبطه لاحقاً",
        movies: sampleMovies
    };

    fs.writeFileSync(outputFile, JSON.stringify(data, null, 2));
    console.log(`✅ تم إنشاء الملف: ${outputFile}`);
    console.log(`📊 حجم الملف: ${fs.statSync(outputFile).size} بايت`);
    
    // قراءة الملف للتحقق
    const fileContent = fs.readFileSync(outputFile, "utf8");
    console.log("\n📄 محتوى الملف:");
    console.log(fileContent.substring(0, 300) + "...");
    
} catch (error) {
    console.error(`❌ خطأ في إنشاء الملف: ${error.message}`);
}
