const fs = require('fs');
const path = require('path');
const https = require('https');
const { parse } = require('node-html-parser');

class LaroozaExtractor {
    constructor() {
        this.outputDir = 'Ramadan';
        this.outputFile = 'kj.json';
        this.historyFile = 'extracted_history.json';
        this.baseUrl = 'https://z.larooza.life';
        this.extractedHistory = new Set();
        
        // ⬇️⬇️⬇️ إضافة هذا المتغير ⬇️⬇️⬇️
        this.maxEpisodesPerRun = 5; // الحد الأقصى للحلقات في كل مرة
        
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
        
        this.loadExtractionHistory();
        
        this.userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ];
        
        this.requestDelay = 1000;
        this.timeout = 20000;
    }

    // ... (بقية الدوال تبقى كما هي بدون تغيير)

    async start(url = 'https://z.larooza.life/category.php?cat=ramadan-2026') {
        console.log('🚀 بدء استخراج الحلقات من موقع لاروزا');
        console.log(`🌐 الدومين: ${this.baseUrl}`);
        console.log(`📁 سيتم الحفظ في: ${this.outputDir}/${this.outputFile}`);
        console.log(`📝 سجل الاستخراج: ${this.extractedHistory.size} حلقة مستخرجة سابقاً`);
        console.log(`🔗 الرابط: ${url}`);
        // ⬇️⬇️⬇️ إضافة هذا السطر ⬇️⬇️⬇️
        console.log(`⏰ الحد الأقصى للحلقات في هذه الجولة: ${this.maxEpisodesPerRun}\n`);
        
        try {
            console.log('📥 جاري تحميل الصفحة الرئيسية...');
            const html = await this.fetchUrl(url);
            
            if (!html) {
                console.log('❌ فشل تحميل الصفحة');
                return;
            }
            
            console.log('🔍 جاري استخراج الحلقات من الصفحة...');
            const root = parse(html);
            const allEpisodes = this.extractAllEpisodesFromPage(root, url);
            
            if (allEpisodes.length === 0) {
                console.log('❌ لم يتم العثور على حلقات في الصفحة');
                await this.saveOnlyNewEpisodes([]);
                return;
            }
            
            console.log(`📊 وجدت ${allEpisodes.length} حلقة في الصفحة`);
            
            // 3. تصفية الحلقات الجديدة فقط
            const newEpisodes = this.filterNewEpisodes(allEpisodes);
            
            console.log(`🆕 ${newEpisodes.length} حلقة جديدة (لم تستخرج من قبل)`);
            
            if (newEpisodes.length === 0) {
                console.log('⚠️ لا توجد حلقات جديدة للاستخراج');
                await this.saveOnlyNewEpisodes([]);
                return;
            }
            
            // ⬇️⬇️⬇️ إضافة هذا الشرط للحد من الحلقات ⬇️⬇️⬇️
            let episodesToProcess = newEpisodes;
            if (newEpisodes.length > this.maxEpisodesPerRun) {
                console.log(`⚠️ عدد الحلقات الجديدة (${newEpisodes.length}) يتجاوز الحد المسموح (${this.maxEpisodesPerRun})`);
                episodesToProcess = newEpisodes.slice(0, this.maxEpisodesPerRun);
                console.log(`📌 سيتم استخراج أول ${this.maxEpisodesPerRun} حلقة فقط في هذه الجولة`);
                console.log(`📌 باقي الحلقات (${newEpisodes.length - this.maxEpisodesPerRun}) ستتم معالجتها في المرات القادمة`);
            }
            
            // 4. استخراج التفاصيل للحلقات المحدودة فقط
            console.log(`\n🔍 جاري استخراج تفاصيل ${episodesToProcess.length} حلقة...`);
            const detailedEpisodes = await this.extractDetailsForEpisodes(episodesToProcess);
            
            // 5. حفظ الحلقات المحدودة فقط
            await this.saveOnlyNewEpisodes(detailedEpisodes);
            
            // 6. تحديث سجل الاستخراج
            const newIds = detailedEpisodes.map(ep => ep.id).filter(id => id);
            if (newIds.length > 0) {
                this.saveExtractionHistory(newIds);
                
                // ⬇️⬇️⬇️ إضافة رسالة معلومات إضافية ⬇️⬇️⬇️
                if (newEpisodes.length > this.maxEpisodesPerRun) {
                    const remaining = newEpisodes.length - this.maxEpisodesPerRun;
                    console.log(`\n📌 ملاحظة: لا يزال هناك ${remaining} حلقة جديدة لم تتم معالجتها`);
                    console.log(`📌 قم بتشغيل البرنامج مرة أخرى لاستخراج المزيد من الحلقات`);
                }
            }
            
            console.log('\n🎉 تم الانتهاء بنجاح!');
            
        } catch (error) {
            console.error('❌ حدث خطأ:', error.message);
        }
    }

    // ... (بقية الدوال تبقى كما هي)

    // حفظ الحلقات الجديدة فقط
    async saveOnlyNewEpisodes(newEpisodes) {
        const filePath = path.join(this.outputDir, this.outputFile);
        
        try {
            console.log(`\n💾 جاري حفظ ${newEpisodes.length} حلقة جديدة في ${this.outputFile}...`);
            
            const formattedEpisodes = newEpisodes.map(episode => ({
                id: episode.id || '',
                title: episode.title,
                image: episode.image,
                link: episode.link,
                duration: episode.duration,
                description: episode.description,
                servers: episode.servers,
                videoUrl: episode.videoUrl,
                extracted_at: new Date().toISOString()
            }));
            
            const dataToSave = {
                metadata: {
                    total_new_episodes: formattedEpisodes.length,
                    last_updated: new Date().toISOString(),
                    site: this.baseUrl,
                    file_name: this.outputFile,
                    source_url: 'https://z.larooza.life/category.php?cat=ramadan-2026',
                    note: 'يحتوي فقط على الحلقات الجديدة التي لم تستخرج من قبل',
                    total_in_history: this.extractedHistory.size,
                    // ⬇️⬇️⬇️ إضافة معلومات عن الحد الأقصى ⬇️⬇️⬇️
                    max_episodes_per_run: this.maxEpisodesPerRun,
                    next_run_info: formattedEpisodes.length < this.maxEpisodesPerRun ? 
                        'كل الحلقات الجديدة تمت معالجتها' : 
                        'يوجد المزيد من الحلقات لمعالجتها في المرة القادمة'
                },
                episodes: formattedEpisodes
            };
            
            fs.writeFileSync(filePath, JSON.stringify(dataToSave, null, 2), 'utf8');
            
            if (formattedEpisodes.length > 0) {
                console.log(`✅ تم حفظ ${formattedEpisodes.length} حلقة جديدة في ${this.outputFile}`);
                console.log(`📅 تاريخ التحديث: ${dataToSave.metadata.last_updated}`);
                console.log(`📊 حجم الملف: ${Math.round(fs.statSync(filePath).size / 1024)} كيلوبايت`);
            } else {
                console.log(`💾 تم حفظ ملف فارغ (لا توجد حلقات جديدة)`);
            }
            
        } catch (error) {
            console.error('❌ خطأ في حفظ الملف:', error.message);
        }
    }
}

