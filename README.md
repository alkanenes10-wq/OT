# YKS Takip

YKS öğrencilerinin akademik (haftalık program, konu takibi) ve psikolojik (uyku, erteleme, kaygı, enerji, motivasyon…) takibi için mobil uyumlu web uygulaması. Telefona uygulama gibi eklenebilir, bilgisayardan da açılır.

## Dosyalar

Tüm dosyalar tek düzeydedir, alt klasör yoktur. Vercel derleme sırasında `hazirla.mjs` betiği uygulama dosyalarını otomatik olarak `app` klasörüne yerleştirir; bu yüzden GitHub'a nasıl yüklediğin önemli değildir.

- `schema.sql` → Supabase'de **bir kez** çalıştırılacak veritabanı dosyası
- `guncelleme-2.sql`, `guncelleme-3.sql` → mevcut kurulumlar için güncelleme dosyaları
- `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `hazirla.mjs` → ayar dosyaları
- Diğer `.tsx / .ts / .css / .png` dosyaları → uygulamanın kendisi

## Kurulum

### 1) Supabase

1. <https://supabase.com> → **New project** → bölge: **Central EU (Frankfurt)**.
2. **SQL Editor → New query** → `schema.sql` dosyasının tamamını yapıştır → **Run** ("Success").
3. **Authentication → Sign In / Providers** → **Allow new users to sign up: KAPALI** → Save.
4. **Project Settings → API Keys** bölümünden şunları kopyala: **Project URL**, **Publishable key**, **Secret key** (eski projelerde: *anon* ve *service_role*).

### 2) GitHub

1. <https://github.com/new> → yeni bir **Private** depo oluştur (veya mevcut depoyu kullan).
2. **Add file → Upload files** → zip'ten çıkan klasördeki **tüm dosyaları** seç (Ctrl+A) ve yükle → **Commit changes**.
   Mevcut depoya yüklüyorsan aynı adlı dosyaların üzerine yazılır; Vercel otomatik olarak yeniden derler.

### 3) Vercel

1. **Add New… → Project** → depoyu **Import** et.
2. **Environment Variables**:

   | Ad | Değer |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key (veya *anon*) |
   | `SUPABASE_SECRET_KEY` | Secret key (veya *service_role*) — gizli |
   | `SETUP_SECRET` | Kendi belirlediğin uzun bir parola |
   | `NEXT_PUBLIC_APP_NAME` | *(isteğe bağlı)* Uygulama adı |

3. **Deploy**. Değişkenleri sonradan değiştirirsen **Deployments → Redeploy**.

### 4) İlk giriş ve öğrenciler

1. Vercel adresini aç → giriş sayfasındaki **"Danışman hesabı oluştur"** → `SETUP_SECRET` + bilgilerin. (Yalnızca bir kez yapılır.)
2. **Yeni öğrenci** → ad veya kod (ör. `ÖĞR-001`), kullanıcı adı (ör. `ogr001`), şifre → **Mesajı kopyala** ile öğrenciye gönder.
3. Telefona ekleme — iPhone: Safari → **Paylaş → Ana Ekrana Ekle**. Android: Chrome → **⋮ → Uygulamayı yükle**.

## Güncelleme 2 — yeni haftalık program ve deneme analizi

Bu sürümü mevcut kuruluma yüklerken **bir kez** şunu yap: Supabase → SQL Editor → `guncelleme-2.sql` dosyasının tamamını yapıştır → **Run**. (Veri silmez.) Sonra tüm dosyaları GitHub'a yükle.

- **Program → Tablo:** Excel gibi; ders × gün. Hücreye tıkla → konu, görev türü (Soru / Konu / Tekrar / Deneme), hedef soru. Üst satırda her günün **müsaitliği** (Kapalı / Hafif / Normal / Yoğun).
- **Denemeler sekmesi:** kazanım karnesini (PDF) yükle; netler ve konu konu yanlış/boş sayıları otomatik okunur (gerekirse elle düzeltilir).
- **Otomatik program oluştur:** son denemedeki yanlış/boşlara ve müsait günlere göre her öncelikli konu için kısa konu tekrarı + soru çözümü dağıtır, günlük/haftalık hedef soruyu hesaplar. Sonra tabloda istediğin gibi düzenlersin. Soru hedefleri ve konu başına üst sınır `planner.ts` içinde.
- **Otomatik konu takibi:** görev tamamlanınca (ya da öğrenci hedef soru sayısına ulaşınca) konu takibi güncellenir: Konu → Bitti, Soru → Çalışılıyor, Tekrar → Tekrar edildi. Hiçbir zaman geri almaz.

## Güncelleme 4 — çalışma saatleri ve saatli program

Bu sürümü yüklerken **bir kez**: Supabase → SQL Editor → `guncelleme-3.sql` dosyasının tamamını yapıştır → **Run** (veri silmez). Sonra tüm dosyaları GitHub'a yükle (yeni dosya: `schedule.tsx`).

- **Saatler sekmesi (danışman):** Her gün için çalışma saat aralıkları (ör. 17:00–19:30, 20:00–22:00), blok süresi (varsayılan 40 dk) ve mola (10 dk). Öğrenci bu saatleri Program sayfasında yalnızca görür.
- **Otomatik program:** Saatler bloklara bölünür; her blok bir konu. Bloklar **bir sayısal, bir sözel** sırasıyla dizilir (istersen 2 sayısal–1 sözel / 1 sayısal–2 sözel).
- **Alana göre dersler** (TYT dahil): SAY → Mat, Geo, Fizik, Kimya, Biyoloji (+ Türkçe); EA → Mat, Geo, Türkçe, Edebiyat, Tarih, Coğrafya; SÖZ → Türkçe, Edebiyat, Tarih, Coğrafya, Felsefe, Din (+ TYT Mat). Oluştururken ders kutucuklarından değiştirilebilir. Liste: `lib.ts` → `FIELD_SECTIONS`.
- **TYT ve AYT ayrı:** son TYT ve son AYT denemesi ayrı seçilir; bloklar TYT/AYT oranına göre dağılır (11. sınıf varsayılan TYT %70, 12/mezun %50).
- **Önceki programlar:** geçen haftadan tamamlanmayan konular öne alınır, geçen hafta konu çalışması yapılan konulara bu hafta soru verilir, uzun süredir görülmeyen bitmiş konular tekrar edilir, her dersin sıradaki başlanmamış konusu "yeni konu" olarak eklenir.
- Aynı haftaya yeniden oluşturursan tamamlanmamış görevler silinip yenisi yazılır, tamamlananlar kalır. Sayısal dersler tabloda mavi, sözel dersler turuncu çizgiyle gösterilir.

## Güncelleme 3 — karne kodla okunur

SQL çalıştırmaya gerek yok. Tüm dosyaları GitHub'a yükle (yeni dosya: `karne.ts`). Vercel'de daha önce `ANTHROPIC_API_KEY` eklediysen artık kullanılmıyor, silebilirsin.

## Otomatik karne analizi (kodla, yapay zekâsız)

Karne PDF'i sunucuda **kodla** okunur (`karne.ts`); hiçbir yapay zekâ servisi veya ek API anahtarı kullanılmaz, karne dışarıya gönderilmez.

Nasıl çalışır:

1. PDF'in metin katmanı konum bilgisiyle okunur (`unpdf`).
2. **D / Y / B** (Doğru / Yanlış / Boş) sütun başlıkları bulunur, alttaki satırlardaki sayılar sütunlara eşlenir. Başlık yoksa *soru = doğru + yanlış + boş* kuralını sağlayan sayı dizisi aranır. Soru soru listelenen karnelerde satırdaki durum (D/Y/B, ✓/✗ veya cevap anahtarı ≠ öğrenci cevabı) kullanılır.
3. Satırdaki kazanım metni, uygulamanın konu listesi + eş anlamlılar (`SYNONYMS`) ile eşleştirilir; ders başlığı (Türkçe, Temel Matematik…) bağlam olarak kullanılır.
4. Bölüm net satırları (Türkçe 40 30 8 2 …) netlere, yanlış/boş sayıları konulara yazılır ve program oluşturma penceresi açılır.

Kullanım: Öğrenci → **Denemeler** → **Kazanım karnesini yükle** → birkaç saniye → **Programı oluştur**. Yükleme sonrası "Okuma raporu"nda eşleşmeyen satırlar listelenir; sonuçlar ve program her zaman düzenlenebilir.

Sınırlar: Yalnızca yayınevinin verdiği **orijinal (metin içeren) PDF** okunur. Fotoğraf veya taranmış PDF kodla okunamaz → "Karnesiz elle giriş". Bir yayınevinin ifadesi eşleşmiyorsa `karne.ts` içindeki `SYNONYMS` listesine ifadeyi ekle (ör. `"tyt-matematik.problemler": [..., "yeni ifade"]`).

## Özelleştirme

GitHub'da dosyayı düzenleyip kaydettiğinde Vercel otomatik yeniden yayınlar.

- Program ders satırları, uyarı eşikleri (`THRESHOLDS`): `lib.ts`
- Konu listeleri: `curriculum.ts` (konu **adını** değiştirirsen o konudaki eski ilerleme eşleşmez)
- Renkler: `globals.css`
- Alan adı: Vercel → **Settings → Domains**

## Güvenlik ve KVKK

- Veritabanı kuralları (RLS): öğrenci yalnızca kendi verisini, danışman yalnızca kendi öğrencilerini görür. Danışman notlarını öğrenci hiçbir koşulda göremez.
- `SUPABASE_SECRET_KEY` yalnızca sunucuda (Vercel) kullanılır; anahtarları hiçbir dosyaya yazıp GitHub'a yükleme.
- Öğrenci adı yerine kod kullanabilirsin. **Hesap → Öğrenciyi sil** tüm verileri kalıcı olarak siler.
- Supabase sunucuları Türkiye dışında (Frankfurt) olduğundan bu, KVKK'da yurt dışına aktarım sayılabilir; aydınlatma metni / veli onayında belirtmen önerilir (kesin değerlendirme için hukukçuya danış).

## Sorun giderme

| Belirti | Çözüm |
|---|---|
| Vercel: *Couldn't find any pages or app directory* | Depoda `hazirla.mjs` ve güncel `package.json` yok → tüm dosyaları tekrar yükle |
| Vercel: *[hazirla] EKSİK DOSYA: …* | Adı yazılan dosyayı depoya yükle |
| "Kurulum tamamlanmamış" ekranı | Vercel ortam değişkenleri eksik → ekle ve **Redeploy** |
| "Veritabanı tabloları bulunamadı" | `schema.sql` Supabase'de çalıştırılmamış |
| Öğrenci eklerken *Invalid API key* | `SUPABASE_SECRET_KEY` yerine legacy **service_role** anahtarını dene |
| Supabase projesi duraklatıldı | Ücretsiz plan 1 hafta kullanılmayınca durur → Supabase panelinden **Restore** |
