// أبسط كود لإنشاء الملف
const fs = require("fs");
const path = require("path");

// 1. إنشاء مجلد movies
const folder = "movies";
if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder);
    console.log("📁 تم إنشاء مجلد movies");
}

// 2. إنشاء ملف Hg.json بداخله
const filePath = path.join(folder, "Hg.json");

// 3. بيانات بسيطة
const simpleData = {
    status: "ready",
    message: "الملف جاهز للتعديل",
    date: new Date().toLocaleString("ar-SA"),
    movies: []
};

// 4. كتابة الملف
fs.writeFileSync(filePath, JSON.stringify(simpleData, null, 4));

// 5. التحقق
if (fs.existsSync(filePath)) {
    console.log("✅ تم إنشاء الملف بنجاح!");
    console.log(`📍 الموقع: ${path.resolve(filePath)}`);
} else {
    console.log("❌ فشل إنشاء الملف");
}
