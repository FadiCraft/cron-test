# KiroZozo Movie Fetcher

هذا الكرون جوب يستخرج أحدث الأفلام والمسلسلات من موقع KiroZozo تلقائياً.

## الملفات الناتجة

1. `result.json` - يحتوي على كل البيانات مع الإحصائيات
2. `movies.json` - يحتوي على الأفلام فقط
3. `series.json` - يحتوي على المسلسلات فقط

## هيكل البيانات

```json
{
  "success": true,
  "timestamp": "2024-01-01T12:00:00.000Z",
  "stats": {
    "totalMovies": 50,
    "totalSeries": 30,
    "totalContent": 80
  },
  "movies": [
    {
      "id": "unique-id",
      "title": "اسم الفيلم",
      "url": "رابط الفيلم",
      "image": "رابط الصورة",
      "quality": "HD",
      "rating": "8.5",
      "categories": ["أكشن", "دراما"],
      "year": "2024",
      "type": "فيلم",
      "fetchedAt": "2024-01-01T12:00:00.000Z"
    }
  ],
  "series": [...]
}
