import fs from "fs";

// بيانات تجريبية مع عناوين حقيقية
const realMovies = [
  {
    "id": "movie_1",
    "title": "فيلم المغامرة الجريئة",
    "url": "https://topcinema.media/movies/adventure-movie-2024/",
    "image": "https://via.placeholder.com/300x200/2563eb/ffffff?text=فيلم+مغامرة",
    "quality": "HD 1080p",
    "rating": "8.2",
    "categories": ["أكشن", "مغامرة"],
    "year": "2024",
    "type": "فيلم",
    "fetchedAt": new Date().toISOString()
  },
  {
    "id": "movie_2",
    "title": "الكوميديا الرائعة",
    "url": "https://topcinema.media/movies/comedy-movie-2024/",
    "image": "https://via.placeholder.com/300x200/10b981/ffffff?text=كوميديا",
    "quality": "FHD",
    "rating": "7.5",
    "categories": ["كوميديا", "رومانسي"],
    "year": "2024",
    "type": "فيلم",
    "fetchedAt": new Date().toISOString()
  },
  {
    "id": "movie_3",
    "title": "الرعب المخيف",
    "url": "https://topcinema.media/movies/horror-movie-2024/",
    "image": "https://via.placeholder.com/300x200/dc2626/ffffff?text=فيلم+رعب",
    "quality": "4K",
    "rating": "6.8",
    "categories": ["رعب", "غموض"],
    "year": "2024",
    "type": "فيلم",
    "fetchedAt": new Date().toISOString()
  },
  {
    "id": "movie_4",
    "title": "الدراما العاطفية",
    "url": "https://topcinema.media/movies/drama-movie-2024/",
    "image": "https://via.placeholder.com/300x200/7c3aed/ffffff?text=دراما",
    "quality": "HD",
    "rating": "9.1",
    "categories": ["دراما", "عائلي"],
    "year": "2024",
    "type": "فيلم",
    "fetchedAt": new Date().toISOString()
  },
  {
    "id": "movie_5",
    "title": "الخيال العلمي",
    "url": "https://topcinema.media/movies/sci-fi-movie-2024/",
    "image": "https://via.placeholder.com/300x200/f59e0b/000000?text=خيال+علمي",
    "quality": "HD 720p",
    "rating": "8.7",
    "categories": ["خيال علمي", "مغامرة"],
    "year": "2024",
    "type": "فيلم",
    "fetchedAt": new Date().toISOString()
  },
  {
    "id": "movie_6",
    "title": "الوثائقي المميز",
    "url": "https://topcinema.media/movies/documentary-2024/",
    "image": "https://via.placeholder.com/300x200/059669/ffffff?text=وثائقي",
    "quality": "FHD",
    "rating": "8.9",
    "categories": ["وثائقي", "تاريخي"],
    "year": "2024",
    "type": "فيلم",
    "fetchedAt": new Date().toISOString()
  }
];

const result = {
  success: true,
  timestamp: new Date().toISOString(),
  source: "topcinema.media (تجريبي)",
  stats: {
    totalMovies: realMovies.length,
    unique: realMovies.length
  },
  movies: realMovies,
  metadata: {
    fetchedAt: new Date().toISOString(),
    nextFetch: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    note: "بيانات تجريبية - للتجربة فقط"
  }
};

// حفظ النتائج
fs.writeFileSync("result.json", JSON.stringify(result, null, 2));

// إنشاء تقرير HTML
const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
    <meta charset="UTF-8">
    <title>أفلام KiroZozo التجريبية</title>
    <style>
        body { font-family: Arial; padding: 20px; }
        .movie { border: 1px solid #ccc; padding: 10px; margin: 10px; }
        .quality { color: green; font-weight: bold; }
        .rating { color: orange; }
    </style>
</head>
<body>
    <h1>🎬 ${realMovies.length} فيلم تجريبي</h1>
    ${realMovies.map(movie => `
        <div class="movie">
            <h3>${movie.title}</h3>
            <p>الجودة: <span class="quality">${movie.quality}</span></p>
            <p>التقييم: <span class="rating">${movie.rating}/10</span></p>
            <p>التصنيفات: ${movie.categories.join(', ')}</p>
        </div>
    `).join('')}
</body>
</html>
`;

fs.writeFileSync("report.html", html);

console.log("✅ تم إنشاء البيانات التجريبية بنجاح!");
console.log(`📊 عدد الأفلام: ${realMovies.length}`);
console.log("📁 الملفات المحفوظة:");
console.log("   - result.json");
console.log("   - report.html");
