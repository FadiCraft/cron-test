name: Extract Arabic Drama Videos

on:
  schedule:
    # تشغيل كل يوم في 3 صباحاً (توقيت UTC)
    - cron: '0 3 * * *'
  workflow_dispatch:  # للتنفيذ اليدوي
    inputs:
      max_videos:
        description: 'الحد الأقصى من الفيديوهات'
        required: false
        default: '3000'
      force_run:
        description: 'فرض التشغيل حتى لو كانت هناك أخطاء'
        required: false
        default: 'false'

jobs:
  extract-drama:
    runs-on: ubuntu-latest
    
    steps:
    - name: التحقق من الكود
      uses: actions/checkout@v3
      with:
        fetch-depth: 1
    
    - name: إعداد Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: تثبيت الاعتماديات
      run: |
        npm install
        echo "✅ تم تثبيت الاعتماديات"
    
    - name: إنشاء مجلد النتائج
      run: |
        mkdir -p DramaShorts/json
        echo "📁 تم إنشاء مجلدات التخزين"
    
    - name: استخراج فيديوهات الدراما
      id: extract
      run: |
        echo "🎬 بدء استخراج فيديوهات الدراما العربية..."
        node extract-drama.js
        echo "count=$(find DramaShorts/json -name '*.json' | wc -l)" >> $GITHUB_OUTPUT
        echo "videos=$(jq '.total_videos' DramaShorts/index.json 2>/dev/null || echo '0')" >> $GITHUB_OUTPUT
    
    - name: رفع الملفات إلى Artifacts
      uses: actions/upload-artifact@v3
      with:
        name: arabic-drama-database
        path: |
          DramaShorts/
        retention-days: 30
        if-no-files-found: error
    
    - name: إنشاء ملخص النتائج
      if: always()
      run: |
        echo "📊 ملخص النتائج:" >> $GITHUB_STEP_SUMMARY
        echo "---" >> $GITHUB_STEP_SUMMARY
        echo "- 🎥 عدد ملفات JSON: ${{ steps.extract.outputs.count }}" >> $GITHUB_STEP_SUMMARY
        echo "- 📹 عدد الفيديوهات: ${{ steps.extract.outputs.videos }}" >> $GITHUB_STEP_SUMMARY
        echo "- 📁 المجلد: DramaShorts/" >> $GITHUB_STEP_SUMMARY
        echo "" >> $GITHUB_STEP_SUMMARY
        echo "🕐 الوقت: $(date)" >> $GITHUB_STEP_SUMMARY
        
        # إضافة تفاصيل الفهرس إذا كان موجوداً
        if [ -f "DramaShorts/index.json" ]; then
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "📈 الإحصائيات:" >> $GITHUB_STEP_SUMMARY
          echo '```json' >> $GITHUB_STEP_SUMMARY
          cat DramaShorts/index.json | jq 'del(.last_updated)' >> $GITHUB_STEP_SUMMARY 2>/dev/null || echo "لا يمكن قراءة الفهرس" >> $GITHUB_STEP_SUMMARY
          echo '```' >> $GITHUB_STEP_SUMMARY
        fi
    
    - name: إرسال إشعار Discord (اختياري)
      if: failure()
      uses: sarisia/actions-status-discord@v1
      with:
        webhook: ${{ secrets.DISCORD_WEBHOOK }}
        title: "❌ فشل في استخراج الدراما"
        description: "فشل job استخراج فيديوهات الدراما"
        color: 0xFF0000
    
    - name: إشعار النجاح (اختياري)
      if: success()
      uses: sarisia/actions-status-discord@v1
      with:
        webhook: ${{ secrets.DISCORD_WEBHOOK }}
        title: "✅ تم استخراج الدراما بنجاح"
        description: "تم استخراج ${{ steps.extract.outputs.videos }} فيديو دراما في ${{ steps.extract.outputs.count }} ملف"
        color: 0x00FF00