// تشغيل الملف مباشرة
if (require.main === module) {
    const extractor = new LaroozaExtractor();
    
    // ⬇️⬇️⬇️ السماح بتحديد الحد الأقصى من سطر الأوامر ⬇️⬇️⬇️
    let customMax = 5; // القيمة الافتراضية
    
    // التحقق إذا كان هناك معامل مخصص
    process.argv.forEach((arg, index) => {
        if (arg.startsWith('--max=')) {
            const value = parseInt(arg.split('=')[1]);
            if (!isNaN(value) && value > 0) {
                customMax = value;
            }
        } else if (arg === '-m' && process.argv[index + 1]) {
            const value = parseInt(process.argv[index + 1]);
            if (!isNaN(value) && value > 0) {
                customMax = value;
            }
        }
    });
    
    // تعيين الحد الأقصى المخصص
    extractor.maxEpisodesPerRun = customMax;
    
    const url = process.argv[2] || 'https://z.larooza.life/category.php?cat=ramadan-2026';
    
    console.log(`⚙️  الإعدادات: الحد الأقصى للحلقات = ${extractor.maxEpisodesPerRun}`);
    
    extractor.start(url)
        .then(() => {
            console.log('\n✨ تم الانتهاء من العملية بنجاح!');
            console.log(`📂 الملف النهائي: ${extractor.outputDir}/${extractor.outputFile}`);
            console.log(`📝 سجل الاستخراج: ${extractor.outputDir}/${extractor.historyFile}`);
            console.log(`🔢 تم استخراج ${extractor.maxEpisodesPerRun} حلقة كحد أقصى`);
            process.exit(0);
        })
        .catch(error => {
            console.error('\n💥 فشلت العملية:', error.message);
            process.exit(1);
        });
}

module.exports = LaroozaExtractor;
